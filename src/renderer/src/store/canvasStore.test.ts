// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore } from './canvasStore'
import type { CanvasSnapshot } from '../../../shared/canvasSnapshot'

beforeEach(() => {
  useCanvasStore.setState({ nodes: [], edges: [] })
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

  it('switching começa false e setSwitching alterna a flag (guarda de autosave durante troca de projeto, Fase 15 Task 3)', () => {
    expect(useCanvasStore.getState().switching).toBe(false)
    useCanvasStore.getState().setSwitching(true)
    expect(useCanvasStore.getState().switching).toBe(true)
    useCanvasStore.getState().setSwitching(false)
    expect(useCanvasStore.getState().switching).toBe(false)
  })
})
