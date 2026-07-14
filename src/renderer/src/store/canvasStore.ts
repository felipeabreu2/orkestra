import { create } from 'zustand'
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection
} from '@xyflow/react'
import type { CanvasSnapshot, PersistedNode } from '../../../shared/canvasSnapshot'
import { deriveEdgeKind, type EdgeKind } from '../edges/edgeKind'
import { loadEdgeStyle, saveEdgeStyle, type EdgeStyle } from '../edges/edgeStyle'
import { loadSidebarCollapsed, saveSidebarCollapsed } from '../ui/sidebarCollapsed'
import { basename } from '../ui/paths'

let terminalSeq = 1
let portalSeq = 1

// ===== Clipboard de widgets (auditoria 2026-07-14) =====
// Vive no MÓDULO (não no state): sobrevive à troca de projeto — o renderer não recarrega ao
// trocar, só re-hidrata o canvas — viabilizando copiar num projeto e colar em outro. Guarda o
// shape PERSISTIDO (mesmas regras do serialize), nunca referências vivas de Node: colar duas
// vezes não pode compartilhar objetos internos (ex.: scene do Excalidraw). Não persiste entre
// sessões do app (v1).
interface WidgetClipboard {
  nodes: PersistedNode[]
  edges: Array<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>
}
let widgetClipboard: WidgetClipboard | null = null
// REN-8 (auditoria 2026-07-14): quantas vezes o clipboard atual já foi colado sem posição (Cmd+V)
// — cada colagem consecutiva desloca +32px a mais que a anterior, em vez de empilhar todas no mesmo
// ponto. Zerado a cada nova cópia (copyNodes).
let pasteCount = 0

// Menu de contexto usa para habilitar/desabilitar "Colar aqui" (lido no momento do clique —
// não precisa ser reativo).
export function hasWidgetClipboard(): boolean {
  return widgetClipboard !== null && widgetClipboard.nodes.length > 0
}

// Clone profundo via JSON: todo dado de nó já é JSON-serializável por construção (é assim que o
// canvas persiste em disco), e isso evita depender de structuredClone no ambiente de teste.
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// Converte um Node vivo no shape persistido — mesmas regras do serialize() (autostart é efêmero
// e nunca sai da sessão em que o nó nasceu; parentId/extent só quando presentes). Compartilhado
// por serialize() e pelo clipboard de widgets.
function persistNode(n: Node): PersistedNode {
  const rest = { ...((n.data ?? {}) as Record<string, unknown>) }
  delete rest.autostart
  const persisted: PersistedNode = {
    id: n.id,
    type: n.type ?? 'terminal',
    position: n.position,
    width: n.width ?? 480,
    height: n.height ?? 320,
    data: rest
  }
  if (n.parentId) persisted.parentId = n.parentId
  if (n.extent === 'parent') persisted.extent = 'parent'
  return persisted
}

// Captura os nós de `ids` (grupos levam os filhos junto) + as edges cujas DUAS pontas foram
// capturadas. Filho copiado SEM seu grupo vira top-level: posição absolutizada (a position de um
// filho é relativa ao topo-esquerda do grupo) e parentId/extent removidos — colar um nó avulso
// não pode apontar para um grupo que não veio. Preserva a ordem do array de state (grupo antes
// dos filhos, exigência do React Flow).
function captureWidgets(nodes: Node[], edges: Edge[], ids: string[]): WidgetClipboard {
  const wanted = new Set(ids)
  for (const n of nodes) {
    if (n.parentId && wanted.has(n.parentId)) wanted.add(n.id)
  }
  const captured: PersistedNode[] = []
  for (const n of nodes) {
    if (!wanted.has(n.id)) continue
    const p = persistNode(n)
    if (p.parentId && !wanted.has(p.parentId)) {
      const group = nodes.find((g) => g.id === p.parentId)
      if (group) p.position = { x: p.position.x + group.position.x, y: p.position.y + group.position.y }
      delete p.parentId
      delete p.extent
    }
    captured.push(p)
  }
  const capturedIds = new Set(captured.map((p) => p.id))
  const capturedEdges = edges
    .filter((e) => capturedIds.has(e.source) && capturedIds.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle }))
  return cloneJson({ nodes: captured, edges: capturedEdges })
}

