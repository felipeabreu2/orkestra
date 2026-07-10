export interface MirrorNode {
  id: string
  type: string
  name: string
  content?: string
}

export interface CanvasMirror {
  nodes: MirrorNode[]
}

export type OrchestrationCommand = { type: 'updateNote'; target: string; content: string }
