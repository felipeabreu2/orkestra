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
    removeEdge: vi.fn()
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
    const disc = items.find((i) => i.kind === 'disconnect')
    expect(disc?.label).toContain('B')
    disc?.run?.()
    expect(actions.removeEdge).toHaveBeenCalledWith('e1')
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

  it('desconectar tem id único quando ambos os endpoints estão selecionados', () => {
    const a = { id: 't1', type: 'terminal', data: { name: 'A' }, selected: true }
    const b = { id: 't2', type: 'terminal', data: { name: 'B' }, selected: true }
    const edges = [{ id: 'e1', source: 't1', target: 't2' }]
    const items = buildPaletteItems({ nodes: [a, b], edges, selectedNodes: [a, b], actions: noopActions() })
    const discIds = items.filter((i) => i.kind === 'disconnect').map((i) => i.id)
    expect(new Set(discIds).size).toBe(discIds.length) // todos únicos
  })
})
