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

let terminalSeq = 1

interface CanvasState {
  nodes: Node[]
  edges: Edge[]
  addTerminalNode: (
    position?: { x: number; y: number } | undefined,
    opts?: { preset?: string; role?: string; name?: string; floorId?: string }
  ) => void
  addNoteNode: (position?: { x: number; y: number }) => void
  updateNoteContent: (id: string, content: string) => void
  updateTerminalName: (id: string, name: string) => void
  updateTerminalRole: (id: string, role: string) => void
  updateTerminalFloor: (id: string, floorId: string) => void
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
  addTerminalNode: (position, opts): void =>
    set((state) => {
      const pos = position ?? { x: 80 + (state.nodes.length % 8) * 36, y: 80 + (state.nodes.length % 8) * 36 }
      return {
        nodes: [
          ...state.nodes,
          {
            id: `terminal-${crypto.randomUUID()}`,
            type: 'terminal',
            position: pos,
            data: {
              name: opts?.name ?? `Terminal ${terminalSeq++}`,
              preset: opts?.preset ?? 'shell',
              role: opts?.role ?? '',
              floorId: opts?.floorId ?? '',
              // Efêmero: nunca deve ser persistido (ver serialize) — sinaliza que este nó acabou
              // de ser criado nesta sessão, para o TerminalNode auto-rodar o comando do preset
              // apenas na criação, nunca ao hidratar de um snapshot salvo (Fase 7 Task 2).
              autostart: true
            },
            width: 480,
            height: 320
          }
        ]
      }
    }),
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
  updateTerminalName: (id, name): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, name } } : n))
    })),
  updateTerminalRole: (id, role): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, role } } : n))
    })),
  updateTerminalFloor: (id, floorId): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, floorId } } : n))
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
    nodes: get().nodes.map((n) => {
      // autostart é efêmero (só vale para a sessão em que o nó foi criado) — nunca deve ir
      // para o snapshot persistido, senão todo reload re-rodaria o comando do preset (Fase 7 Task 2).
      const rest = { ...((n.data ?? {}) as Record<string, unknown>) }
      delete rest.autostart
      return {
        id: n.id,
        type: n.type ?? 'terminal',
        position: n.position,
        width: n.width ?? 480,
        height: n.height ?? 320,
        data: rest
      }
    }),
    edges: get().edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
  }),
  hydrate: (snapshot): void => {
    // Scan hydrated nodes for Terminal names and update terminalSeq to avoid collisions
    const terminalNames = snapshot.nodes
      .map((p) => (p.data as Record<string, unknown>)?.name)
      .filter((name): name is string => typeof name === 'string')
    const maxTerminalNum = Math.max(
      ...terminalNames
        .map((name) => {
          const match = name.match(/^Terminal (\d+)$/)
          return match ? parseInt(match[1], 10) : 0
        })
    )
    if (maxTerminalNum > 0) {
      terminalSeq = Math.max(terminalSeq, maxTerminalNum + 1)
    }

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
  }
}))
