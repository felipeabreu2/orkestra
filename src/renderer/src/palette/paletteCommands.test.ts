// @vitest-environment jsdom
// jsdom porque o rótulo/indexação de nota derivam o texto do `data.html` via `htmlToText`
// (DOMParser inerte, SEC-1) — o mesmo caminho da produção.
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
    removeEdgesForNode: vi.fn(),
    openInEditor: vi.fn(),
    newProject: vi.fn()
  }
}

describe('nodeLabel', () => {
  it('usa o nome do terminal, senão o tipo', () => {
    expect(nodeLabel({ id: 't1', type: 'terminal', data: { name: 'Dev' } })).toBe('Dev')
    expect(nodeLabel({ id: 'n1', type: 'note', data: {} })).toContain('Nota')
  })

  // A nota real guarda o corpo em `data.html` (TipTap) — nunca em `data.content`. O rótulo tem que
  // mostrar a prévia a partir do html, senão TODA nota aparece como "Nota" sem prévia.
  it('nota: prévia derivada do data.html (shape real de produção)', () => {
    expect(nodeLabel({ id: 'n1', type: 'note', data: { html: '<p>Plano de deploy</p>', color: undefined } })).toBe(
      'Nota: Plano de deploy'
    )
  })

  it('nota: cai em data.content quando não há html (nota legada)', () => {
    expect(nodeLabel({ id: 'n1', type: 'note', data: { content: 'legado' } })).toBe('Nota: legado')
  })

  it('nota: nota vazia (html: "") continua "Nota"', () => {
    expect(nodeLabel({ id: 'n1', type: 'note', data: { html: '', color: undefined } })).toBe('Nota')
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

  // T4 — ações globais já existentes no app expostas na paleta (reusam callbacks reais do Topbar):
  // "Abrir no editor de código" e "Novo projeto", ambas kind 'action' (nenhum kind novo).
  it('expõe "Abrir no editor de código" como ação global e run aciona openInEditor', () => {
    const actions = noopActions()
    const items = buildPaletteItems({ nodes: [], edges: [], selectedNodes: [], actions })
    const editor = items.find((i) => i.id === 'action:editor')
    expect(editor?.label).toBe('Abrir no editor de código')
    expect(editor?.kind).toBe('action')
    editor?.run?.()
    expect(actions.openInEditor).toHaveBeenCalled()
  })

  it('expõe "Novo projeto" como ação global e run aciona newProject', () => {
    const actions = noopActions()
    const items = buildPaletteItems({ nodes: [], edges: [], selectedNodes: [], actions })
    const project = items.find((i) => i.id === 'action:project')
    expect(project?.label).toBe('Novo projeto')
    expect(project?.kind).toBe('action')
    project?.run?.()
    expect(actions.newProject).toHaveBeenCalled()
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
    expect(itemCircuito?.label).toContain('circuito → corda')

    const corda = buildPaletteItems({ nodes: [], edges: [], selectedNodes: [], edgeStyle: 'corda', actions: noopActions() })
    const itemCorda = corda.find((i) => i.id === 'action:edgestyle')
    expect(itemCorda?.label).toContain('corda → curva')

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
    const note = { id: 'n1', type: 'note', data: { html: '<p>oi</p>', color: undefined }, selected: true }
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

  // T2: o item de navegação de uma nota carrega o corpo INTEIRO em searchText (para a busca
  // fuzzy indexar o conteúdo), mantendo o label curto (truncado por nodeLabel).
  //
  // O shape é o REAL: `data.html` (o que addNoteNode/updateNoteHtml produzem). O teste antigo
  // fabricava `data.content`, um shape que a produção nunca gera — ficava verde enquanto a busca
  // pelo corpo estava quebrada para toda nota de verdade.
  it('item node de nota indexa o corpo inteiro em searchText (label segue truncado)', () => {
    const content =
      'reunião sobre kubernetes e deploy contínuo — precisamos revisar o pipeline de CI e os manifests do cluster de produção'
    const note = { id: 'n1', type: 'note', data: { html: `<p>${content}</p>`, color: undefined } }
    const items = buildPaletteItems({ nodes: [note], edges: [], selectedNodes: [], actions: noopActions() })
    const item = items.find((i) => i.id === 'node:n1')
    expect(item?.label.startsWith('Nota: ')).toBe(true)
    expect(item?.label.length).toBeLessThanOrEqual('Nota: '.length + 24)
    expect(item?.searchText).toContain('kubernetes')
    expect(item?.searchText).toContain('produção')
    expect(item?.searchText).toBe(content)
  })

  // Retrocompat: nota antiga (pré-TipTap) ainda indexa pelo `data.content`.
  it('item node de nota legada (data.content) ainda indexa o corpo', () => {
    const note = { id: 'n1', type: 'note', data: { content: 'anotação legada sobre kubernetes' } }
    const items = buildPaletteItems({ nodes: [note], edges: [], selectedNodes: [], actions: noopActions() })
    expect(items.find((i) => i.id === 'node:n1')?.searchText).toBe('anotação legada sobre kubernetes')
  })

  // T2: tipos que não são nota não recebem searchText (só notas indexam corpo).
  it('nós não-nota não recebem searchText', () => {
    const term = { id: 't1', type: 'terminal', data: { name: 'A' } }
    const items = buildPaletteItems({ nodes: [term], edges: [], selectedNodes: [], actions: noopActions() })
    const item = items.find((i) => i.id === 'node:t1')
    expect(item?.searchText).toBeUndefined()
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
