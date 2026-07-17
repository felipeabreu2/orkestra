import { nextEdgeStyle, type EdgeStyle } from '../edges/edgeStyle'
import { noteText } from '../notes/noteText'
import type { CrossProjectNode } from '../../../shared/crossProjectIndex'

export interface PaletteItem {
  id: string
  label: string
  kind: 'action' | 'node' | 'context' | 'connect' | 'disconnect'
  // Texto extra indexado pela busca (T2): para notas, o corpo INTEIRO (não truncado), enquanto o
  // `label` segue curto para exibição. `rankItems` casa nome OU corpo, com bônus para o nome.
  searchText?: string
  // Batuta T5: presente em itens de OUTRO projeto (índice cross-projeto). O `run` já troca de
  // projeto antes de focar; o campo fica exposto para a UI diferenciar/rotular se quiser.
  projectId?: string
  run?: () => void
  input?: { placeholder: string; initial: string; submit: (value: string) => void }
  ask?: { nodeId: string; label: string }
}
export interface PaletteNode {
  id: string
  type?: string
  data?: Record<string, unknown>
  selected?: boolean
}
export interface PaletteEdge {
  id: string
  source: string
  target: string
}
export interface PaletteActions {
  addTerminalNode: () => void
  addNoteNode: () => void
  addPortalNode: () => void
  addFileTreeNode: () => void
  focusNode: (id: string) => void
  removeNode: (id: string) => void
  renameTerminal: (id: string, name: string) => void
  setTerminalRole: (id: string, role: string) => void
  connect: (source: string, target: string) => void
  removeEdge: (id: string) => void
  addSshTerminal: (host: string) => void
  // R5: alterna o estilo global de conexão (curva <-> circuito).
  toggleEdgeStyle: () => void
  // R6: remove todas as conexões de um nó de uma vez.
  removeEdgesForNode: (nodeId: string) => void
  // T4: ações globais já existentes no app (hoje só na Topbar), expostas também na paleta. O
  // cabeamento real vive no CommandPalette.tsx (abre a pasta ativa no editor externo; dispara a
  // criação de projeto). `openInEditor` é no-op silencioso sem pasta vinculada (mesmo padrão do SSH
  // inválido), então não precisa de contexto extra aqui.
  openInEditor: () => void
  newProject: () => void
  // Batuta T5: abrir um nó de OUTRO projeto — troca o projeto ativo e, quando o canvas do alvo
  // estiver montado, foca o nó. O cabeamento (flush + switch + hydrate + frame) vive no
  // CommandPalette/ProjectsSidebar; aqui só a intenção.
  openNodeInProject: (projectId: string, nodeId: string) => void
}
export interface PaletteContext {
  nodes: PaletteNode[]
  edges: PaletteEdge[]
  selectedNodes: PaletteNode[]
  // R5: estilo de conexão atual, só para compor o rótulo do item de alternância. Opcional
  // (default 'curva') — é puramente cosmético, então testes que não o informam seguem válidos.
  edgeStyle?: string
  // Batuta T5: nós dos projetos NÃO-ativos (índice cross-projeto, read-only do main). Opcional —
  // sem ele, a paleta busca só o canvas atual (comportamento pré-T5, testes seguem válidos).
  crossProjectNodes?: CrossProjectNode[]
  actions: PaletteActions
}

export function nodeLabel(n: PaletteNode): string {
  if (n.type === 'terminal') return (n.data?.name as string) || 'Terminal'
  if (n.type === 'portal') return (n.data?.name as string) || 'Portal'
  if (n.type === 'note') {
    // O corpo real da nota vive em `data.html` (TipTap) — `noteText` centraliza a extração (e o
    // fallback para o `data.content` das notas antigas).
    const c = noteText(n.data).replace(/\s+/g, ' ').trim()
    return c ? `Nota: ${c.slice(0, 24)}` : 'Nota'
  }
  if (n.type === 'filetree') return 'Arquivos'
  if (n.type === 'group') return 'Grupo'
  return n.type || 'Nó'
}

function connected(edges: PaletteEdge[], a: string, b: string): boolean {
  return edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a))
}

