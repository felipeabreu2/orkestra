import type { CanvasMirror } from './orchestration'

// Topologia da aresta `agent` (T5 do plano de Conexões / T9 do Modo Maestro): quem está ligado a
// um terminal por uma aresta AGENTE↔AGENTE. Uma aresta é `agent` quando as DUAS pontas são
// terminais (mesma regra de deriveEdgeKind, mas aqui sem importar o renderer — vive em shared/,
// consumido pelo `orq whoami`). Puro: sem HTTP/DOM, determinístico.
//
// Serve para (a) o onboarding "você está conectado a X, Y" e (b) sugerir/priorizar alvos de
// `orq ask` — o roteamento por nome continua sendo o fallback (a topologia sugere, não bloqueia).

/**
 * Nomes dos terminais diretamente ligados a `from` por uma aresta `agent` (ambas as pontas
 * terminais). Não-direcional, sem duplicatas. `from` inexistente ou que não é terminal → `[]`.
 */
export function connectedAgentNames(mirror: CanvasMirror, from: string): string[] {
  const byId = new Map(mirror.nodes.map((n) => [n.id, n]))
  const self = byId.get(from)
  // `from` precisa ser um terminal: uma aresta que toca uma nota/arquivo não é `agent`.
  if (!self || self.type !== 'terminal') return []
  const names: string[] = []
  const seen = new Set<string>()
  for (const e of mirror.edges) {
    const otherId = e.source === from ? e.target : e.target === from ? e.source : undefined
    if (otherId === undefined || seen.has(otherId)) continue
    seen.add(otherId)
    const other = byId.get(otherId)
    if (other && other.type === 'terminal') names.push(other.name)
  }
  return names
}
