import { create } from 'zustand'
import { applyNodeChanges, type Node, type NodeChange } from '@xyflow/react'
import type { CanvasSnapshot } from '../../../shared/canvasSnapshot'

interface CanvasState {
  nodes: Node[]
  addTerminalNode: (position?: { x: number; y: number }) => void
  removeNode: (id: string) => void
  onNodesChange: (changes: NodeChange[]) => void
  serialize: () => CanvasSnapshot
  hydrate: (snapshot: CanvasSnapshot) => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
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
          width: 480,
          height: 320
        }
      ]
    })),
  removeNode: (id): void =>
    set((state) => ({ nodes: state.nodes.filter((n) => n.id !== id) })),
  onNodesChange: (changes): void =>
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),
  serialize: (): CanvasSnapshot => ({
    version: 1,
    nodes: get().nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'terminal',
      position: n.position,
      width: n.width ?? 480,
      height: n.height ?? 320,
      data: (n.data ?? {}) as Record<string, unknown>
    }))
  }),
  hydrate: (snapshot): void =>
    set({
      nodes: snapshot.nodes.map((p) => ({
        id: p.id,
        type: p.type,
        position: p.position,
        data: p.data,
        width: p.width,
        height: p.height
      }))
    })
}))