// Materializa o conteúdo do clipboard como nós/edges NOVOS: ids novos (pty/portal/partition são
// por id de nó — um terminal colado nasce com shell próprio, nunca "rouba" o pty do original),
// edges internas remapeadas, kind recomputado (mesma regra do hydrate). `position` (menu "Colar
// aqui") ancora o topo-esquerda do conjunto; sem ela, desloca +32/+32 do original (duplicar).
// Nomes que colidem com nós já existentes ganham sufixo " (cópia)" — o orq resolve
// terminais/portais por nome, e duplicatas silenciosas quebrariam esse direcionamento.
function materializeWidgets(
  clip: WidgetClipboard,
  existing: Node[],
  position?: { x: number; y: number },
  // REN-8: nº de passos de 32px do deslocamento quando NÃO há posição (Cmd+V). O caller incrementa
  // a cada colagem consecutiva do MESMO clipboard, senão todas empilham exatamente no mesmo ponto.
  offsetStep = 1
): { nodes: Node[]; edges: Edge[] } {
  const src = cloneJson(clip)
  const idMap = new Map<string, string>()
  for (const p of src.nodes) idMap.set(p.id, `${p.type}-${crypto.randomUUID()}`)
  const top = src.nodes.filter((p) => !p.parentId)
  const minX = Math.min(...top.map((p) => p.position.x))
  const minY = Math.min(...top.map((p) => p.position.y))
  const base = position ?? { x: minX + 32 * offsetStep, y: minY + 32 * offsetStep }
  const usedNames = new Set(
    existing
      .map((n) => (n.data as { name?: string } | undefined)?.name)
      .filter((name): name is string => typeof name === 'string' && name !== '')
  )
  const nodes: Node[] = src.nodes.map((p) => {
    const data = { ...p.data }
    // REN-7 (auditoria 2026-07-14): remapeia o link de portal (data.linkedTo) para o id NOVO se o
    // portal-fonte veio junto no lote; senão desfaz o link — manter o id original faria a cópia
    // compartilhar a sessão/cookies (partition persist:) do original, ou apontar para um nó
    // inexistente ao colar noutro projeto.
    if (typeof data.linkedTo === 'string') {
      const remapped = idMap.get(data.linkedTo)
      if (remapped) data.linkedTo = remapped
      else delete data.linkedTo
    }
    // REN-9 (auditoria 2026-07-14): registra SEMPRE o nome final em usedNames (não só quando de fato
    // renomeia). Assim duas cópias com o MESMO nome dentro do próprio lote também desambiguam — o orq
    // resolve terminal/portal por nome, e dois nomes iguais fariam os comandos mirarem o errado.
    if (typeof data.name === 'string' && data.name) {
      let name = data.name
      if (usedNames.has(name)) {
        let candidate = `${name} (cópia)`
        for (let i = 2; usedNames.has(candidate); i++) candidate = `${name} (cópia ${i})`
        name = candidate
      }
      data.name = name
      usedNames.add(name)
    }
    const node: Node = {
      id: idMap.get(p.id)!,
      type: p.type,
      // Filho de grupo copiado junto: position segue relativa ao grupo (que também foi remapeado).
      position: p.parentId ? p.position : { x: base.x + (p.position.x - minX), y: base.y + (p.position.y - minY) },
      data,
      width: p.width,
      height: p.height,
      selected: true
    }
    if (p.parentId) {
      node.parentId = idMap.get(p.parentId)
      node.extent = 'parent'
    }
    // Mesma exigência de groupSelected: sem dragHandle, qualquer clique no corpo do grupo
    // arrastaria o grupo inteiro.
    if (p.type === 'group') node.dragHandle = '.ork-group-header'
    return node
  })
  const edges: Edge[] = src.edges.map((e) => {
    const source = idMap.get(e.source)!
    const target = idMap.get(e.target)!
    const kind: EdgeKind = deriveEdgeKind(
      nodes.find((n) => n.id === source)?.type,
      nodes.find((n) => n.id === target)?.type
    )
    return {
      id: `e-${crypto.randomUUID()}`,
      source,
      target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: 'typed',
      data: { kind },
      className: `ork-edge--${kind}`
    }
  })
  return { nodes, edges }
}

