export interface PersistedNode {
  id: string
  type: string
  position: { x: number; y: number }
  width: number
  height: number
  data: Record<string, unknown>
  // Grupos (Fase 18 Task 3, React Flow v12 parent/child nodes): presentes só em nós que
  // pertencem a um grupo — `position` acima já é RELATIVA ao grupo nesse caso (não absoluta).
  // Um nó sem grupo simplesmente omite os dois campos.
  parentId?: string
  extent?: 'parent'
}

export interface PersistedEdge {
  id: string
  source: string
  target: string
  // Handles de origem/destino (conexão em 4 lados: entrada esquerda/topo, saída direita/base) —
  // persistidos para a edge reconectar no mesmo lado após reload.
  sourceHandle?: string | null
  targetHandle?: string | null
}

export interface CanvasSnapshot {
  version: number
  nodes: PersistedNode[]
  edges: PersistedEdge[]
}
