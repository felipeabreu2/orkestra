// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore } from './canvasStore'

beforeEach(() => {
  useCanvasStore.setState({ nodes: [] })
})

describe('canvasStore', () => {
  it('addTerminalNode adiciona um nó de terminal na posição dada', () => {
    useCanvasStore.getState().addTerminalNode({ x: 10, y: 20 })
    const { nodes } = useCanvasStore.getState()
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe('terminal')
    expect(nodes[0].position).toEqual({ x: 10, y: 20 })
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
    const id = useCanvasStore.getState().nodes[0].id
    useCanvasStore.getState().removeNode(id)
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
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
