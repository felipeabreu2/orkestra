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
  // Conexões T4: override de estilo desta aresta ('curva' | 'circuito' | 'corda'), ausente quando
  // ela segue a preferência global do canvas. Escolha do usuário, então é conteúdo e persiste —
  // ao contrário do `kind`, que é sempre re-derivado dos tipos dos nós na hidratação. Tipado como
  // string porque o snapshot vem de disco (pode estar corrompido ou vir de uma versão futura);
  // quem lê valida com isEdgeStyle/resolveEdgeStyle (renderer/src/edges/edgeStyle.ts). O tipo
  // EdgeStyle não é importado aqui de propósito: src/shared não pode depender do renderer.
  style?: string
}

export interface CanvasSnapshot {
  version: number
  nodes: PersistedNode[]
  edges: PersistedEdge[]
}
