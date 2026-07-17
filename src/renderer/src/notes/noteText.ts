import { htmlToText } from '../context/contextBlock'

/**
 * Texto simples do corpo de uma nota, a partir do `data` do nó. Regra ÚNICA de leitura do corpo,
 * para rótulo/prévia e indexação da busca não divergirem do shape real.
 *
 * O shape de produção é `data.html` (TipTap): `addNoteNode` cria `{ html: '', color: undefined }` e
 * `updateNoteHtml` é o único caminho de escrita. `data.content` só existe em notas antigas
 * (pré-TipTap, `updateNoteContent`) — fallback de retrocompat, nunca o caminho principal.
 *
 * SEC-1: a extração passa por `htmlToText` (DOMParser inerte) — o html vem do disco sem sanitização.
 * Função pura.
 */
export function noteText(data?: Record<string, unknown>): string {
  const html = typeof data?.html === 'string' ? data.html : ''
  if (html) return htmlToText(html)
  const content = typeof data?.content === 'string' ? data.content : ''
  return content.trim()
}
