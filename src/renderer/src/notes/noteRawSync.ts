import { htmlToMarkdown } from '../markdown/htmlToMarkdown'
import { markdownToHtml } from '../markdown/markdownToHtml'

// Conversões puras do toggle raw ↔ formatada da nota (Notas · T7). O modo raw mostra o Markdown cru
// (htmlToMarkdown do HTML do editor) num textarea; ao editar/voltar, o Markdown vira HTML de novo
// (markdownToHtml) e é gravado. Round-trip estável só para o subconjunto do T3 — cor/fonte/imagem
// não têm representação Markdown e se perdem (risco documentado; o toggle assume isso).

export function noteHtmlToRaw(html: string): string {
  return htmlToMarkdown(html)
}

export function noteRawToHtml(raw: string): string {
  return markdownToHtml(raw)
}
