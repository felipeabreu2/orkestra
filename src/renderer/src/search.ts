// Ranking puro do command palette (Batuta Search): usado tanto pela busca de ações estáticas
// (Criar Terminal/Nota/Portal) quanto pelos nós do canvas — qualquer T com um `label` serve, e
// notas trazem o corpo inteiro em `searchText` (opcional).
//
// Busca fuzzy: cada termo da query precisa casar como *subsequência* (não precisa ser contígua)
// do nome OU do corpo, insensível a acento (normalização NFD) e a maiúsculas. Multi-palavra é
// AND independente de ordem: todos os termos precisam casar. Sem dependências externas — só
// subsequência + bônus de scoring, mantendo a função pura e determinística.

// Remove diacríticos (NFD separa a base do combinante; a faixa U+0300–U+036F são os combinantes)
// e baixa a caixa. Como NFD só *remove* marcas combinantes e não desloca o caractere-base, a
// contagem de caracteres-base é preservada.
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Casa `termo` como subsequência de `haystack` (ambos já normalizados). Devolve `null` quando não
// é subsequência, ou um score numérico (maior = melhor). Match greedy da esquerda para a direita,
// com bônus para: início do haystack, fronteira de palavra (após espaço), contiguidade dos chars
// casados e precocidade do primeiro match.
function subsequenceScore(termo: string, haystack: string): number | null {
  if (termo.length === 0) return 0
  let ti = 0
  let score = 0
  let firstIdx = -1
  let prevMatchIdx = -2
  for (let hi = 0; hi < haystack.length && ti < termo.length; hi++) {
    if (haystack[hi] === termo[ti]) {
      if (firstIdx === -1) firstIdx = hi
      if (hi === 0) score += 20 // começa no início do haystack
      else if (haystack[hi - 1] === ' ') score += 15 // fronteira de palavra
      if (hi === prevMatchIdx + 1) score += 10 // contíguo ao char anterior casado
      prevMatchIdx = hi
      ti++
    }
  }
  if (ti < termo.length) return null // termo não é subsequência do haystack
  score += Math.max(0, 10 - firstIdx) // precocidade: primeiro match mais cedo pontua mais
  return score
}

// Bônus grande para termos que casam no NOME em vez de só no corpo (searchText), garantindo que
// "matches no nome precedem matches no corpo".
const NAME_BONUS = 1000

export function rankItems<T extends { label: string; searchText?: string }>(
  query: string,
  items: T[]
): T[] {
  const termos = normalizar(query).split(/\s+/).filter(Boolean)
  if (termos.length === 0) return items // query vazia / só espaços → todos

  const scored: Array<{ item: T; score: number }> = []
  for (const item of items) {
    const nome = normalizar(item.label)
    const corpo = item.searchText ? normalizar(item.searchText) : ''
    let total = 0
    let matchesAll = true
    for (const termo of termos) {
      const nomeScore = subsequenceScore(termo, nome)
      if (nomeScore !== null) {
        total += nomeScore + NAME_BONUS
        continue
      }
      const corpoScore = corpo ? subsequenceScore(termo, corpo) : null
      if (corpoScore !== null) {
        total += corpoScore
        continue
      }
      matchesAll = false
      break
    }
    if (matchesAll) scored.push({ item, score: total })
  }

  // score desc; empate → label mais curto (preserva a intenção do tie-break original).
  scored.sort((a, b) => b.score - a.score || a.item.label.length - b.item.label.length)
  return scored.map((s) => s.item)
}
