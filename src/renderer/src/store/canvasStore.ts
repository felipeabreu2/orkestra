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

let terminalSeq = 1
let portalSeq = 1

interface CanvasState {
  nodes: Node[]
  edges: Edge[]
  // true enquanto uma troca de projeto está em voo (flush→switch→hydrate em ProjectsSidebar) —
  // usado por useCanvasPersistence para suspender o autosave debounced nessa janela, senão um
  // timer de 500ms pendente do projeto ANTIGO pode disparar depois que o main já setou o projeto
  // NOVO como ativo e gravar o conteúdo errado por cima do arquivo do projeto novo (Fase 15 Task 3).
  switching: boolean
  setSwitching: (v: boolean) => void
  addTerminalNode: (
    position?: { x: number; y: number } | undefined,
    opts?: { preset?: string; role?: string; name?: string }
  ) => void
  addNoteNode: (position?: { x: number; y: number }) => void
  addPortalNode: (
    position?: { x: number; y: number } | undefined,
    opts?: { name?: string; url?: string }
  ) => void
  // Fase 19 (Task 2): nó explorador de arquivos (FileTreeNode) — rootPath opcional na criação
  // (a resolução do default, cwd do projeto ativo, é feita pelo próprio componente no mount, não
  // aqui no store). `updateFileTreeRoot` é usado tanto ao trocar de pasta pelo header do nó
  // quanto ao escolher a primeira pasta (empty state), e persiste via o serialize genérico.
  addFileTreeNode: (
    position?: { x: number; y: number } | undefined,
    opts?: { rootPath?: string }
  ) => void
  updateNoteContent: (id: string, content: string) => void
  updateTerminalName: (id: string, name: string) => void
  updateTerminalRole: (id: string, role: string) => void
  updatePortalUrl: (id: string, url: string) => void
  updatePortalName: (id: string, name: string) => void
  updateFileTreeRoot: (id: string, rootPath: string) => void
  removeNode: (id: string) => void
  // Aplica novas posições em lote (Fase 18 Task 2: alinhar/distribuir/organizar em grade nós
  // selecionados). `map` vem de arrange.ts (alignNodes/distributeNodes/gridArrange) — nós cujo
  // id não está no map ficam intocados (permite mexer só num subconjunto, ex.: a seleção atual).
  setNodePositions: (map: Record<string, { x: number; y: number }>) => void
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
  serialize: () => CanvasSnapshot
  hydrate: (snapshot: CanvasSnapshot) => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  switching: false,
  setSwitching: (v): void => set({ switching: v }),
  addTerminalNode: (position, opts): void =>
    set((state) => {
      const pos = position ?? { x: 80 + (state.nodes.length % 8) * 36, y: 80 + (state.nodes.length % 8) * 36 }
      return {
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
  addNoteNode: (position = { x: 120, y: 120 }): void =>
    set((state) => ({
      nodes: [
        ...state.nodes,
        {
          id: `note-${crypto.randomUUID()}`,
          type: 'note',
          position,
          data: { content: '' },
          width: 240,
          height: 180
        }
      ]
    })),
  addPortalNode: (position, opts): void =>
    set((state) => {
      const pos = position ?? { x: 80 + (state.nodes.length % 8) * 36, y: 80 + (state.nodes.length % 8) * 36 }
      return {
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
            width: 480,
            height: 320
          }
        ]
      }
    }),
  addFileTreeNode: (position, opts): void =>
    set((state) => {
      const pos = position ?? { x: 80 + (state.nodes.length % 8) * 36, y: 80 + (state.nodes.length % 8) * 36 }
      return {
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
            width: 300,
            height: 360
          }
        ]
      }
    }),
  updateNoteContent: (id, content): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, content } } : n))
    })),
  updateTerminalName: (id, name): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, name } } : n))
    })),
  updateTerminalRole: (id, role): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, role } } : n))
    })),
  updatePortalUrl: (id, url): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, url } } : n))
    })),
  updatePortalName: (id, name): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, name } } : n))
    })),
  updateFileTreeRoot: (id, rootPath): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, rootPath } } : n))
    })),
  removeNode: (id): void =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id)
    })),
  setNodePositions: (map): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => (map[n.id] ? { ...n, position: map[n.id] } : n))
    })),
  groupSelected: (): void =>
    set((state) => {
      const selected = state.nodes.filter((n) => n.selected)
      if (selected.length < 2) return state // no-op: devolve a MESMA referência de state, o Zustand pula a atualização
      const minX = Math.min(...selected.map((n) => n.position.x))
      const minY = Math.min(...selected.map((n) => n.position.y))
      const maxX = Math.max(...selected.map((n) => n.position.x + (n.width ?? 0)))
      const maxY = Math.max(...selected.map((n) => n.position.y + (n.height ?? 0)))
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
      const rest = state.nodes.map((n) =>
        selectedIds.has(n.id)
          ? {
              ...n,
              parentId: groupId,
              extent: 'parent' as const,
              // absoluta -> relativa ao topo-esquerda do grupo (é assim que o RF posiciona filhos)
              position: { x: n.position.x - minX, y: n.position.y - minY },
              selected: false
            }
          : n
      )
      // O grupo precisa vir ANTES de seus filhos no array (exigência do React Flow).
      return { nodes: [groupNode, ...rest] }
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
      const nodes = state.nodes
        .filter((n) => !groupsById.has(n.id)) // remove o(s) nó(s) group
        .map((n) => {
          const group = n.parentId ? groupsById.get(n.parentId) : undefined
          if (!group) return n
          const restored: Node = {
            ...n,
            // relativa ao grupo -> absoluta de novo (soma a posição do grupo)
            position: { x: n.position.x + group.position.x, y: n.position.y + group.position.y }
          }
          delete restored.parentId
          delete restored.extent
          return restored
        })
      return { nodes }
    }),
  ungroupGroupsById: (groupIds): void =>
    set((state) => {
      const targetIds = new Set(groupIds)
      const groupsById = new Map(
        state.nodes.filter((n) => n.type === 'group' && targetIds.has(n.id)).map((n) => [n.id, n])
      )
      if (groupsById.size === 0) return state // nenhum id resolve a um group real -> no-op seguro
      const nodes = state.nodes.map((n) => {
        const group = n.parentId ? groupsById.get(n.parentId) : undefined
        if (!group) return n // fora dos grupos indicados (ou órfão) -> intocado
        const restored: Node = {
          ...n,
          // relativa ao grupo -> absoluta de novo (soma a posição do grupo), mesma matemática de ungroupSelected
          position: { x: n.position.x + group.position.x, y: n.position.y + group.position.y }
        }
        delete restored.parentId
        delete restored.extent
        return restored
      })
      // Nota: ao contrário de ungroupSelected, os nós group NÃO são filtrados/removidos aqui —
      // a remoção do container é responsabilidade do caller (ver comentário na interface acima).
      return { nodes }
    }),
  onNodesChange: (changes): void => set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),
  onEdgesChange: (changes): void => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),
  onConnect: (connection): void => set((state) => ({ edges: addEdge(connection, state.edges) })),
  serialize: (): CanvasSnapshot => ({
    version: 2,
    nodes: get().nodes.map((n) => {
      // autostart é efêmero (só vale para a sessão em que o nó foi criado) — nunca deve ir
      // para o snapshot persistido, senão todo reload re-rodaria o comando do preset (Fase 7 Task 2).
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
      // Grupos (Fase 18 Task 3): só presentes em nós que pertencem a um grupo — um nó sem
      // grupo simplesmente omite os dois campos (não persiste `parentId`/`extent: undefined`).
      if (n.parentId) persisted.parentId = n.parentId
      if (n.extent === 'parent') persisted.extent = 'parent'
      return persisted
    }),
    edges: get().edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
  }),
  hydrate: (snapshot): void => {
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

    set({
      nodes: snapshot.nodes.map((p) => {
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
        return node
      }),
      edges: (snapshot.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target }))
    })
  }
}))
