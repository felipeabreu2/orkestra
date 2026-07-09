export interface PersistedNode {
  id: string
  type: string
  position: { x: number; y: number }
  width: number
  height: number
  data: Record<string, unknown>
}

export interface CanvasSnapshot {
  version: 1
  nodes: PersistedNode[]
}
