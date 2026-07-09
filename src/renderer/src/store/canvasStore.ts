import { create } from 'zustand'
import { applyNodeChanges, type Node, type NodeChange } from '@xyflow/react'

interface CanvasState {
  nodes: Node[]
  addTerminalNode: (position?: { x: number; y: number }) => void
  removeNode: (id: string) => void
  onNodesChange: (changes: NodeChange[]) => void
}

export const useCanvasStore = create<CanvasState>((set) => ({
  nodes: [],
  addTerminalNode: (position = { x: 80, y: 80 }): void =>
    set((state) => ({
      nodes: [
        ...state.nodes,
        {
          id: `terminal-${crypto.randomUUID()}`,
          type: 'terminal',
          position,
          data: {},
          style: { width: 480, height: 320 }
        }
      ]
    })),
  removeNode: (id): void =>
    set((state) => ({ nodes: state.nodes.filter((n) => n.id !== id) })),
  onNodesChange: (changes): void =>
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) }))
}))
