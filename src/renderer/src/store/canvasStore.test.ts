// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore } from './canvasStore'
import type { CanvasSnapshot } from '../../../shared/canvasSnapshot'

beforeEach(() => {
  useCanvasStore.setState({ nodes: [], edges: [], attention: new Set() })
})

describe('canvasStore', () => {
  it('addTerminalNode usa width/height top-level (fonte única)', () => {
    useCanvasStore.getState().addTerminalNode({ x: 10, y: 20 })
    const { nodes } = useCanvasStore.getState()
    expect(nodes[0].type).toBe('terminal')
    expect(nodes[0].position).toEqual({ x: 10, y: 20 })
    expect(nodes[0].width).toBe(480)
    expect(nodes[0].height).toBe(320)
    expect((nodes[0].data as { name?: string }).name).toMatch(/^Terminal \d+$/)
  })

  it('serialize captura id/type/position/width/height/data de cada nó', () => {
    useCanvasStore.getState().addTerminalNode({ x: 5, y: 6 })
    const snap = useCanvasStore.getState().serialize()
    expect(snap.version).toBe(2)
    expect(snap.nodes).toHaveLength(1)
    const n = snap.nodes[0]
    expect(n.type).toBe('terminal')
    expect(n.position).toEqual({ x: 5, y: 6 })
    expect(n.width).toBe(480)
    expect(n.height).toBe(320)
    expect((n.data as { name?: string }).name).toMatch(/^Terminal \d+$/)
    expect(typeof n.id).toBe('string')
  })

  it('hydrate substitui os nós a partir de um snapshot', () => {
    useCanvasStore.getState().addTerminalNode()
    useCanvasStore.getState().hydrate({
      version: 1,
      nodes: [
        { id: 'terminal-x', type: 'terminal', position: { x: 1, y: 2 }, width: 300, height: 200, data: {} }
      ],
      edges: []
    })
    const { nodes } = useCanvasStore.getState()
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('terminal-x')
    expect(nodes[0].position).toEqual({ x: 1, y: 2 })
    expect(nodes[0].width).toBe(300)
    expect(nodes[0].height).toBe(200)
  })

  it('round-trip serialize→hydrate preserva o layout', () => {
    useCanvasStore.getState().addTerminalNode({ x: 7, y: 8 })
    const snap = useCanvasStore.getState().serialize()
    useCanvasStore.getState().hydrate({ version: 1, nodes: [], edges: [] })
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
    useCanvasStore.getState().hydrate(snap)
    const n = useCanvasStore.getState().nodes[0]
    expect(n.position).toEqual({ x: 7, y: 8 })
    expect(n.width).toBe(480)
    expect(n.height).toBe(320)
  })

  it('conteúdo da nota sobrevive ao round-trip serialize→hydrate', () => {
    useCanvasStore.getState().addNoteNode()
    const id = useCanvasStore.getState().nodes[0].id
    useCanvasStore.getState().updateNoteContent(id, 'olá mundo')
    const snap = useCanvasStore.getState().serialize()
    useCanvasStore.getState().hydrate({ version: 1, nodes: [], edges: [] })
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
    useCanvasStore.getState().hydrate(snap)
    const restored = useCanvasStore.getState().nodes.find((n) => n.id === id)
    expect(restored?.data).toEqual({ content: 'olá mundo' })
  })

  it('gera ids únicos entre nós', () => {
    const s = useCanvasStore.getState()
    s.addTerminalNode()
    s.addTerminalNode()
    const { nodes } = useCanvasStore.getState()
    expect(nodes[0].id).not.toBe(nodes[1].id)
  })

  it('removeNode remove o nó pelo id', () => {
    useCanvasStore.getState().addTerminalNode()
    useCanvasStore.getState().addTerminalNode()
    const { nodes: nodesAfterAdd } = useCanvasStore.getState()
    const firstNodeId = nodesAfterAdd[0].id
    const secondNodeId = nodesAfterAdd[1].id
    useCanvasStore.getState().removeNode(firstNodeId)
    const { nodes } = useCanvasStore.getState()
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe(secondNodeId)
  })

  it('removeNode remove as edges conectadas ao nó removido', () => {
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    useCanvasStore.getState().addTerminalNode({ x: 100, y: 0 })
    const [a, b] = useCanvasStore.getState().nodes
    useCanvasStore.getState().onConnect({ source: a.id, target: b.id, sourceHandle: null, targetHandle: null })
    expect(useCanvasStore.getState().edges).toHaveLength(1)
    useCanvasStore.getState().removeNode(a.id)
    const { edges, nodes } = useCanvasStore.getState()
    expect(edges).toHaveLength(0)
    expect(nodes).toHaveLength(1)
  })

  it('onNodesChange aplica mudança de posição', () => {
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    const id = useCanvasStore.getState().nodes[0].id
    useCanvasStore.getState().onNodesChange([
      { id, type: 'position', position: { x: 50, y: 60 } }
    ])
    expect(useCanvasStore.getState().nodes[0].position).toEqual({ x: 50, y: 60 })
  })

  it('onConnect adiciona uma edge entre dois nós', () => {
    const s = useCanvasStore.getState()
    s.addTerminalNode({ x: 0, y: 0 })
    s.addTerminalNode({ x: 100, y: 0 })
    const [a, b] = useCanvasStore.getState().nodes
    useCanvasStore.getState().onConnect({ source: a.id, target: b.id, sourceHandle: null, targetHandle: null })
    const { edges } = useCanvasStore.getState()
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe(a.id)
    expect(edges[0].target).toBe(b.id)
  })

  it('addNoteNode adiciona um nó note com content vazio', () => {
    useCanvasStore.getState().addNoteNode({ x: 5, y: 5 })
    const n = useCanvasStore.getState().nodes.find((x) => x.type === 'note')!
    expect(n).toBeTruthy()
    expect(n.data).toEqual({ content: '' })
    expect(n.width).toBe(240)
    expect(n.height).toBe(180)
  })

  it('updateNoteContent atualiza o content de uma nota', () => {
    useCanvasStore.getState().addNoteNode()
    const id = useCanvasStore.getState().nodes[0].id
    useCanvasStore.getState().updateNoteContent(id, 'olá')
    expect(useCanvasStore.getState().nodes[0].data).toEqual({ content: 'olá' })
  })

  it('serialize emite version 2 com nodes e edges', () => {
    const s = useCanvasStore.getState()
    s.addTerminalNode({ x: 0, y: 0 })
    s.addTerminalNode({ x: 1, y: 1 })
    const [a, b] = useCanvasStore.getState().nodes
    useCanvasStore.getState().onConnect({ source: a.id, target: b.id, sourceHandle: null, targetHandle: null })
    const snap = useCanvasStore.getState().serialize()
    expect(snap.version).toBe(2)
    expect(snap.nodes).toHaveLength(2)
    expect(snap.edges).toHaveLength(1)
    expect(snap.edges[0]).toMatchObject({ source: a.id, target: b.id })
  })

  it('addTerminalNode nomeia sequencialmente e updateTerminalName renomeia', () => {
    useCanvasStore.getState().addTerminalNode()
    const id = useCanvasStore.getState().nodes[0].id
    expect((useCanvasStore.getState().nodes[0].data as { name?: string }).name).toMatch(/Terminal/)
    useCanvasStore.getState().updateTerminalName(id, 'Dev')
    expect((useCanvasStore.getState().nodes[0].data as { name?: string }).name).toBe('Dev')
  })

  it('hydrate restaura nodes e edges; snapshot v1 sem edges vira []', () => {
    // v1 (sem edges) — simula um canvas.json da Fase 3. Requer, no topo do arquivo:
    //   import type { CanvasSnapshot } from '../../../shared/canvasSnapshot'
    useCanvasStore.getState().hydrate({
      version: 1,
      nodes: [{ id: 'terminal-1', type: 'terminal', position: { x: 0, y: 0 }, width: 480, height: 320, data: {} }]
    } as unknown as CanvasSnapshot)
    expect(useCanvasStore.getState().edges).toEqual([])
    useCanvasStore.getState().hydrate({
      version: 2,
      nodes: [{ id: 'terminal-1', type: 'terminal', position: { x: 0, y: 0 }, width: 480, height: 320, data: {} }],
      edges: [{ id: 'e1', source: 'terminal-1', target: 'terminal-1' }]
    })
    expect(useCanvasStore.getState().edges).toHaveLength(1)
  })

  it('hydrate semeia terminalSeq a partir dos nós hidratados para evitar colisão de nomes', () => {
    // Hidrata um snapshot contendo Terminal 999; addTerminalNode deve nomear o novo nó como Terminal 1000
    useCanvasStore.getState().hydrate({
      version: 2,
      nodes: [{ id: 'terminal-hydrated', type: 'terminal', position: { x: 10, y: 20 }, width: 480, height: 320, data: { name: 'Terminal 999' } }],
      edges: []
    })
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
    useCanvasStore.getState().addTerminalNode()
    const { nodes } = useCanvasStore.getState()
    expect(nodes).toHaveLength(2)
    const newNode = nodes[1]
    expect((newNode.data as { name?: string }).name).toBe('Terminal 1000')
  })

  it('addTerminalNode aceita preset e role e updateTerminalRole altera o papel', () => {
    useCanvasStore.getState().addTerminalNode(undefined, { preset: 'claude', role: 'Frontend' })
    const n = useCanvasStore.getState().nodes.at(-1)!
    expect((n.data as { preset?: string }).preset).toBe('claude')
    expect((n.data as { role?: string }).role).toBe('Frontend')
    useCanvasStore.getState().updateTerminalRole(n.id, 'Backend')
    expect((useCanvasStore.getState().nodes.at(-1)!.data as { role?: string }).role).toBe('Backend')
  })

  it('addTerminalNode semeia data.autostart:true (flag efêmero p/ auto-run do preset apenas na criação)', () => {
    useCanvasStore.getState().addTerminalNode(undefined, { preset: 'claude' })
    const n = useCanvasStore.getState().nodes.at(-1)!
    expect((n.data as { autostart?: boolean }).autostart).toBe(true)
  })

  it('serialize NÃO persiste autostart, mas preset/name continuam presentes no data serializado', () => {
    useCanvasStore.getState().addTerminalNode(undefined, { preset: 'claude' })
    const snap = useCanvasStore.getState().serialize()
    const serializedData = snap.nodes.at(-1)!.data
    expect('autostart' in serializedData).toBe(false)
    expect((serializedData as { preset?: string }).preset).toBe('claude')
    expect((serializedData as { name?: string }).name).toMatch(/^Terminal \d+$/)
  })

  it('addTerminalNode cascata posição quando nenhuma é passada', () => {
    useCanvasStore.getState().addTerminalNode()
    useCanvasStore.getState().addTerminalNode()
    const { nodes } = useCanvasStore.getState()
    expect(nodes).toHaveLength(2)
    // Primeira deve estar em (80, 80)
    expect(nodes[0].position).toEqual({ x: 80, y: 80 })
    // Segunda deve estar em posição diferente (cascata)
    expect(nodes[1].position).not.toEqual({ x: 80, y: 80 })
    // Posição deve seguir a fórmula: 80 + (length % 8) * 36
    expect(nodes[1].position).toEqual({ x: 80 + 36, y: 80 + 36 })
  })

  it('addPortalNode cria um nó tipo portal com data.url e data.name "Portal N"', () => {
    useCanvasStore.getState().addPortalNode(undefined, { url: 'https://x' })
    const n = useCanvasStore.getState().nodes.at(-1)!
    expect(n.type).toBe('portal')
    expect((n.data as { url?: string }).url).toBe('https://x')
    expect((n.data as { name?: string }).name).toMatch(/^Portal \d+$/)
  })

  it('addPortalNode sem opts semeia url vazia e posição informada', () => {
    useCanvasStore.getState().addPortalNode({ x: 3, y: 4 })
    const n = useCanvasStore.getState().nodes.at(-1)!
    expect(n.position).toEqual({ x: 3, y: 4 })
    expect((n.data as { url?: string }).url).toBe('')
  })

  it('updatePortalUrl altera a url de um portal existente', () => {
    useCanvasStore.getState().addPortalNode(undefined, { url: 'https://a' })
    const id = useCanvasStore.getState().nodes.at(-1)!.id
    useCanvasStore.getState().updatePortalUrl(id, 'https://b')
    expect((useCanvasStore.getState().nodes.at(-1)!.data as { url?: string }).url).toBe('https://b')
  })

  it('updatePortalName renomeia um portal existente', () => {
    useCanvasStore.getState().addPortalNode()
    const id = useCanvasStore.getState().nodes.at(-1)!.id
    useCanvasStore.getState().updatePortalName(id, 'Login')
    expect((useCanvasStore.getState().nodes.at(-1)!.data as { name?: string }).name).toBe('Login')
  })

  it('addPortalNode nomeia sequencialmente (Portal N, Portal N+1, ...)', () => {
    // portalSeq é um contador em nível de módulo (como terminalSeq), não resetado pelo
    // beforeEach — por isso o teste verifica o incremento relativo, não um valor absoluto
    // (mesmo padrão usado pelos testes de addTerminalNode acima).
    useCanvasStore.getState().addPortalNode()
    useCanvasStore.getState().addPortalNode()
    const [p1, p2] = useCanvasStore.getState().nodes
    const n1 = parseInt((p1.data as { name: string }).name.match(/^Portal (\d+)$/)![1], 10)
    const n2 = parseInt((p2.data as { name: string }).name.match(/^Portal (\d+)$/)![1], 10)
    expect(n2).toBe(n1 + 1)
  })

  it('addPortalNode e addTerminalNode usam sequências de nome independentes', () => {
    useCanvasStore.getState().addPortalNode()
    const firstNum = parseInt(
      (useCanvasStore.getState().nodes.at(-1)!.data as { name: string }).name.match(/^Portal (\d+)$/)![1],
      10
    )
    useCanvasStore.getState().addTerminalNode()
    useCanvasStore.getState().addPortalNode()
    const secondNum = parseInt(
      (useCanvasStore.getState().nodes.at(-1)!.data as { name: string }).name.match(/^Portal (\d+)$/)![1],
      10
    )
    // Criar um terminal entre os dois portais não deve "furar" a sequência de nomes de portal.
    expect(secondNum).toBe(firstNum + 1)
  })

  it('url do portal sobrevive ao round-trip serialize→hydrate', () => {
    useCanvasStore.getState().addPortalNode(undefined, { url: 'https://persist.example', name: 'Docs' })
    const snap = useCanvasStore.getState().serialize()
    useCanvasStore.getState().hydrate({ version: 1, nodes: [], edges: [] })
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
    useCanvasStore.getState().hydrate(snap)
    const restored = useCanvasStore.getState().nodes.at(-1)!
    expect(restored.type).toBe('portal')
    expect((restored.data as { url?: string; name?: string }).url).toBe('https://persist.example')
    expect((restored.data as { url?: string; name?: string }).name).toBe('Docs')
  })

  it('hydrate semeia portalSeq a partir dos nós hidratados para evitar colisão de nomes', () => {
    useCanvasStore.getState().hydrate({
      version: 2,
      nodes: [
        { id: 'portal-hydrated', type: 'portal', position: { x: 10, y: 20 }, width: 480, height: 320, data: { name: 'Portal 999', url: '' } }
      ],
      edges: []
    })
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
    useCanvasStore.getState().addPortalNode()
    const { nodes } = useCanvasStore.getState()
    expect(nodes).toHaveLength(2)
    const newNode = nodes[1]
    expect((newNode.data as { name?: string }).name).toBe('Portal 1000')
  })

  // --- Fase 19 (Task 2): FileTreeNode — árvore de arquivos no canvas ---

  it('addFileTreeNode cria um nó tipo filetree com data.rootPath e data.name "Arquivos"', () => {
    useCanvasStore.getState().addFileTreeNode(undefined, { rootPath: '/home/user/project' })
    const n = useCanvasStore.getState().nodes.at(-1)!
    expect(n.type).toBe('filetree')
    expect((n.data as { rootPath?: string }).rootPath).toBe('/home/user/project')
    expect((n.data as { name?: string }).name).toBe('Arquivos')
  })

  it('addFileTreeNode usa width:300 height:360 e a posição informada', () => {
    useCanvasStore.getState().addFileTreeNode({ x: 3, y: 4 })
    const n = useCanvasStore.getState().nodes.at(-1)!
    expect(n.position).toEqual({ x: 3, y: 4 })
    expect(n.width).toBe(300)
    expect(n.height).toBe(360)
  })

  it('addFileTreeNode sem opts semeia rootPath undefined', () => {
    useCanvasStore.getState().addFileTreeNode()
    const n = useCanvasStore.getState().nodes.at(-1)!
    expect((n.data as { rootPath?: string }).rootPath).toBeUndefined()
  })

  it('addFileTreeNode cascata posição quando nenhuma é passada (mesma fórmula dos outros nós)', () => {
    useCanvasStore.getState().addFileTreeNode()
    useCanvasStore.getState().addFileTreeNode()
    const { nodes } = useCanvasStore.getState()
    expect(nodes[0].position).toEqual({ x: 80, y: 80 })
    expect(nodes[1].position).toEqual({ x: 80 + 36, y: 80 + 36 })
  })

  it('updateFileTreeRoot altera o rootPath de um nó filetree existente', () => {
    useCanvasStore.getState().addFileTreeNode(undefined, { rootPath: '/a' })
    const id = useCanvasStore.getState().nodes.at(-1)!.id
    useCanvasStore.getState().updateFileTreeRoot(id, '/b')
    expect((useCanvasStore.getState().nodes.at(-1)!.data as { rootPath?: string }).rootPath).toBe('/b')
  })

  it('updateFileTreeRoot não afeta outros nós', () => {
    useCanvasStore.getState().addFileTreeNode(undefined, { rootPath: '/a' })
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    const [fileTreeNode, terminalNode] = useCanvasStore.getState().nodes
    useCanvasStore.getState().updateFileTreeRoot(fileTreeNode.id, '/changed')
    const { nodes } = useCanvasStore.getState()
    expect((nodes.find((n) => n.id === fileTreeNode.id)!.data as { rootPath?: string }).rootPath).toBe('/changed')
    const untouchedTerminal = nodes.find((n) => n.id === terminalNode.id)!
    expect(untouchedTerminal.position).toEqual(terminalNode.position)
    expect(untouchedTerminal.data).toEqual(terminalNode.data)
  })

  it('rootPath do filetree sobrevive ao round-trip serialize→hydrate', () => {
    useCanvasStore.getState().addFileTreeNode(undefined, { rootPath: '/persist/me' })
    const snap = useCanvasStore.getState().serialize()
    useCanvasStore.getState().hydrate({ version: 1, nodes: [], edges: [] })
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
    useCanvasStore.getState().hydrate(snap)
    const restored = useCanvasStore.getState().nodes.at(-1)!
    expect(restored.type).toBe('filetree')
    expect((restored.data as { rootPath?: string; name?: string }).rootPath).toBe('/persist/me')
    expect((restored.data as { rootPath?: string; name?: string }).name).toBe('Arquivos')
  })

  it('serialize inclui width/height/data do nó filetree', () => {
    useCanvasStore.getState().addFileTreeNode({ x: 1, y: 2 }, { rootPath: '/x' })
    const snap = useCanvasStore.getState().serialize()
    const n = snap.nodes.at(-1)!
    expect(n.type).toBe('filetree')
    expect(n.width).toBe(300)
    expect(n.height).toBe(360)
    expect(n.position).toEqual({ x: 1, y: 2 })
  })

  it('switching começa false e setSwitching alterna a flag (guarda de autosave durante troca de projeto, Fase 15 Task 3)', () => {
    expect(useCanvasStore.getState().switching).toBe(false)
    useCanvasStore.getState().setSwitching(true)
    expect(useCanvasStore.getState().switching).toBe(true)
    useCanvasStore.getState().setSwitching(false)
    expect(useCanvasStore.getState().switching).toBe(false)
  })

  it('setNodePositions atualiza a posição do nó indicado sem tocar os demais (Fase 18 Task 2)', () => {
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    useCanvasStore.getState().addTerminalNode({ x: 100, y: 100 })
    const [a, b] = useCanvasStore.getState().nodes
    useCanvasStore.getState().setNodePositions({ [a.id]: { x: 40, y: 50 } })
    const { nodes } = useCanvasStore.getState()
    expect(nodes.find((n) => n.id === a.id)?.position).toEqual({ x: 40, y: 50 })
    // O outro nó (não presente no map) permanece intocado.
    expect(nodes.find((n) => n.id === b.id)?.position).toEqual({ x: 100, y: 100 })
  })

  it('setNodePositions aplica múltiplas posições de uma vez (uso real: alinhar/distribuir/grade)', () => {
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    useCanvasStore.getState().addTerminalNode({ x: 10, y: 10 })
    useCanvasStore.getState().addTerminalNode({ x: 20, y: 20 })
    const [a, b, c] = useCanvasStore.getState().nodes
    useCanvasStore.getState().setNodePositions({ [a.id]: { x: 1, y: 1 }, [c.id]: { x: 3, y: 3 } })
    const { nodes } = useCanvasStore.getState()
    expect(nodes.find((n) => n.id === a.id)?.position).toEqual({ x: 1, y: 1 })
    expect(nodes.find((n) => n.id === b.id)?.position).toEqual({ x: 10, y: 10 })
    expect(nodes.find((n) => n.id === c.id)?.position).toEqual({ x: 3, y: 3 })
  })

  // --- Fase 18 Task 3: grupos (React Flow v12 parent/child) ---

  it('groupSelected não faz nada com menos de 2 nós selecionados', () => {
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    useCanvasStore.getState().groupSelected()
    const { nodes } = useCanvasStore.getState()
    expect(nodes).toHaveLength(1)
    expect(nodes.some((n) => n.type === 'group')).toBe(false)
  })

  it('groupSelected agrupa 2 nós selecionados: cria 1 nó group ANTES dos filhos, cada filho ganha parentId/extent:parent e posição relativa ao bbox', () => {
    useCanvasStore.getState().addTerminalNode({ x: 10, y: 20 }) // width 480 height 320 (default)
    useCanvasStore.getState().addTerminalNode({ x: 100, y: 200 })
    const [a, b] = useCanvasStore.getState().nodes
    useCanvasStore.setState((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: n.id === a.id || n.id === b.id }))
    }))
    useCanvasStore.getState().groupSelected()
    const { nodes } = useCanvasStore.getState()
    expect(nodes).toHaveLength(3)

    const group = nodes[0]
    expect(group.type).toBe('group')
    expect(group.id).toMatch(/^group-/)
    // bbox: a=(10,20)+480x320 -> right 490/bottom 340; b=(100,200)+480x320 -> right 580/bottom 520
    // minX=10 minY=20 maxRight=580 maxBottom=520 -> width=570 height=500
    expect(group.position).toEqual({ x: 10, y: 20 })
    expect(group.width).toBe(570)
    expect(group.height).toBe(500)

    const childA = nodes.find((n) => n.id === a.id)!
    const childB = nodes.find((n) => n.id === b.id)!
    expect(childA.parentId).toBe(group.id)
    expect(childB.parentId).toBe(group.id)
    expect(childA.extent).toBe('parent')
    expect(childB.extent).toBe('parent')
    // posição relativa = posição absoluta original - topo-esquerda do bbox
    expect(childA.position).toEqual({ x: 0, y: 0 })
    expect(childB.position).toEqual({ x: 90, y: 180 })

    // React Flow exige o pai ANTES dos filhos no array
    expect(nodes.indexOf(group)).toBeLessThan(nodes.indexOf(childA))
    expect(nodes.indexOf(group)).toBeLessThan(nodes.indexOf(childB))
  })

  it('groupSelected usa ?? 0 para nós sem width/height ao calcular o bbox', () => {
    useCanvasStore.getState().addNoteNode({ x: 0, y: 0 })
    useCanvasStore.setState((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, width: undefined, height: undefined }))
    }))
    useCanvasStore.getState().addNoteNode({ x: 50, y: 50 })
    useCanvasStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })) }))
    expect(() => useCanvasStore.getState().groupSelected()).not.toThrow()
    const group = useCanvasStore.getState().nodes[0]
    expect(group.type).toBe('group')
    // primeiro nó sem width/height conta como 0 -> maxX/maxY vêm só do segundo nó (50,50)+240x180
    expect(group.width).toBe(290)
    expect(group.height).toBe(230)
  })

  it('ungroupSelected desfaz o grupo quando o próprio nó group está selecionado: filhos perdem parentId/extent e voltam à posição absoluta, o group some', () => {
    useCanvasStore.getState().addTerminalNode({ x: 10, y: 20 })
    useCanvasStore.getState().addTerminalNode({ x: 100, y: 200 })
    const [a, b] = useCanvasStore.getState().nodes
    useCanvasStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })) }))
    useCanvasStore.getState().groupSelected()
    const groupId = useCanvasStore.getState().nodes[0].id

    // Seleciona só o group (como ficou logo após o groupSelected).
    useCanvasStore.setState((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: n.id === groupId }))
    }))
    useCanvasStore.getState().ungroupSelected()

    const { nodes } = useCanvasStore.getState()
    expect(nodes.find((n) => n.id === groupId)).toBeUndefined()
    expect(nodes).toHaveLength(2)
    const childA = nodes.find((n) => n.id === a.id)!
    const childB = nodes.find((n) => n.id === b.id)!
    expect(childA.parentId).toBeUndefined()
    expect(childB.parentId).toBeUndefined()
    expect(childA.extent).toBeUndefined()
    expect(childB.extent).toBeUndefined()
    expect(childA.position).toEqual({ x: 10, y: 20 })
    expect(childB.position).toEqual({ x: 100, y: 200 })
  })

  it('ungroupSelected também funciona quando só um filho (não o group) está selecionado', () => {
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    useCanvasStore.getState().addTerminalNode({ x: 50, y: 50 })
    useCanvasStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })) }))
    useCanvasStore.getState().groupSelected()
    const [group, childA] = useCanvasStore.getState().nodes

    // Seleciona só o filho, simulando um clique num nó dentro do grupo (não no header do grupo).
    useCanvasStore.setState((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: n.id === childA.id }))
    }))
    useCanvasStore.getState().ungroupSelected()

    const { nodes } = useCanvasStore.getState()
    expect(nodes.find((n) => n.id === group.id)).toBeUndefined()
    expect(nodes.every((n) => n.parentId === undefined)).toBe(true)
    expect(nodes.every((n) => n.extent === undefined)).toBe(true)
  })

  it('ungroupSelected não faz nada (no-op seguro) se nada agrupável estiver selecionado', () => {
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    const before = useCanvasStore.getState().nodes
    useCanvasStore.getState().ungroupSelected()
    expect(useCanvasStore.getState().nodes).toBe(before)
  })

  it('serialize inclui parentId/extent de um nó agrupado; o próprio group (sem pai) omite os dois (Fase 18 Task 3)', () => {
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    useCanvasStore.getState().addTerminalNode({ x: 50, y: 50 })
    useCanvasStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })) }))
    useCanvasStore.getState().groupSelected()

    const snap = useCanvasStore.getState().serialize()
    const groupSnap = snap.nodes.find((n) => n.type === 'group')!
    const childSnaps = snap.nodes.filter((n) => n.type === 'terminal')
    expect(childSnaps).toHaveLength(2)
    for (const childSnap of childSnaps) {
      expect(childSnap.parentId).toBe(groupSnap.id)
      expect(childSnap.extent).toBe('parent')
    }
    expect('parentId' in groupSnap).toBe(false)
    expect('extent' in groupSnap).toBe(false)
  })

  it('hydrate restaura parentId/extent de um nó a partir do snapshot persistido', () => {
    useCanvasStore.getState().hydrate({
      version: 2,
      nodes: [
        { id: 'group-1', type: 'group', position: { x: 0, y: 0 }, width: 400, height: 300, data: { name: 'Grupo' } },
        {
          id: 'terminal-1',
          type: 'terminal',
          position: { x: 10, y: 10 },
          width: 480,
          height: 320,
          data: {},
          parentId: 'group-1',
          extent: 'parent'
        }
      ],
      edges: []
    })
    const { nodes } = useCanvasStore.getState()
    const group = nodes.find((n) => n.id === 'group-1')!
    const child = nodes.find((n) => n.id === 'terminal-1')!
    expect(group.parentId).toBeUndefined()
    expect(child.parentId).toBe('group-1')
    expect(child.extent).toBe('parent')
  })

  it('grupo sobrevive ao round-trip serialize→hydrate: parentId/extent preservados nos filhos', () => {
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    useCanvasStore.getState().addTerminalNode({ x: 50, y: 50 })
    useCanvasStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })) }))
    useCanvasStore.getState().groupSelected()
    const groupId = useCanvasStore.getState().nodes[0].id

    const snap = useCanvasStore.getState().serialize()
    useCanvasStore.getState().hydrate({ version: 1, nodes: [], edges: [] })
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
    useCanvasStore.getState().hydrate(snap)

    const { nodes } = useCanvasStore.getState()
    expect(nodes).toHaveLength(3)
    const children = nodes.filter((n) => n.parentId === groupId)
    expect(children).toHaveLength(2)
    children.forEach((c) => expect(c.extent).toBe('parent'))
  })

  // --- Fase 18 Task 3 fix: deletar um grupo desagrupa (preserva os filhos) em vez de destruí-los ---

  it('ungroupGroupsById desagrupa os filhos do grupo indicado sem remover o nó group (quem remove o container é o caller); filhos NÃO são deletados', () => {
    useCanvasStore.getState().addTerminalNode({ x: 10, y: 20 })
    useCanvasStore.getState().addTerminalNode({ x: 100, y: 200 })
    const [a, b] = useCanvasStore.getState().nodes
    useCanvasStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })) }))
    useCanvasStore.getState().groupSelected()
    const groupId = useCanvasStore.getState().nodes[0].id

    useCanvasStore.getState().ungroupGroupsById([groupId])

    const { nodes } = useCanvasStore.getState()
    // O grupo ainda existe — ungroupGroupsById não remove o container, só desfaz o parentesco.
    expect(nodes.find((n) => n.id === groupId)).toBeTruthy()
    expect(nodes).toHaveLength(3)
    // Os filhos SOBREVIVEM (não são deletados): sem parentId/extent, posição absoluta de volta.
    const childA = nodes.find((n) => n.id === a.id)!
    const childB = nodes.find((n) => n.id === b.id)!
    expect(childA).toBeTruthy()
    expect(childB).toBeTruthy()
    expect(childA.parentId).toBeUndefined()
    expect(childB.parentId).toBeUndefined()
    expect(childA.extent).toBeUndefined()
    expect(childB.extent).toBeUndefined()
    expect(childA.position).toEqual({ x: 10, y: 20 })
    expect(childB.position).toEqual({ x: 100, y: 200 })
  })

  it('ungroupGroupsById ignora ids que não correspondem a um nó group e deixa nós não relacionados intocados', () => {
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    const before = useCanvasStore.getState().nodes
    useCanvasStore.getState().ungroupGroupsById(['id-inexistente'])
    expect(useCanvasStore.getState().nodes).toBe(before)
  })

  // --- Fase 20 (Task 2): indicador de "atenção do agente" — attention Set no store ---

  it('attention começa como um Set vazio', () => {
    const { attention } = useCanvasStore.getState()
    expect(attention).toBeInstanceOf(Set)
    expect(attention.size).toBe(0)
  })

  it('setAttention(id, true) adiciona o nodeId ao Set attention', () => {
    useCanvasStore.getState().setAttention('n1', true)
    expect(useCanvasStore.getState().attention.has('n1')).toBe(true)
  })

  it('setAttention(id, false) remove o nodeId do Set attention', () => {
    useCanvasStore.getState().setAttention('n1', true)
    useCanvasStore.getState().setAttention('n1', false)
    expect(useCanvasStore.getState().attention.has('n1')).toBe(false)
  })

  it('setAttention não afeta outros ids já presentes no Set', () => {
    useCanvasStore.getState().setAttention('n1', true)
    useCanvasStore.getState().setAttention('n2', true)
    useCanvasStore.getState().setAttention('n1', false)
    const { attention } = useCanvasStore.getState()
    expect(attention.has('n1')).toBe(false)
    expect(attention.has('n2')).toBe(true)
  })

  it('setAttention(id, false) num id ausente é no-op seguro (não lança, Set continua sem o id)', () => {
    expect(() => useCanvasStore.getState().setAttention('ausente', false)).not.toThrow()
    expect(useCanvasStore.getState().attention.has('ausente')).toBe(false)
  })

  it('setAttention sempre atribui uma NOVA referência de Set (para o zustand re-renderizar mesmo em mutação de conteúdo interno)', () => {
    const before = useCanvasStore.getState().attention
    useCanvasStore.getState().setAttention('n1', true)
    const afterAdd = useCanvasStore.getState().attention
    expect(afterAdd).not.toBe(before)
    useCanvasStore.getState().setAttention('n1', false)
    const afterRemove = useCanvasStore.getState().attention
    expect(afterRemove).not.toBe(afterAdd)
  })
})
