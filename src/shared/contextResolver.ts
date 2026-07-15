import type { CanvasMirror, MirrorNode } from './orchestration'

// Resolver puro de contexto (quick win #5 do plano de Conexões). Vive em `shared/` porque é
// importado pelo MAIN (OrchestrationServer → GET /context) e é agnóstico de processo: sem HTTP,
// sem DOM, sem React, sem `src/renderer/**`. A tipagem "chain" (cadeia de notas) é derivada de
// `node.type === 'note'` nas duas pontas — o `MirrorEdge` não carrega `kind` de propósito, então
// não dependemos do `deriveEdgeKind` do renderer nem de mirrors legados.

const DEFAULT_MAX_DEPTH = 64

/**
 * A partir de um nó de origem (`from`, tipicamente um terminal), devolve todos os nós que o agente
 * daquele terminal enxerga como contexto — vizinhos diretos (1 salto, qualquer tipo) MAIS a cadeia
 * de NOTAS alcançável transitivamente por arestas `note↔note`.
 *
 * Regras:
 * - Grafo tratado como NÃO-DIRECIONAL (um bloco ligado em qualquer ponta é legível).
 * - O próprio `from` e quaisquer terminais nunca entram no resultado; um terminal também QUEBRA a
 *   travessia (não se atravessa "através" dele).
 * - A transitividade percorre SÓ arestas `note↔note`; file/portal/etc. entram apenas como folha de
 *   1 salto (não têm sua vizinhança explorada).
 * - Ordem de descoberta (BFS): raiz antes das descendentes. Sem duplicatas.
 * - Guarda anti-ciclo por `visited`; `maxDepth` (default 64) limita a profundidade por nível.
 */
export function resolveContextNodes(
  mirror: CanvasMirror,
  from: string,
  opts?: { maxDepth?: number }
): MirrorNode[] {
  const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_DEPTH

  const byId = new Map<string, MirrorNode>()
  for (const n of mirror.nodes ?? []) byId.set(n.id, n)

  // Adjacência não-direcional: cada aresta insere os dois sentidos. O Set deduplica multi-arestas.
  const adj = new Map<string, Set<string>>()
  const link = (a: string, b: string): void => {
    let s = adj.get(a)
    if (!s) {
      s = new Set<string>()
      adj.set(a, s)
    }
    s.add(b)
  }
  for (const e of mirror.edges ?? []) {
    link(e.source, e.target)
    link(e.target, e.source)
  }

  const isNote = (id: string): boolean => byId.get(id)?.type === 'note'
  const isTerminal = (id: string): boolean => byId.get(id)?.type === 'terminal'

  const result: MirrorNode[] = []
  const visited = new Set<string>([from])

  // Fronteira do nível 1 = vizinhos diretos de `from`.
  let frontier: string[] = []
  for (const viz of adj.get(from) ?? []) {
    if (!visited.has(viz)) {
      visited.add(viz)
      frontier.push(viz)
    }
  }

  // BFS por níveis. `depth` começa em 1 (vizinhos diretos); paramos ao ultrapassar `maxDepth`.
  for (let depth = 1; frontier.length > 0 && depth <= maxDepth; depth++) {
    const next: string[] = []
    for (const id of frontier) {
      // Terminal quebra a cadeia: não entra no resultado e não é atravessado.
      if (isTerminal(id)) continue
      const node = byId.get(id)
      if (node) result.push(node)
      // Transitividade só por note↔note; file/portal são folhas de 1 salto (não exploradas).
      if (isNote(id)) {
        for (const viz of adj.get(id) ?? []) {
          if (!visited.has(viz) && isNote(viz)) {
            visited.add(viz)
            next.push(viz)
          }
        }
      }
    }
    frontier = next
  }

  return result
}

/**
 * Formata os nós resolvidos no bloco de contexto do `/context` — byte-a-byte com o formato atual:
 * `[contexto — <label>: <name>]\n<content>`, blocos separados por `\n\n`. Filtra nós de conteúdo
 * vazio (o resolver é estrutural: atravessa notas-índice vazias, mas elas não viram bloco).
 */
export function formatContextBlocks(nodes: MirrorNode[]): string {
  return nodes
    .filter((n) => (n.content ?? '').trim() !== '')
    .map((n) => {
      const label =
        n.type === 'note'
          ? 'nota'
          : n.type === 'file'
            ? 'arquivo'
            : n.type === 'portal'
              ? 'site'
              : n.type
      return `[contexto — ${label}: ${n.name}]\n${(n.content ?? '').trim()}`
    })
    .join('\n\n')
}
