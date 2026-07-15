import type { CanvasMirror, MirrorNode } from '../shared/orchestration'

// Helper puro do `orq whoami` (quick win #7 — "recrutas sabem quem são"): a partir do espelho do
// canvas e do id deste terminal (ORKESTRA_NODE_ID), monta uma descrição legível pelo agente com o
// próprio nome, papel e os blocos/agentes conectados. Sem HTTP/DOM — testável isolado. Direção da
// aresta NÃO importa (mesma semântica de `orq context`): um bloco ligado em qualquer ponta conta.
export function describeSelf(mirror: CanvasMirror, nodeId: string): string {
  const self = mirror.nodes.find((n) => n.id === nodeId)
  if (!self) {
    return 'orq: não foi possível identificar este terminal (ORKESTRA_NODE_ID ausente ou sem correspondência no canvas). Rode "orq list" para ver os nós.'
  }
  const byId = new Map<string, MirrorNode>(mirror.nodes.map((n) => [n.id, n]))
  // Vizinhos: qualquer aresta que TOQUE este nó, em qualquer direção. Set p/ deduplicar quando o
  // mesmo bloco aparece nas duas pontas de arestas distintas.
  const neighborIds = new Set<string>()
  for (const e of mirror.edges) {
    if (e.source === nodeId) neighborIds.add(e.target)
    else if (e.target === nodeId) neighborIds.add(e.source)
  }
  const neighbors: MirrorNode[] = []
  for (const id of neighborIds) {
    const n = byId.get(id)
    if (n) neighbors.push(n)
  }

  const role = self.role && self.role.trim() ? self.role : '(sem papel definido)'
  const lines = [`você é: ${self.name} (${self.type})`, `papel: ${role}`]
  if (neighbors.length === 0) {
    lines.push('conexões: (nenhum bloco conectado)')
  } else {
    lines.push('conexões:')
    for (const n of neighbors) lines.push(`  - ${n.name} (${n.type})`)
  }
  return lines.join('\n')
}
