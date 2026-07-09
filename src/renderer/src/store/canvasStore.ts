import { create } from 'zustand'
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection
} from '@xyflow/react'
import type { CanvasSnapshot } from '../../../shared/canvasSnapshot'

interface CanvasState {
  nodes: Node[]
  edges: Edge[]
  addTerminalNode: (position?: { x: number; y: number }) => void
  addNoteNode: (position?: { x: number; y: number }) => void
  updateNoteContent: (id: string, content: string) => void
  removeNode: (id: string) => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  serialize: () => CanvasSnapshot
  hydrate: (snapshot: CanvasSnapshot) => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
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
  addNoteNode: (position = { x: 120, y: 120 }): void =>
    set((state) => ({
      nodes: [
        ...state.nodes,
        {
          id: `note-${crypto.randomUUID()}`,
          type: 'note',
          position,
          data: { content: '' },
          width: 240,
          height: 180
        }
      ]
    })),
  updateNoteContent: (id, content): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, content } } : n))
    })),
  removeNode: (id): void =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id)
    })),
  onNodesChange: (changes): void => set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),
  onEdgesChange: (changes): void => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),
  onConnect: (connection): void => set((state) => ({ edges: addEdge(connection, state.edges) })),
  serialize: (): CanvasSnapshot => ({
    version: 2,
    nodes: get().nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'terminal',
      position: n.position,
      width: n.width ?? 480,
      height: n.height ?? 320,
      data: (n.data ?? {}) as Record<string, unknown>
    })),
    edges: get().edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
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
      })),
      edges: (snapshot.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target }))
    })
}))
