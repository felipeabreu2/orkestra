import { htmlToText } from '../context/contextBlock'

const MAX_NAME = 40

/**
 * Nome de exibição de uma nota (Notas #10 · T1). O nome fixo (`data.name`) vence; sem ele, cai na
 * 1ª linha do conteúdo (`htmlToText` do `data.html`); sem nada, no fallback estável `'Nota'`.
 * Truncado em 40 caracteres — o mesmo teto do mirror (useOrchestrationSync), para não mudar o
 * `orq list`. Função pura.
 */
export function deriveNoteName(data: { name?: string; html?: string }): string {
  const fixed = (data.name ?? '').trim()
  if (fixed) return fixed.slice(0, MAX_NAME)
  const firstLine = htmlToText(data.html ?? '').split('\n')[0].trim()
  if (firstLine) return firstLine.slice(0, MAX_NAME)
  return 'Nota'
}
