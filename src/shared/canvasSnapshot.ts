export interface PersistedNode {
  id: string
  type: string
  position: { x: number; y: number }
  width: number
  height: number
  data: Record<string, unknown>
}

export interface PersistedEdge {
  id: string
  source: string
  target: string
}

export interface CanvasSnapshot {
  version: number
  nodes: PersistedNode[]
  edges: PersistedEdge[]
}