// Resolve a posição ABSOLUTA de um nó, somando a posição de cada grupo ancestral (a position de um
// filho de grupo é relativa ao pai, é assim que o React Flow posiciona filhos). Percorre a cadeia
// parentId com guarda contra ciclos; grupos aninhados (raros, mas alcançáveis) resolvem corretamente.
// REN-2/REN-6 (auditoria 2026-07-14): groupSelected/ungroup/arrange precisam de coordenadas absolutas
// — usar n.position cru mistura sistemas de referência quando a seleção inclui filhos de grupo, e o
// layout salta (e é persistido errado).
function absolutePosition(node: Node, byId: Map<string, Node>): { x: number; y: number } {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

// Versão para o Canvas (que tem o array de nós, não o Map) — usada por toPosNodes ao alimentar o
// arrange com posições absolutas.
export function absolutePositionOf(node: Node, nodes: Node[]): { x: number; y: number } {
  return absolutePosition(node, new Map(nodes.map((n) => [n.id, n])))
}

// REN-4 (auditoria 2026-07-14): janela de coalescing. Sem ela, o coalescing por tag não expira —
// editar uma nota, passar tempo arrastando nós ou trabalhando no terminal (nada que resete a tag)
// e voltar a editar a MESMA nota fundia os dois períodos num único passo, e um Cmd+Z apagava tudo
// desde o primeiro caractere (sem redo). Com a janela, edições de mesma tag só coalescem se forem
// consecutivas dentro de COALESCE_MS uma da outra (janela deslizante: cada tecla renova o prazo);
// uma pausa maior inicia um novo passo de undo. Date.now() é permitido no renderer (não é script de
// workflow). Módulo-level, como terminalSeq/pasteCount — o store é singleton.
const COALESCE_MS = 1000
let lastCommitTime = 0

// Onda 4 (undo): patch de histórico aplicado INLINE dentro do set de cada mutação estrutural —
// empilha o snapshot atual (antes da mutação) em `past`, com cap de 50. Com `tag`, coalesce (dentro
// da janela acima): devolve {} — nada é empilhado, então a sequência vira um único passo de undo.
// Sem `tag`, cada chamada é um passo discreto.
function histPatch(
  state: { past: Array<{ nodes: Node[]; edges: Edge[] }>; lastCommitTag: string | null; nodes: Node[]; edges: Edge[] },
  tag?: string
): { past: Array<{ nodes: Node[]; edges: Edge[] }>; lastCommitTag: string | null } | Record<string, never> {
  const now = Date.now()
  if (tag && tag === state.lastCommitTag && now - lastCommitTime < COALESCE_MS) {
    lastCommitTime = now // janela deslizante: renova o prazo a cada edição contínua
    return {}
  }
  lastCommitTime = now
  return { past: [...state.past, { nodes: state.nodes, edges: state.edges }].slice(-50), lastCommitTag: tag ?? null }
}

interface CanvasState {
  nodes: Node[]
  edges: Edge[]
  // true enquanto uma troca de projeto está em voo (flush→switch→hydrate em ProjectsSidebar) —
  // usado por useCanvasPersistence para suspender o autosave debounced nessa janela, senão um
  // timer de 500ms pendente do projeto ANTIGO pode disparar depois que o main já setou o projeto
  // NOVO como ativo e gravar o conteúdo errado por cima do arquivo do projeto novo (Fase 15 Task 3).
  switching: boolean
  setSwitching: (v: boolean) => void
  // Fix de corrupção cross-project (2026-07-14): id do projeto DONO do conteúdo atualmente em
  // memória — a fonte que o autosave/flush usa para salvar por id explícito (projects.saveCanvas),
  // nunca mais "no projeto ativo do main no momento da escrita". Atualizado ATOMICAMENTE junto com
  // nodes/edges pelo hydrate(snapshot, projectId): num mesmo set() do zustand não existe janela em
  // que o conteúdo de A esteja em memória com o id de B — qualquer flush em qualquer instante
  // grava o conteúdo no arquivo certo. null = ainda não sabemos o dono (boot antes do load) →
  // autosave fica desligado (não salvar é sempre mais seguro que salvar no lugar errado).
  activeProjectId: string | null
  setActiveProjectId: (id: string | null) => void
  // Fase 30: caminho (cwd) do projeto ativo, exibido na barra superior. Setado pela
  // ProjectsSidebar ao carregar/trocar de projeto (o cwd vive no ProjectManager, no main).
  activeCwd: string | null
  setActiveCwd: (cwd: string | null) => void
  // R5 (estilo de conexão): 'curva' (bezier, padrão) ou 'circuito' (trilhos ortogonais). Preferência
  // global de UI lida por TypedEdge — inicializada de localStorage (loadEdgeStyle) e persistida por
  // setEdgeStyle. Efêmera do ponto de vista do canvas: NÃO entra em serialize()/hydrate().
  edgeStyle: EdgeStyle
  setEdgeStyle: (style: EdgeStyle) => void
  // Onda 1 (F01): sidebar de projetos colapsada. Fonte única — lida pela ProjectsSidebar (render)
  // e pela Topbar (botão de painel). Persistida em localStorage (ui/sidebarCollapsed). Efêmera do
  // ponto de vista do canvas: NÃO entra em serialize()/hydrate().
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean) => void
  toggleSidebar: () => void
  // Fase 20 (Task 2): indicador de "atenção do agente" — ids de nós (terminal) cujo agente
  // produziu output e depois ficou ocioso (watcher no AgentBus do main, avisado via
  // window.orkestra.onAgentAttention em Canvas.tsx). Puramente efêmero/UI: nunca serializado
  // (não entra em serialize()/hydrate(), ao contrário de data.* dos nós). setAttention SEMPRE
  // atribui uma NOVA instância de Set (nunca muta a existente) — zustand compara referência, e
  // mutar um Set no lugar não dispararia re-render em nenhum componente que o selecione.
  attention: Set<string>
  setAttention: (nodeId: string, on: boolean) => void
  addTerminalNode: (
    position?: { x: number; y: number } | undefined,
    // Fase 27 (Task 3): sshHost opcional — quando presente, o nó nasce em modo SSH (ver
    // TerminalNode.tsx). String livre aqui (a validação de formato via isValidSshHost já
    // acontece no main, no spawn — Task 2); a UI de criação (Task 4) valida antes por UX.
    opts?: { preset?: string; role?: string; name?: string; sshHost?: string; monitor?: boolean }
  ) => void
  addNoteNode: (position?: { x: number; y: number }, opts?: { width?: number; height?: number }) => void
  addPortalNode: (
    position?: { x: number; y: number } | undefined,
    opts?: { name?: string; url?: string; width?: number; height?: number }
  ) => void
  // Fase 19 (Task 2): nó explorador de arquivos (FileTreeNode) — rootPath opcional na criação
  // (a resolução do default, cwd do projeto ativo, é feita pelo próprio componente no mount, não
  // aqui no store). `updateFileTreeRoot` é usado tanto ao trocar de pasta pelo header do nó
  // quanto ao escolher a primeira pasta (empty state), e persiste via o serialize genérico.
  addFileTreeNode: (
    position?: { x: number; y: number } | undefined,
    opts?: { rootPath?: string; width?: number; height?: number }
  ) => void
  // Onda 7: nó de arquivo (clip) — anexa 1 arquivo (path), ligável a um terminal.
  addFileNode: (
    position?: { x: number; y: number } | undefined,
    opts?: { path?: string; width?: number; height?: number }
  ) => void
  // Onda 7: nó de desenho (Excalidraw). data.scene guarda { elements, appState } da cena.
  addDrawNode: (
    position?: { x: number; y: number } | undefined,
    opts?: { width?: number; height?: number }
  ) => void
  updateDrawScene: (id: string, scene: unknown) => void
  updateNoteContent: (id: string, content: string) => void
  // Onda 5: nota rich-text (TipTap). html = conteúdo do editor; color = cor do post-it (F07).
  // updateNoteContent fica para compatibilidade/migração das notas antigas (Markdown → html).
  updateNoteHtml: (id: string, html: string) => void
  updateNoteColor: (id: string, color: string) => void
  updateTerminalName: (id: string, name: string) => void
  updateTerminalRole: (id: string, role: string) => void
  updatePortalUrl: (id: string, url: string) => void
  updatePortalName: (id: string, name: string) => void
  // Fase 25 (Task 1): "linka" um portal a outro (data.linkedTo = nodeId do portal-fonte) para que
  // ambos compartilhem a mesma partition de sessão (ver portalPartition.ts) — chamar com
  // linkedTo=undefined desfaz o link (portal volta a usar a própria sessão isolada).
  updatePortalLink: (id: string, linkedTo?: string) => void
  updateFileTreeRoot: (id: string, rootPath: string) => void
  removeNode: (id: string) => void
  // Aplica novas posições em lote (Fase 18 Task 2: alinhar/distribuir/organizar em grade nós
  // selecionados). `map` vem de arrange.ts (alignNodes/distributeNodes/gridArrange) — nós cujo
  // id não está no map ficam intocados (permite mexer só num subconjunto, ex.: a seleção atual).
  setNodePositions: (map: Record<string, { x: number; y: number }>) => void
  // Onda 6: maximiza (tamanho grande) ou restaura o tamanho anterior de um nó (guarda em data._restore).
  toggleMaximizeNode: (id: string) => void
  // Grupos (Fase 18 Task 3, React Flow v12 parent/child nodes): groupSelected agrupa 2+ nós
  // `selected` num novo nó type:'group' (posicionado/dimensionado no bbox da seleção), dando a
  // cada filho `parentId`+`extent:'parent'` e reescrevendo sua `position` de absoluta pra
  // relativa ao topo-esquerda do grupo (é assim que o RF renderiza o filho "dentro" do pai).
  // ungroupSelected desfaz: acha o(s) grupo(s) alvo (o próprio nó group selecionado, OU o grupo
  // de um filho selecionado), devolve cada filho pra posição absoluta (soma a posição do grupo)
  // e remove parentId/extent + o nó group. Ambos são no-op seguro se não há o que fazer.
  groupSelected: () => void
  ungroupSelected: () => void
  // Fase 18 Task 3 fix (perda de dados): o React Flow trata grupo+filhos como uma árvore
  // parent/child e cascateia a remoção — um Backspace num grupo selecionado apagaria o grupo E
  // todo o conteúdo dentro dele (terminais/notas/portais) numa tacada só, sem confirmação nem
  // undo. ungroupGroupsById é o antídoto: para cada id em `groupIds` que resolve a um nó
  // type:'group', desfaz o parentesco de cada filho (posição relativa -> absoluta, remove
  // parentId/extent) SEM remover os nós group em si — quem decide remover o(s) container(s) é o
  // caller (Canvas.tsx.onBeforeDelete: ungroupa primeiro, aí deleta só os containers vazios).
  // Diferente de ungroupSelected, não deriva os grupos-alvo da seleção; recebe os ids prontos.
  ungroupGroupsById: (groupIds: string[]) => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  // Fase 22 (Task 1): remove uma edge pelo id — usado pelo badge/UI da edge tipada (Task 2) para
  // desconectar sem passar por onEdgesChange (que espera EdgeChange[] do próprio React Flow).
  removeEdge: (id: string) => void
  // R6: remove de uma vez TODAS as conexões que tocam um nó (como source ou target). Retorna à
  // mesma referência de state quando o nó não tem nenhuma edge (no-op — o Zustand pula o update).
  removeEdgesForNode: (nodeId: string) => void
  // Onda 4: histórico de undo. `past` guarda snapshots {nodes, edges} tirados ANTES de cada
  // mutação estrutural (não de posição/seleção — isso é ruído). `commit(tag)` empurra; edições
  // contínuas com a MESMA tag (ex.: renomear tecla a tecla) coalescem num só passo. `undo`
  // restaura o topo. Efêmero: NÃO entra em serialize()/hydrate(). Desfazer a remoção de um
  // terminal recria o nó, mas com shell novo (o pty já morreu ao remover).
  past: Array<{ nodes: Node[]; edges: Edge[] }>
  lastCommitTag: string | null
  undo: () => void
  // Clipboard de widgets (auditoria 2026-07-14): copia nós por id (grupos levam os filhos) para o
  // clipboard interno do módulo — que sobrevive à troca de projeto, então dá para copiar num
  // projeto e colar em outro. paste materializa com ids NOVOS (terminal colado nasce com shell
  // próprio) e edges internas remapeadas; duplicate = capturar+materializar na hora, sem tocar no
  // clipboard compartilhado. Todos retornam o nº de nós afetados (0 = no-op) para a UI decidir
  // preventDefault/feedback.
  copyNodes: (ids: string[]) => number
  pasteClipboard: (position?: { x: number; y: number }) => number
  duplicateNodes: (ids: string[]) => number
  serialize: () => CanvasSnapshot
  // projectId (opcional): dono do snapshot — quando presente, activeProjectId é atualizado no
  // MESMO set() que troca nodes/edges (ver comentário em activeProjectId). Omitido, preserva o
  // dono atual (ex.: testes que só hidratam conteúdo).
  hydrate: (snapshot: CanvasSnapshot, projectId?: string | null) => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  switching: false,
  setSwitching: (v): void => set({ switching: v }),
  activeProjectId: null,
  setActiveProjectId: (id): void => set({ activeProjectId: id }),
  activeCwd: null,
  setActiveCwd: (cwd): void => set({ activeCwd: cwd }),
  edgeStyle: loadEdgeStyle(),
  setEdgeStyle: (style): void => {
    saveEdgeStyle(style)
    set({ edgeStyle: style })
  },
  sidebarCollapsed: loadSidebarCollapsed(),
  setSidebarCollapsed: (v): void => {
    saveSidebarCollapsed(v)
    set({ sidebarCollapsed: v })
  },
  toggleSidebar: (): void => {
    const next = !get().sidebarCollapsed
    saveSidebarCollapsed(next)
    set({ sidebarCollapsed: next })
  },
  past: [],
  lastCommitTag: null,
  undo: (): void => {
    // PTY-2 (auditoria 2026-07-14): se o undo REMOVE um terminal (existe agora, ausente no snapshot
    // restaurado — ex.: criar um terminal e dar Cmd+Z), mata seu pty. Sem isto, o processo do agente
    // fica órfão vivo (CPU/RAM/tokens), inalcançável. Side-effect ANTES do set (mesmo padrão de
    // removeNode/onNodesChange); guard: window.orkestra ausente nos testes/jsdom.
    const state = get()
    if (state.past.length === 0) return
    const prev = state.past[state.past.length - 1]
    const prevIds = new Set(prev.nodes.map((n) => n.id))
    for (const n of state.nodes) {
      if (n.type === 'terminal' && !prevIds.has(n.id)) window.orkestra?.pty?.killForNode(n.id)
    }
    set({
      nodes: prev.nodes,
      edges: prev.edges,
      past: state.past.slice(0, -1),
      lastCommitTag: null
    })
  },
  attention: new Set(),
  setAttention: (nodeId, on): void =>
    set((state) => {
      const next = new Set(state.attention)
      if (on) next.add(nodeId)
      else next.delete(nodeId)
      return { attention: next }
    }),
  addTerminalNode: (position, opts): void =>
    set((state) => {
      const pos = position ?? { x: 80 + (state.nodes.length % 8) * 40, y: 80 + (state.nodes.length % 8) * 40 }
      return {
        ...histPatch(state),
        nodes: [
          ...state.nodes,
          {
            id: `terminal-${crypto.randomUUID()}`,
            type: 'terminal',
            position: pos,
            data: {
              name: opts?.name ?? `Terminal ${terminalSeq++}`,
              preset: opts?.preset ?? 'shell',
              role: opts?.role ?? '',
              // Fase 27 (Task 3): host remoto (ex.: "user@host") quando o nó nasce em modo SSH;
              // undefined nos terminais locais. Deliberadamente NÃO está na lista de `delete
              // rest.*` do serialize — precisa persistir e sobreviver ao round-trip
              // serialize→hydrate (ao contrário de `autostart`, que é efêmero).
              sshHost: opts?.sshHost,
              // Monitorar atividade (Fase 29): quando false, o indicador de atenção e a
              // notificação do SO NÃO disparam para este terminal. Persiste (default true).
              monitor: opts?.monitor ?? true,
              // Efêmero: nunca deve ser persistido (ver serialize) — sinaliza que este nó acabou
              // de ser criado nesta sessão, para o TerminalNode auto-rodar o comando do preset
              // apenas na criação, nunca ao hidratar de um snapshot salvo (Fase 7 Task 2).
              autostart: true
            },
            width: 480,
            height: 320
          }
        ]
      }
    }),
  addNoteNode: (position = { x: 120, y: 120 }, opts): void =>
    set((state) => ({
      ...histPatch(state),
      nodes: [
        ...state.nodes,
        {
          id: `note-${crypto.randomUUID()}`,
          type: 'note',
          position,
          data: { html: '', color: undefined },
          width: opts?.width ?? 240,
          height: opts?.height ?? 180
        }
      ]
    })),
  addPortalNode: (position, opts): void =>
    set((state) => {
      const pos = position ?? { x: 80 + (state.nodes.length % 8) * 40, y: 80 + (state.nodes.length % 8) * 40 }
      return {
        ...histPatch(state),
        nodes: [
          ...state.nodes,
          {
            id: `portal-${crypto.randomUUID()}`,
            type: 'portal',
            position: pos,
            data: {
              name: opts?.name ?? `Portal ${portalSeq++}`,
              url: opts?.url ?? ''
            },
            width: opts?.width ?? 480,
            height: opts?.height ?? 320
          }
        ]
      }
    }),
  addFileTreeNode: (position, opts): void =>
    set((state) => {
      const pos = position ?? { x: 80 + (state.nodes.length % 8) * 40, y: 80 + (state.nodes.length % 8) * 40 }
      return {
        ...histPatch(state),
        nodes: [
          ...state.nodes,
          {
            id: `filetree-${crypto.randomUUID()}`,
            type: 'filetree',
            position: pos,
            data: {
              name: 'Arquivos',
              rootPath: opts?.rootPath
            },
            width: opts?.width ?? 300,
            height: opts?.height ?? 360
          }
        ]
      }
    }),
  addFileNode: (position, opts): void =>
    set((state) => {
      const pos = position ?? { x: 80 + (state.nodes.length % 8) * 40, y: 80 + (state.nodes.length % 8) * 40 }
      const path = opts?.path
      return {
        ...histPatch(state),
        nodes: [
          ...state.nodes,
          {
            id: `file-${crypto.randomUUID()}`,
            type: 'file',
            position: pos,
            data: { name: path ? basename(path) : 'Arquivo', path },
            width: opts?.width ?? 240,
            height: opts?.height ?? 160
          }
        ]
      }
    }),
  addDrawNode: (position, opts): void =>
    set((state) => {
      const pos = position ?? { x: 80 + (state.nodes.length % 8) * 40, y: 80 + (state.nodes.length % 8) * 40 }
      return {
        ...histPatch(state),
        nodes: [
          ...state.nodes,
          {
            id: `draw-${crypto.randomUUID()}`,
            type: 'draw',
            position: pos,
            data: { scene: undefined },
            width: opts?.width ?? 420,
            height: opts?.height ?? 300
          }
        ]
      }
    }),
  updateDrawScene: (id, scene): void =>
    set((state) => ({
      ...histPatch(state, 'draw:' + id),
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, scene } } : n))
    })),
  updateNoteContent: (id, content): void =>
    set((state) => ({
      ...histPatch(state, 'note:' + id),
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, content } } : n))
    })),
  updateNoteHtml: (id, html): void =>
    set((state) => ({
      ...histPatch(state, 'notehtml:' + id),
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, html } } : n))
    })),
  updateNoteColor: (id, color): void =>
    set((state) => ({
      ...histPatch(state, 'notecolor:' + id),
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, color } } : n))
    })),
  updateTerminalName: (id, name): void =>
    set((state) => ({
      ...histPatch(state, 'rename:' + id),
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, name } } : n))
    })),
  updateTerminalRole: (id, role): void =>
    set((state) => ({
      ...histPatch(state, 'role:' + id),
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, role } } : n))
    })),
  updatePortalUrl: (id, url): void =>
    set((state) => ({
      ...histPatch(state, 'purl:' + id),
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, url } } : n))
    })),
  updatePortalName: (id, name): void =>
    set((state) => ({
      ...histPatch(state, 'pname:' + id),
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, name } } : n))
    })),
  updatePortalLink: (id, linkedTo): void =>
    set((state) => ({
      ...histPatch(state),
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, linkedTo } } : n))
    })),
  updateFileTreeRoot: (id, rootPath): void =>
    set((state) => ({
      ...histPatch(state, 'froot:' + id),
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, rootPath } } : n))
    })),
  removeNode: (id): void => {
    // Fase 31: remover um terminal mata seu pty (ao contrário de trocar de projeto, que o
    // preserva p/ re-attach). Guard: window.orkestra não existe nos testes (jsdom sem preload).
    if (get().nodes.find((n) => n.id === id)?.type === 'terminal') {
      window.orkestra?.pty?.killForNode(id)
    }
    set((state) => {
      // REN-1 (auditoria 2026-07-14): remover um GRUPO por aqui (menu de contexto "Excluir",
      // toolbar, palette — que chamam removeNode direto, sem passar pelo onBeforeDelete do Canvas)
      // precisa DESAGRUPAR os filhos antes. Senão eles ficam com parentId apontando para um grupo
      // inexistente: o React Flow trata a posição relativa como absoluta (o nó salta) e o serialize
      // persiste o parentId órfão, então o defeito volta a cada hydrate. Espelha o onBeforeDelete
      // (caminho Delete): filhos viram top-level com posição absolutizada, o container é removido.
      const target = state.nodes.find((n) => n.id === id)
      let nodes = state.nodes
      if (target?.type === 'group') {
        nodes = nodes.map((n) => {
          if (n.parentId !== id) return n
          const restored: Node = {
            ...n,
            position: { x: n.position.x + target.position.x, y: n.position.y + target.position.y }
          }
          delete restored.parentId
          delete restored.extent
          return restored
        })
      }
      // Fase 20 (Task 2): também remove o id do Set attention. Sem isso, fechar um terminal
      // pulsante pelo × deixaria um id órfão em attention pelo resto da sessão — e o Shift+A
      // (que cicla por attention) poderia panar para esse nó morto / virar um no-op silencioso.
      // Imutável (o zustand compara referência, como em setAttention), mas só realoca uma nova
      // instância de Set quando o id realmente está lá (senão preserva a mesma referência).
      let attention = state.attention
      if (attention.has(id)) {
        attention = new Set(attention)
        attention.delete(id)
      }
      return {
        ...histPatch(state),
        nodes: nodes.filter((n) => n.id !== id),
        edges: state.edges.filter((e) => e.source !== id && e.target !== id),
        attention
      }
    })
  },
  setNodePositions: (map): void =>
    set((state) => {
      // REN-6 (auditoria 2026-07-14): o `map` vem do arrange em coordenadas ABSOLUTAS. Para um nó
      // top-level, absoluto == relativo (aplica direto). Para um filho de grupo, converte o alvo
      // absoluto de volta para relativo ao pai — senão o nó saltaria para dentro/fora do grupo.
      // Também entra no histórico (histPatch): alinhar/distribuir/grade passam a ser desfazíveis.
      const byId = new Map(state.nodes.map((n) => [n.id, n]))
      const nodes = state.nodes.map((n) => {
        const target = map[n.id]
        if (!target) return n
        if (n.parentId) {
          const parent = byId.get(n.parentId)
          const pAbs = parent ? absolutePosition(parent, byId) : { x: 0, y: 0 }
          return { ...n, position: { x: target.x - pAbs.x, y: target.y - pAbs.y } }
        }
        return { ...n, position: target }
      })
      return { ...histPatch(state), nodes }
    }),
  toggleMaximizeNode: (id): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== id) return n
        const data = (n.data ?? {}) as Record<string, unknown>
        const restore = data._restore as { width: number; height: number } | undefined
        if (restore) {
          const rest = { ...data }
          delete rest._restore
          return { ...n, width: restore.width, height: restore.height, data: rest }
        }
        return {
          ...n,
          width: 1000,
          height: 640,
          data: { ...data, _restore: { width: n.width ?? 480, height: n.height ?? 320 } }
        }
      })
    })),
  groupSelected: (): void =>
    set((state) => {
      const selected = state.nodes.filter((n) => n.selected)
      if (selected.length < 2) return state // no-op: devolve a MESMA referência de state, o Zustand pula a atualização
      // REN-2 (auditoria 2026-07-14): bbox e reparent em coordenadas ABSOLUTAS. Se a seleção inclui
      // um filho de grupo (position relativa ao pai antigo), usar n.position cru misturaria sistemas
      // de referência — o novo grupo e os nós saltariam. O novo grupo nasce top-level; cada nó vira
      // filho dele com position relativa ao bbox absoluto (e o parentId antigo é sobrescrito).
      const byId = new Map(state.nodes.map((n) => [n.id, n]))
      const abs = new Map(selected.map((n) => [n.id, absolutePosition(n, byId)]))
      const minX = Math.min(...selected.map((n) => abs.get(n.id)!.x))
      const minY = Math.min(...selected.map((n) => abs.get(n.id)!.y))
      const maxX = Math.max(...selected.map((n) => abs.get(n.id)!.x + (n.width ?? 0)))
      const maxY = Math.max(...selected.map((n) => abs.get(n.id)!.y + (n.height ?? 0)))
      const groupId = `group-${crypto.randomUUID()}`
      const groupNode: Node = {
        id: groupId,
        type: 'group',
        position: { x: minX, y: minY },
        width: maxX - minX,
        height: maxY - minY,
        data: { name: 'Grupo' },
        // Restringe o arraste do NÓ INTEIRO ao cabeçalho (GroupNode.tsx) — sem isso, qualquer
        // clique no corpo do grupo (área não coberta por um filho) arrastaria o grupo inteiro,
        // já que o React Flow só respeita um "drag handle" dedicado quando ele é setado no nó
        // (verificado na fonte de @xyflow/system: sem dragHandle, o filtro do d3-drag aceita
        // qualquer target dentro do wrapper do nó — só setar pointer-events:none no CSS do
        // corpo NÃO basta, pois o wrapper .react-flow__node ainda recebe o evento por trás).
        // Os nós FILHOS (terminal/nota/portal agrupados) não são afetados por nada disso — são
        // elementos irmãos separados no DOM que já ficam por cima do grupo (ordem de pintura:
        // o grupo entra ANTES deles no array, exigido pelo próprio React Flow).
        dragHandle: '.ork-group-header',
        selected: true
      }
      const selectedIds = new Set(selected.map((n) => n.id))
      const rest = state.nodes.map((n) => {
        if (!selectedIds.has(n.id)) return n
        const a = abs.get(n.id)!
        return {
          ...n,
          parentId: groupId,
          extent: 'parent' as const,
          // absoluta -> relativa ao topo-esquerda do grupo (é assim que o RF posiciona filhos)
          position: { x: a.x - minX, y: a.y - minY },
          selected: false
        }
      })
      // O grupo precisa vir ANTES de seus filhos no array (exigência do React Flow).
      return { ...histPatch(state), nodes: [groupNode, ...rest] }
    }),
  ungroupSelected: (): void =>
    set((state) => {
      // Grupo(s)-alvo: o próprio nó group selecionado, OU o grupo de um filho selecionado
      // (clicar num nó dentro do grupo seleciona o FILHO, não o group em si).
      const groupIds = new Set<string>()
      for (const n of state.nodes) {
        if (n.selected && n.type === 'group') groupIds.add(n.id)
        if (n.selected && n.parentId) groupIds.add(n.parentId)
      }
      if (groupIds.size === 0) return state // nada selecionado é agrupável -> no-op seguro
      const groupsById = new Map(
        state.nodes.filter((n) => n.type === 'group' && groupIds.has(n.id)).map((n) => [n.id, n])
      )
      if (groupsById.size === 0) return state // parentId órfão ou seleção não resolve a um group real -> no-op seguro
      // REN-2: restaura à posição ABSOLUTA (resolve toda a cadeia de ancestrais, não só o pai
      // imediato) — cobre grupos aninhados sem o nó saltar. byId inclui o grupo (ainda não filtrado).
      const byId = new Map(state.nodes.map((n) => [n.id, n]))
      const nodes = state.nodes
        .filter((n) => !groupsById.has(n.id)) // remove o(s) nó(s) group
        .map((n) => {
          const group = n.parentId ? groupsById.get(n.parentId) : undefined
          if (!group) return n
          const restored: Node = { ...n, position: absolutePosition(n, byId) }
          delete restored.parentId
          delete restored.extent
          return restored
        })
      return { ...histPatch(state), nodes }
    }),
  ungroupGroupsById: (groupIds): void =>
    set((state) => {
      const targetIds = new Set(groupIds)
      const groupsById = new Map(
        state.nodes.filter((n) => n.type === 'group' && targetIds.has(n.id)).map((n) => [n.id, n])
      )
      if (groupsById.size === 0) return state // nenhum id resolve a um group real -> no-op seguro
      // REN-2: mesma restauração absoluta de ungroupSelected (resolve toda a cadeia de ancestrais).
      const byId = new Map(state.nodes.map((n) => [n.id, n]))
      const nodes = state.nodes.map((n) => {
        const group = n.parentId ? groupsById.get(n.parentId) : undefined
        if (!group) return n // fora dos grupos indicados (ou órfão) -> intocado
        const restored: Node = { ...n, position: absolutePosition(n, byId) }
        delete restored.parentId
        delete restored.extent
        return restored
      })
      // Nota: ao contrário de ungroupSelected, os nós group NÃO são filtrados/removidos aqui —
      // a remoção do container é responsabilidade do caller (ver comentário na interface acima).
      return { nodes }
    }),
  onNodesChange: (changes): void => {
    // Fase 31: um 'remove' (ex.: tecla Delete via React Flow) de um terminal mata seu pty — o ×
    // e a palette já passam por removeNode acima. Guard: window.orkestra ausente nos testes.
    for (const c of changes) {
      if (c.type === 'remove' && get().nodes.find((n) => n.id === c.id)?.type === 'terminal') {
        window.orkestra?.pty?.killForNode(c.id)
      }
    }
    set((state) => {
      // Onda 4: um 'remove' (Delete/Backspace via React Flow) captura um snapshot para o undo.
      // Mudanças de posição/seleção/dimensão NÃO — seriam ruído no histórico.
      const hist = changes.some((c) => c.type === 'remove') ? histPatch(state) : {}
      // REN-5 (auditoria 2026-07-14): um 'remove' por tecla também precisa tirar o id de attention
      // — senão um terminal pulsante deletado com Delete/Backspace deixa um id órfão no Set e o
      // Shift+A cicla para um nó inexistente. removeNode (× / palette) já faz isso; aqui é o
      // caminho equivalente do React Flow.
      const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id)
      let attention = state.attention
      if (removed.some((rid) => attention.has(rid))) {
        attention = new Set(attention)
        for (const rid of removed) attention.delete(rid)
      }
      return { ...hist, nodes: applyNodeChanges(changes, state.nodes), attention }
    })
  },
  onEdgesChange: (changes): void =>
    set((state) => {
      const hist = changes.some((c) => c.type === 'remove') ? histPatch(state) : {}
      return { ...hist, edges: applyEdgeChanges(changes, state.edges) }
    }),
  onConnect: (connection): void =>
    set((state) => {
      // Fase 22 (Task 1): kind deriva dos TIPOS dos nós extremos (não da própria connection),
      // então funciona tanto para o arraste no canvas quanto para o path `orq connect`
      // (useOrchestrationSync.ts chama onConnect com um Connection puro, sem tocar nos nós).
      const sourceType = state.nodes.find((n) => n.id === connection.source)?.type
      const targetType = state.nodes.find((n) => n.id === connection.target)?.type
      const kind: EdgeKind = deriveEdgeKind(sourceType, targetType)
      const edge = { ...connection, type: 'typed', data: { kind }, className: `ork-edge--${kind}` }
      return { ...histPatch(state), edges: addEdge(edge, state.edges) }
    }),
  copyNodes: (ids): number => {
    const state = get()
    const clip = captureWidgets(state.nodes, state.edges, ids)
    if (clip.nodes.length === 0) return 0
    widgetClipboard = clip
    pasteCount = 0 // REN-8: novo clipboard reinicia o deslocamento das colagens
    return clip.nodes.length
  },
  pasteClipboard: (position): number => {
    if (!widgetClipboard || widgetClipboard.nodes.length === 0) return 0
    const clip = widgetClipboard
    // REN-8: "Colar aqui" (com posição) ancora no cursor e não conta para o deslocamento
    // automático; Cmd+V (sem posição) desloca +32px a mais a cada colagem consecutiva.
    const step = position ? 1 : ++pasteCount
    let count = 0
    set((state) => {
      const made = materializeWidgets(clip, state.nodes, position, step)
      count = made.nodes.length
      return {
        ...histPatch(state),
        // Colados entram selecionados; a seleção anterior sai — mesmo comportamento de colar em
        // editores de canvas (o usuário quer mover/agrupar o que acabou de colar).
        nodes: [...state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...made.nodes],
        edges: [...state.edges, ...made.edges]
      }
    })
    return count
  },
  duplicateNodes: (ids): number => {
    let count = 0
    set((state) => {
      const clip = captureWidgets(state.nodes, state.edges, ids)
      if (clip.nodes.length === 0) return state // no-op: mesma referência, o Zustand pula o update
      const made = materializeWidgets(clip, state.nodes)
      count = made.nodes.length
      return {
        ...histPatch(state),
        nodes: [...state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...made.nodes],
        edges: [...state.edges, ...made.edges]
      }
    })
    return count
  },
  removeEdge: (id): void => set((state) => ({ ...histPatch(state), edges: state.edges.filter((e) => e.id !== id) })),
  removeEdgesForNode: (nodeId): void =>
    set((state) => {
      const next = state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
      // Sem nenhuma edge tocando o nó, devolve a MESMA referência (evita re-render à toa).
      if (next.length === state.edges.length) return state
      return { ...histPatch(state), edges: next }
    }),
  serialize: (): CanvasSnapshot => ({
    version: 2,
    // persistNode (helper de módulo, compartilhado com o clipboard de widgets): strip de
    // autostart (efêmero — senão todo reload re-rodaria o comando do preset, Fase 7 Task 2) e
    // parentId/extent só quando presentes (Fase 18 Task 3).
    nodes: get().nodes.map(persistNode),
    edges: get().edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle
    }))
  }),
  hydrate: (snapshot, projectId): void => {
    // Scan hydrated nodes for Terminal/Portal names and update terminalSeq/portalSeq to avoid
    // name collisions with nós criados na sessão atual (mesmo padrão para os dois contadores).
    const hydratedNames = snapshot.nodes
      .map((p) => (p.data as Record<string, unknown>)?.name)
      .filter((name): name is string => typeof name === 'string')
    const maxTerminalNum = Math.max(
      ...hydratedNames.map((name) => {
        const match = name.match(/^Terminal (\d+)$/)
        return match ? parseInt(match[1], 10) : 0
      })
    )
    if (maxTerminalNum > 0) {
      terminalSeq = Math.max(terminalSeq, maxTerminalNum + 1)
    }
    const maxPortalNum = Math.max(
      ...hydratedNames.map((name) => {
        const match = name.match(/^Portal (\d+)$/)
        return match ? parseInt(match[1], 10) : 0
      })
    )
    if (maxPortalNum > 0) {
      portalSeq = Math.max(portalSeq, maxPortalNum + 1)
    }

    const hydratedNodes: Node[] = snapshot.nodes.map((p) => {
      const node: Node = {
        id: p.id,
        type: p.type,
        position: p.position,
        data: p.data,
        width: p.width,
        height: p.height
      }
      // Grupos (Fase 18 Task 3): restaura parentId/extent quando presentes no snapshot — a
      // ordem de p.nodes já vem pai-antes-do-filho (serialize preserva a ordem de get().nodes,
      // que groupSelected já escreve nessa ordem), então o React Flow recebe os nós na ordem
      // que exige sem precisamos reordenar aqui.
      if (p.parentId) node.parentId = p.parentId
      if (p.extent === 'parent') node.extent = 'parent'
      // dragHandle não é persistido (é config de interação, não conteúdo) — re-deriva do tipo,
      // senão um grupo hidratado voltava arrastável pelo corpo inteiro (ver groupSelected).
      if (p.type === 'group') node.dragHandle = '.ork-group-header'
      return node
    })
    // Fase 22 (Task 1): recomputa o kind (não confia em nenhum kind eventualmente salvo no
    // snapshot — a fonte da verdade são sempre os tipos dos nós JÁ hidratados acima) e re-anexa
    // type/data/className, igual ao onConnect. serialize() continua enxuto ({id,source,target}),
    // então isso é puramente derivado na hidratação, nunca persistido.
    // REN-11 (auditoria 2026-07-14): descarta edges órfãs (source/target que não existe entre os nós
    // hidratados) — um snapshot parcialmente corrompido as manteria (kind derivado de undefined), o
    // React Flow avisaria no console a cada render e o serialize as re-persistiria para sempre.
    const nodeIds = new Set(hydratedNodes.map((n) => n.id))
    const hydratedEdges: Edge[] = (snapshot.edges ?? [])
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => {
        const sourceType = hydratedNodes.find((n) => n.id === e.source)?.type
        const targetType = hydratedNodes.find((n) => n.id === e.target)?.type
        const kind: EdgeKind = deriveEdgeKind(sourceType, targetType)
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: 'typed',
        data: { kind },
        className: `ork-edge--${kind}`
      }
    })

    set((state) => ({
      nodes: hydratedNodes,
      edges: hydratedEdges,
      // Onda 4: zera o histórico de undo ao (re)hidratar — cada projeto começa sem passado, senão
      // um Cmd+Z logo após trocar de projeto restauraria nós do projeto anterior.
      past: [],
      lastCommitTag: null,
      // Ids de atenção do projeto anterior seriam órfãos aqui (Shift+A panaria para nó morto) —
      // hidratar começa sempre sem atenção pendente.
      attention: new Set<string>(),
      // Dono do snapshot: atualizado no MESMO set() que troca o conteúdo (ver comentário na
      // interface) — nunca existe janela conteúdo-de-A/id-de-B para um flush pegar no meio.
      activeProjectId: projectId === undefined ? state.activeProjectId : projectId
    }))
  }
}))