export function buildPaletteItems(ctx: PaletteContext): PaletteItem[] {
  const { nodes, edges, selectedNodes, actions } = ctx
  const edgeStyle = ctx.edgeStyle ?? 'corda'
  const items: PaletteItem[] = [
    { id: 'action:terminal', label: 'Criar Terminal', kind: 'action', run: actions.addTerminalNode },
    { id: 'action:note', label: 'Criar Nota', kind: 'action', run: actions.addNoteNode },
    { id: 'action:portal', label: 'Criar Portal', kind: 'action', run: actions.addPortalNode },
    { id: 'action:filetree', label: 'Criar Árvore de Arquivos', kind: 'action', run: actions.addFileTreeNode },
    // T4: ações globais já existentes no app (reusam os handlers da Topbar via CommandPalette.tsx).
    { id: 'action:editor', label: 'Abrir no editor de código', kind: 'action', run: actions.openInEditor },
    { id: 'action:project', label: 'Novo projeto', kind: 'action', run: actions.newProject }
  ]

  // R5: alterna o estilo de conexão. O rótulo mostra a direção da troca (estado atual -> próximo).
  items.push({
    id: 'action:edgestyle',
    label: `Estilo de conexão: ${edgeStyle} → ${nextEdgeStyle(edgeStyle as EdgeStyle)}`,
    kind: 'action',
    run: actions.toggleEdgeStyle
  })

  // Fase 27 (Task 4): "Criar terminal SSH remoto" é uma ação global (não depende de seleção),
  // igual às 4 acima, mas pede um valor (destino) — por isso usa `input` em vez de `run`, o mesmo
  // mecanismo já usado por renomear/definir papel (Fase 23). O submit chama `addSshTerminal` com
  // o texto digitado; a validação de formato (isValidSshHost) e o addTerminalNode({sshHost}) ficam
  // no lado do CommandPalette (Task 4 Step 2), não aqui — esta função só monta a lista.
  items.push({
    id: 'action:ssh',
    label: 'Criar terminal SSH remoto',
    kind: 'action',
    input: {
      placeholder: 'destino (ex.: user@host ou alias do ~/.ssh/config)',
      initial: '',
      submit: (v) => actions.addSshTerminal(v)
    }
  })

  for (const n of selectedNodes) {
    const name = nodeLabel(n)
    items.push({ id: `ctx:focus:${n.id}`, label: `Focar ${name}`, kind: 'context', run: () => actions.focusNode(n.id) })
    items.push({ id: `ctx:remove:${n.id}`, label: `Remover ${name}`, kind: 'context', run: () => actions.removeNode(n.id) })
    // R6: só oferece "remover todas as conexões" quando o nó realmente tem alguma edge.
    if (edges.some((e) => e.source === n.id || e.target === n.id)) {
      items.push({
        id: `ctx:disconnectall:${n.id}`,
        label: `Remover todas as conexões de ${name}`,
        kind: 'disconnect',
        run: () => actions.removeEdgesForNode(n.id)
      })
    }
    if (n.type === 'terminal') {
      items.push({
        id: `ctx:rename:${n.id}`,
        label: `Renomear ${name}`,
        kind: 'context',
        input: { placeholder: 'Novo nome', initial: (n.data?.name as string) || '', submit: (v) => actions.renameTerminal(n.id, v) }
      })
      items.push({
        id: `ctx:role:${n.id}`,
        label: `Definir papel de ${name}`,
        kind: 'context',
        input: { placeholder: 'Papel (ex.: Revisor)', initial: (n.data?.role as string) || '', submit: (v) => actions.setTerminalRole(n.id, v) }
      })
      items.push({
        id: `ctx:ask:${n.id}`,
        label: `Perguntar ao agente ${name}`,
        kind: 'context',
        ask: { nodeId: n.id, label: name }
      })
    }
    for (const other of nodes) {
      if (other.id === n.id) continue
      if (connected(edges, n.id, other.id)) continue
      items.push({
        id: `connect:${n.id}:${other.id}`,
        label: `Conectar ${name} → ${nodeLabel(other)}`,
        kind: 'connect',
        run: () => actions.connect(n.id, other.id)
      })
    }
    for (const e of edges) {
      if (e.source !== n.id && e.target !== n.id) continue
      const otherId = e.source === n.id ? e.target : e.source
      const other = nodes.find((x) => x.id === otherId)
      items.push({
        id: `disconnect:${n.id}:${e.id}`,
        label: `Desconectar ${name} ↔ ${other ? nodeLabel(other) : otherId}`,
        kind: 'disconnect',
        run: () => actions.removeEdge(e.id)
      })
    }
  }

  for (const n of nodes) {
    const item: PaletteItem = { id: `node:${n.id}`, label: nodeLabel(n), kind: 'node', run: () => actions.focusNode(n.id) }
    // T2: notas indexam o corpo inteiro em `searchText` (o `label` continua truncado por nodeLabel).
    if (n.type === 'note') {
      item.searchText = noteText(n.data)
    }
    items.push(item)
  }

  // Batuta T5: nós de OUTROS projetos, ao final (o projeto ativo já entrou acima, do canvas ao
  // vivo). O nome do projeto vai ANEXADO no label — além de contextualizar, deixa o tie-break do
  // rankItems ("label mais curto vence no empate de score") favorecer naturalmente o nó local
  // (label puro) sobre o homônimo de outro projeto, cumprindo "prioridade ao projeto atual" sem
  // tocar no rankItems. Selecionar troca de projeto e então foca (openNodeInProject).
  for (const cn of ctx.crossProjectNodes ?? []) {
    items.push({
      id: `xnode:${cn.projectId}:${cn.nodeId}`,
      label: `${cn.label} · ${cn.projectName}`,
      kind: 'node',
      searchText: cn.searchText,
      projectId: cn.projectId,
      run: () => actions.openNodeInProject(cn.projectId, cn.nodeId)
    })
  }
  return items
}
