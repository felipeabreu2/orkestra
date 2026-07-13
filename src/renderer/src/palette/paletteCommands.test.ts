import { describe, it, expect, vi } from 'vitest'
import { buildPaletteItems, nodeLabel, type PaletteActions } from './paletteCommands'

function noopActions(): PaletteActions {
  return {
    addTerminalNode: vi.fn(),
    addNoteNode: vi.fn(),
    addPortalNode: vi.fn(),
    addFileTreeNode: vi.fn(),
    focusNode: vi.fn(),
    removeNode: vi.fn(),
    renameTerminal: vi.fn(),
    setTerminalRole: vi.fn(),
    connect: vi.fn(),
    removeEdge: vi.fn(),
    addSshTerminal: vi.fn(),
    toggleEdgeStyle: vi.fn(),
    removeEdgesForNode: vi.fn()
  }
}

describe('nodeLabel', () => {
  it('usa o nome do terminal, senão o tipo', () => {
    expect(nodeLabel({ id: 't1', type: 'terminal', data: { name: 'Dev' } })).toBe('Dev')
    expect(nodeLabel({ id: 'n1', type: 'note', data: {} })).toContain('Nota')
  })
})

describe('buildPaletteItems', () => {
  it('sempre inclui as 4 ações globais de criação', () => {
    const items = buildPaletteItems({ nodes: [], edges: [], selectedNodes: [], actions: noopActions() })
    const labels = items.map((i) => i.label)
    expect(labels).toContain('Criar Terminal')
    expect(labels).toContain('Criar Nota')
    expect(labels).toContain('Criar Portal')
    expect(labels).toContain('Criar Árvore de Arquivos')
  })

  it('item global "Criar terminal SSH remoto" tem input e input.submit aciona addSshTerminal', () => {
    const actions = noopActions()
    const items = buildPaletteItems({ nodes: [], edges: [], selectedNodes: [], actions })
    const ssh = items.find((i) => i.id === 'action:ssh')
    expect(ssh?.label).toBe('Criar terminal SSH remoto')
    expect(ssh?.input).toBeTruthy()
    ssh?.input?.submit('user@host')
    expect(actions.addSshTerminal).toHaveBeenCalledWith('user@host')
  })

  it('sem seleção, não há itens de contexto/connect/disconnect', () => {
    const nodes = [{ id: 't1', type: 'terminal', data: { name: 'A' } }]
    const items = buildPaletteItems({ nodes, edges: [], selectedNodes: [], actions: noopActions() })
    expect(items.some((i) => i.kind === 'context')).toBe(false)
    expect(items.some((i) => i.kind === 'connect')).toBe(false)
  })

  it('terminal selecionado gera focar, remover, renomear (com input) e definir papel (com input)', () => {
    const t = { id: 't1', type: 'terminal', data: { name: 'A', role: '' }, selected: true }
    const actions = noopActions()
    const items = buildPaletteItems({ nodes: [t], edges: [], selectedNodes: [t], actions })
    const rename = items.find((i) => i.id.startsWith('ctx:rename:'))
    expect(rename?.input).toBeTruthy()
    rename?.input?.submit('Novo')
    expect(actions.renameTerminal).toHaveBeenCalledWith('t1', 'Novo')
    const role = items.find((i) => i.id.startsWith('ctx:role:'))
    expect(role?.input).toBeTruthy()
    expect(items.some((i) => i.id === 'ctx:focus:t1')).toBe(true)
    expect(items.some((i) => i.id === 'ctx:remove:t1')).toBe(true)
  })

  it('oferece conectar a outros nós ainda não conectados, e não a si mesmo', () => {
    const a = { id: 't1', type: 'terminal', data: { name: 'A' }, selected: true }
    const b = { id: 't2', type: 'terminal', data: { name: 'B' } }
    const actions = noopActions()
    const items = buildPaletteItems({ nodes: [a, b], edges: [], selectedNodes: [a], actions })
    const connect = items.find((i) => i.kind === 'connect')
    expect(connect?.label).toContain('B')
    connect?.run?.()
    expect(actions.connect).toHaveBeenCalledWith('t1', 't2')
    // não conecta a si mesmo
    expect(items.some((i) => i.id === 'connect:t1:t1')).toBe(false)
  })

  it('não oferece conectar a um nó já conectado; oferece desconectar a edge existente', () => {
    const a = { id: 't1', type: 'terminal', data: { name: 'A' }, selected: true }
    const b = { id: 't2', type: 'terminal', data: { name: 'B' } }
    const edges = [{ id: 'e1', source: 't1', target: 't2' }]
    const actions = noopActions()
    const items = buildPaletteItems({ nodes: [a, b], edges, selectedNodes: [a], actions })
    expect(items.some((i) => i.kind === 'connect')).toBe(false)
    // Busca pelo id específico da edge: a mesma seleção também gera o item R6 "remover todas as
    // conexões" (kind 'disconnect'), então um find por kind poderia pegar o item errado.
    const disc = items.find((i) => i.id === 'disconnect:t1:e1')
    expect(disc?.label).toContain('B')
    disc?.run?.()
    expect(actions.removeEdge).toHaveBeenCalledWith('e1')
  })

  // R5: item global de alternância do estilo de conexão, com rótulo dependente do estado atual.
  it('inclui o item de alternar estilo de conexão, com rótulo pela direção da troca', () => {
    const curva = buildPaletteItems({ nodes: [], edges: [], selectedNodes: [], edgeStyle: 'curva', actions: noopActions() })
    const itemCurva = curva.find((i) => i.id === 'action:edgestyle')
    expect(itemCurva?.label).toContain('curva → circuito')

    const actions = noopActions()
    const circuito = buildPaletteItems({ nodes: [], edges: [], selectedNodes: [], edgeStyle: 'circuito', actions })
    const itemCircuito = circuito.find((i) => i.id === 'action:edgestyle')
    expect(itemCircuito?.label).toContain('circuito → curva')
    itemCircuito?.run?.()
    expect(actions.toggleEdgeStyle).toHaveBeenCalled()
  })

  // R6: "remover todas as conexões" só aparece quando o nó selecionado tem alguma edge.
  it('oferece "remover todas as conexões" só quando o nó selecionado tem edges', () => {
    const a = { id: 't1', type: 'terminal', data: { name: 'A' }, selected: true }
    const b = { id: 't2', type: 'terminal', data: { name: 'B' } }
    // sem edges: não aparece
    const semEdges = buildPaletteItems({ nodes: [a, b], edges: [], selectedNodes: [a], actions: noopActions() })
    expect(semEdges.some((i) => i.id === 'ctx:disconnectall:t1')).toBe(false)
    // com edge tocando t1: aparece e aciona removeEdgesForNode
    const actions = noopActions()
    const comEdges = buildPaletteItems({
      nodes: [a, b],
      edges: [{ id: 'e1', source: 't1', target: 't2' }],
      selectedNodes: [a],
      actions
    })
    const item = comEdges.find((i) => i.id === 'ctx:disconnectall:t1')
    expect(item?.label).toContain('A')
    item?.run?.()
    expect(actions.removeEdgesForNode).toHaveBeenCalledWith('t1')
  })

  it('nó não-terminal selecionado não oferece renomear/definir papel', () => {
    const note = { id: 'n1', type: 'note', data: { content: 'oi' }, selected: true }
    const items = buildPaletteItems({ nodes: [note], edges: [], selectedNodes: [note], actions: noopActions() })
    expect(items.some((i) => i.id.startsWith('ctx:rename:'))).toBe(false)
    expect(items.some((i) => i.id.startsWith('ctx:role:'))).toBe(false)
    expect(items.some((i) => i.id === 'ctx:focus:n1')).toBe(true)
    expect(items.some((i) => i.id === 'ctx:remove:n1')).toBe(true)
  })

  it('nodeLabel cobre portal, filetree, group e fallback', () => {
    expect(nodeLabel({ id: 'p', type: 'portal', data: {} })).toBe('Portal')
    expect(nodeLabel({ id: 'p', type: 'portal', data: { name: 'Docs' } })).toBe('Docs')
    expect(nodeLabel({ id: 'f', type: 'filetree', data: {} })).toBe('Arquivos')
    expect(nodeLabel({ id: 'g', type: 'group', data: {} })).toBe('Grupo')
    expect(nodeLabel({ id: 'x', type: undefined, data: {} })).toBe('Nó')
  })

  it('terminal selecionado oferece "Perguntar ao agente" com o alvo', () => {
    const t = { id: 't1', type: 'terminal', data: { name: 'A' }, selected: true }
    const items = buildPaletteItems({ nodes: [t], edges: [], selectedNodes: [t], actions: noopActions() })
    const ask = items.find((i) => i.id === 'ctx:ask:t1')
    expect(ask?.ask).toEqual({ nodeId: 't1', label: 'A' })
  })

  it('nó não-terminal não oferece perguntar ao agente', () => {
    const note = { id: 'n1', type: 'note', data: {}, selected: true }
    const items = buildPaletteItems({ nodes: [note], edges: [], selectedNodes: [note], actions: noopActions() })
    expect(items.some((i) => i.id.startsWith('ctx:ask:'))).toBe(false)
  })

  it('desconectar tem id único quando ambos os endpoints estão selecionados', () => {
    const a = { id: 't1', type: 'terminal', data: { name: 'A' }, selected: true }
    const b = { id: 't2', type: 'terminal', data: { name: 'B' }, selected: true }
    const edges = [{ id: 'e1', source: 't1', target: 't2' }]
    const items = buildPaletteItems({ nodes: [a, b], edges, selectedNodes: [a, b], actions: noopActions() })
    const discIds = items.filter((i) => i.kind === 'disconnect').map((i) => i.id)
    expect(new Set(discIds).size).toBe(discIds.length) // todos únicos
  })
})
