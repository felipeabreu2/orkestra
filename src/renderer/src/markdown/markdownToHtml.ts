import { parseBlocks, isSafeHref, type InlineSpan, type Block } from './markdown'

// Serializa a AST do parser Markdown do projeto (parseBlocks/parseInline) para HTML — usado só na
// MIGRAÇÃO das notas antigas (Markdown) para o editor TipTap (HTML). Escapa todo texto/atributo
// (nada de HTML cru vindo do usuário) e só emite href de links seguros (isSafeHref).
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escAttr(s: string): string {
  return esc(s).replace(/"/g, '&quot;')
}

function spansToHtml(spans: InlineSpan[]): string {
  return spans
    .map((s) => {
      switch (s.type) {
        case 'strong':
          return `<strong>${esc(s.value)}</strong>`
        case 'em':
          return `<em>${esc(s.value)}</em>`
        case 'code':
          return `<code>${esc(s.value)}</code>`
        case 'link':
          return isSafeHref(s.href) ? `<a href="${escAttr(s.href)}">${esc(s.text)}</a>` : esc(s.text)
        default:
          return esc(s.value)
      }
    })
    .join('')
}

function blockToHtml(b: Block): string {
  switch (b.type) {
    case 'heading':
      return `<h${b.level}>${spansToHtml(b.spans)}</h${b.level}>`
    case 'paragraph':
      return `<p>${spansToHtml(b.spans)}</p>`
    case 'code':
      return `<pre><code>${esc(b.value)}</code></pre>`
    case 'list':
      return `<${b.ordered ? 'ol' : 'ul'}>${b.items
        .map((it) => `<li>${spansToHtml(it)}</li>`)
        .join('')}</${b.ordered ? 'ol' : 'ul'}>`
    case 'quote':
      return `<blockquote>${spansToHtml(b.spans)}</blockquote>`
    case 'hr':
      return '<hr>'
    default:
      return ''
  }
}

export function markdownToHtml(md: string): string {
  if (!md.trim()) return ''
  return parseBlocks(md).map(blockToHtml).join('')
}
