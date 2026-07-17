import type { Node } from '@xyflow/react'

/**
 * Dissolve grupos "magros" — nós `type:'group'` com menos de `threshold` filhos (Canvas #12 · T3).
 * Para cada grupo magro: descarta o nó group e reescreve seus filhos para o topo-nível, com posição
 * ABSOLUTA (`filho.position + group.position`) e sem `parentId`/`extent`. Idempotente: devolve a
 * MESMA referência quando não há nada a dissolver (evita re-render à toa no store). Função pura.
 */
export function dissolveThinGroups(nodes: Node[], threshold = 2): Node[] {
  const groups = nodes.filter((n) => n.type === 'group')
  if (groups.length === 0) return nodes

  const childCount = new Map<string, number>()
  for (const n of nodes) {
    if (n.parentId) childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1)
  }
  const thin = new Set(
    groups.filter((g) => (childCount.get(g.id) ?? 0) < threshold).map((g) => g.id)
  )
  if (thin.size === 0) return nodes

  const groupPos = new Map(groups.map((g) => [g.id, g.position]))
  const result: Node[] = []
  for (const n of nodes) {
    if (n.type === 'group' && thin.has(n.id)) continue // descarta o grupo magro
    if (n.parentId && thin.has(n.parentId)) {
      const gp = groupPos.get(n.parentId)!
      const child: Node = { ...n, position: { x: n.position.x + gp.x, y: n.position.y + gp.y } }
      delete child.parentId
      delete child.extent
      result.push(child)
    } else {
      result.push(n)
    }
  }
  return result
}
