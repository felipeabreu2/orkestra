// Localizar/substituir dentro da nota (2026-07-14). Busca PURA e testável: recebe os segmentos de
// texto do documento (cada nó de texto do ProseMirror, com sua posição no doc) e o termo, e devolve
// os ranges {from,to} (posições do doc) de cada ocorrência. Busca DENTRO de cada segmento — um match
// que atravessa uma fronteira de formatação (ex.: "he**ll**o" para "hello") não é encontrado; é uma
// limitação aceita da v1 (notas são majoritariamente texto simples).

export interface TextSegment {
  text: string
  pos: number // posição (no doc do ProseMirror) do 1º caractere deste segmento
}

export interface MatchRange {
  from: number
  to: number
}

export function findMatches(segments: TextSegment[], term: string, caseSensitive = false): MatchRange[] {
  const matches: MatchRange[] = []
  if (!term) return matches
  const needle = caseSensitive ? term : term.toLowerCase()
  for (const seg of segments) {
    const hay = caseSensitive ? seg.text : seg.text.toLowerCase()
    let idx = hay.indexOf(needle)
    while (idx !== -1) {
      matches.push({ from: seg.pos + idx, to: seg.pos + idx + term.length })
      idx = hay.indexOf(needle, idx + needle.length)
    }
  }
  return matches
}
