// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore } from './canvasStore'

beforeEach(() => {
  useCanvasStore.setState({ nodes: [] })
})

describe('canvasStore', () => {
  it('addTerminalNode usa width/height top-level (fonte única)', () => {
    useCanvasStore.getState().addTerminalNode({ x: 10, y: 20 })
    const { nodes } = useCanvasStore.getState()
    expect(nodes[0].type).toBe('terminal')
    expect(nodes[0].position).toEqual({ x: 10, y: 20 })
    expect(nodes[0].width).toBe(480)
    expect(nodes[0].height).toBe(320)
    expect(nodes[0].data).toEqual({})
  })

  it('serialize captura id/type/position/width/height/data de cada nó', () => {
    useCanvasStore.getState().addTerminalNode({ x: 5, y: 6 })
    const snap = useCanvasStore.getState().serialize()
    expect(snap.version).toBe(1)
    expect(snap.nodes).toHaveLength(1)
    const n = snap.nodes[0]
    expect(n.type).toBe('terminal')
    expect(n.position).toEqual({ x: 5, y: 6 })
    expect(n.width).toBe(480)
    expect(n.height).toBe(320)
    expect(n.data).toEqual({})
    expect(typeof n.id).toBe('string')
  })

  it('hydrate substitui os nós a partir de um snapshot', () => {
    useCanvasStore.getState().addTerminalNode()
    useCanvasStore.getState().hydrate({
      version: 1,
      nodes: [
        { id: 'terminal-x', type: 'terminal', position: { x: 1, y: 2 }, width: 300, height: 200, data: {} }
      ]
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
    useCanvasStore.getState().hydrate({ version: 1, nodes: [] })
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
    useCanvasStore.getState().hydrate(snap)
    const n = useCanvasStore.getState().nodes[0]
    expect(n.position).toEqual({ x: 7, y: 8 })
    expect(n.width).toBe(480)
    expect(n.height).toBe(320)
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

  it('onNodesChange aplica mudança de posição', () => {
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    const id = useCanvasStore.getState().nodes[0].id
    useCanvasStore.getState().onNodesChange([
      { id, type: 'position', position: { x: 50, y: 60 } }
    ])
    expect(useCanvasStore.getState().nodes[0].position).toEqual({ x: 50, y: 60 })
  })
})
