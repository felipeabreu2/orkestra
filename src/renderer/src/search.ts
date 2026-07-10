// Ranking puro do command palette (Fase 12): usado tanto pela busca de ações estáticas
// (Criar Terminal/Nota/Portal) quanto pelos nós do canvas — qualquer T com um `label` serve.
// Substring case-insensitive; ordena por posição do match (match no início do label cai
// naturalmente em idx=0, então "prefixo" já vence "match no meio" por essa mesma chave) e,
// em empate, pelo label mais curto. Sem match → item cai fora do resultado.
export function rankItems<T extends { label: string }>(query: string, items: T[]): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  const scored: Array<{ item: T; idx: number }> = []
  for (const item of items) {
    const idx = item.label.toLowerCase().indexOf(q)
    if (idx >= 0) scored.push({ item, idx })
  }
  scored.sort((a, b) => a.idx - b.idx || a.item.label.length - b.item.label.length)
  return scored.map((s) => s.item)
}
