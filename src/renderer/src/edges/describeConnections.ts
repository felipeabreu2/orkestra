import type { Node, Edge } from '@xyflow/react'
import { deriveEdgeKind, type EdgeKind } from './edgeKind'

// Helper PURO (sem React, sem DOM) do popover de inspeção de conexões (T3 do plano de Conexões).
// A partir de um nó, monta uma linha por aresta que o toca, descrevendo o que há do OUTRO lado:
// id/nome/tipo do vizinho, o `kind` da aresta (deriveEdgeKind) e a direção. Fica em `edges/` ao
// lado de edgeKind, no mesmo processo renderer, então reusa `deriveEdgeKind`/`EDGE_KIND_META`.

export type ConnectionDirection = 'incoming' | 'outgoing'

export interface ConnectionRow {
  /** id da aresta (para o × por linha → removeEdge). */
  edgeId: string
  /** id do nó do outro lado (para navegar/selecionar). */
  otherId: string
  /** nome legível do outro lado (rótulo da linha). */
  otherName: string
  /** tipo do outro lado (`terminal` | `note` | `portal` | `file` | …). */
  otherType: string
  /** tipo da conexão (rótulo/badge via EDGE_KIND_META). */
  kind: EdgeKind
  /** `outgoing` quando a aresta sai de `nodeId` (source), `incoming` quando chega (target). */
  direction: ConnectionDirection
}

// Nome legível de um nó, sem depender de DOMParser (mantém o helper puro/testável). `data.name`
// personalizado vence; senão cai em `data.content`; senão um rótulo por tipo.
function displayName(node: Node): string {
  const explicit = (node.data?.name as string | undefined)?.trim()
  if (explicit) return explicit
  const content = (node.data?.content as string | undefined)?.trim()
  if (content) return content
  switch (node.type) {
    case 'note':
      return 'Nota'
    case 'file':
    case 'filetree':
      return 'Arquivo'
    case 'portal':
      return 'Site'
    case 'terminal':
      return 'Terminal'
    default:
      return node.type ?? node.id
  }
}

/**
 * Descreve as conexões de um nó. Devolve uma linha por aresta que toca `nodeId`, resolvendo o
 * outro lado independentemente da direção. Arestas órfãs (cujo outro lado não está em `nodes`) e
 * auto-loops são ignorados. Se `nodeId` não existe em `nodes`, devolve `[]`. Ordena de forma
 * estável por `otherName` (depois `otherId`) para um popover previsível.
 */
export function describeNodeConnections(
  nodes: Node[],
  edges: Edge[],
  nodeId: string
): ConnectionRow[] {
  const byId = new Map<string, Node>()
  for (const node of nodes) byId.set(node.id, node)

  const self = byId.get(nodeId)
  if (!self) return []

  const rows: ConnectionRow[] = []
  for (const edge of edges) {
    let otherId: string
    let direction: ConnectionDirection
    if (edge.source === nodeId) {
      otherId = edge.target
      direction = 'outgoing'
    } else if (edge.target === nodeId) {
      otherId = edge.source
      direction = 'incoming'
    } else {
      continue // aresta não toca este nó
    }

    if (otherId === nodeId) continue // auto-loop: não é vizinho
    const other = byId.get(otherId)
    if (!other) continue // aresta órfã: o outro lado não existe

    rows.push({
      edgeId: edge.id,
      otherId,
      otherName: displayName(other),
      otherType: other.type ?? 'link',
      kind: deriveEdgeKind(self.type, other.type),
      direction
    })
  }

  rows.sort((a, b) => a.otherName.localeCompare(b.otherName) || a.otherId.localeCompare(b.otherId))
  return rows
}
