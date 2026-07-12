export interface PaletteItem {
  id: string
  label: string
  kind: 'action' | 'node' | 'context' | 'connect' | 'disconnect'
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
}
export interface PaletteContext {
  nodes: PaletteNode[]
  edges: PaletteEdge[]
  selectedNodes: PaletteNode[]
  actions: PaletteActions
}

export function nodeLabel(n: PaletteNode): string {
  if (n.type === 'terminal') return (n.data?.name as string) || 'Terminal'
  if (n.type === 'portal') return (n.data?.name as string) || 'Portal'
  if (n.type === 'note') {
    const c = ((n.data?.content as string) || '').trim().replace(/\s+/g, ' ')
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
  const items: PaletteItem[] = [
    { id: 'action:terminal', label: 'Criar Terminal', kind: 'action', run: actions.addTerminalNode },
    { id: 'action:note', label: 'Criar Nota', kind: 'action', run: actions.addNoteNode },
    { id: 'action:portal', label: 'Criar Portal', kind: 'action', run: actions.addPortalNode },
    { id: 'action:filetree', label: 'Criar Árvore de Arquivos', kind: 'action', run: actions.addFileTreeNode }
  ]

  for (const n of selectedNodes) {
    const name = nodeLabel(n)
    items.push({ id: `ctx:focus:${n.id}`, label: `Focar ${name}`, kind: 'context', run: () => actions.focusNode(n.id) })
    items.push({ id: `ctx:remove:${n.id}`, label: `Remover ${name}`, kind: 'context', run: () => actions.removeNode(n.id) })
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
    items.push({ id: `node:${n.id}`, label: nodeLabel(n), kind: 'node', run: () => actions.focusNode(n.id) })
  }
  return items
}
