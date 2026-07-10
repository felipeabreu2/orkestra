export interface MirrorNode {
  id: string
  type: string
  name: string
  content?: string
  role?: string
  preset?: string
}

export interface CanvasMirror {
  nodes: MirrorNode[]
}

export type OrchestrationCommand =
  | { type: 'updateNote'; target: string; content: string }
  | { type: 'recruit'; name: string; preset: string; role?: string }
  | { type: 'dismiss'; target: string }
  | { type: 'connect'; source: string; target: string }
