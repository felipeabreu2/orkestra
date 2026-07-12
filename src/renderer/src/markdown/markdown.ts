export type InlineSpan =
  | { type: 'text'; value: string }
  | { type: 'strong'; value: string }
  | { type: 'em'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; text: string; href: string }

export type Block =
  | { type: 'heading'; level: number; spans: InlineSpan[] }
  | { type: 'paragraph'; spans: InlineSpan[] }
  | { type: 'code'; value: string; lang?: string }
  | { type: 'list'; ordered: boolean; items: InlineSpan[][] }
  | { type: 'quote'; spans: InlineSpan[] }
  | { type: 'hr' }

export function isSafeHref(href: string): boolean {
  const m = href.trim().match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
  if (!m) return true // sem esquema → relativo/âncora
  const scheme = m[1].toLowerCase()
  return scheme === 'http' || scheme === 'https' || scheme === 'mailto'
}

export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  let buf = ''
  let i = 0
  const flush = (): void => {
    if (buf) {
      spans.push({ type: 'text', value: buf })
      buf = ''
    }
  }
  while (i < text.length) {
    const rest = text.slice(i)
    let m = /^`([^`]+)`/.exec(rest)
    if (m) {
      flush()
      spans.push({ type: 'code', value: m[1] })
      i += m[0].length
      continue
    }
    m = /^\[([^\]]*)\]\(([^)\s(]+)\)/.exec(rest)
    if (m) {
      flush()
      spans.push(isSafeHref(m[2]) ? { type: 'link', text: m[1], href: m[2] } : { type: 'text', value: m[0] })
      i += m[0].length
      continue
    }
    m = /^\*\*([^*]+)\*\*/.exec(rest)
    if (m) {
      flush()
      spans.push({ type: 'strong', value: m[1] })
      i += m[0].length
      continue
    }
    m = /^\*([^*]+)\*/.exec(rest)
    if (m) {
      flush()
      spans.push({ type: 'em', value: m[1] })
      i += m[0].length
      continue
    }
    m = /^_([^_]+)_/.exec(rest)
    if (m) {
      flush()
      spans.push({ type: 'em', value: m[1] })
      i += m[0].length
      continue
    }
    buf += text[i]
    i++
  }
  flush()
  return spans
}

const RE_HEADING = /^(#{1,6})\s+(.*)$/
const RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/
const RE_QUOTE = /^>\s?/
const RE_LIST = /^\s*([-*+]|\d+\.)\s+/
const RE_ORDERED = /^\s*\d+\.\s+/
const RE_BLANK = /^\s*$/
const RE_FENCE = /^```(.*)$/

function startsBlock(line: string): boolean {
  return (
    RE_BLANK.test(line) ||
    RE_FENCE.test(line) ||
    RE_HEADING.test(line) ||
    RE_QUOTE.test(line) ||
    RE_LIST.test(line) ||
    RE_HR.test(line)
  )
}

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (RE_BLANK.test(line)) {
      i++
      continue
    }
    const fence = RE_FENCE.exec(line)
    if (fence) {
      const lang = fence[1].trim() || undefined
      const body: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i])
        i++
      }
      i++ // consome o fence de fechamento (se houver)
      blocks.push(lang ? { type: 'code', value: body.join('\n'), lang } : { type: 'code', value: body.join('\n') })
      continue
    }
    const h = RE_HEADING.exec(line)
    if (h) {
      blocks.push({ type: 'heading', level: h[1].length, spans: parseInline(h[2].trim()) })
      i++
      continue
    }
    if (RE_HR.test(line)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }
    if (RE_QUOTE.test(line)) {
      const q: string[] = []
      while (i < lines.length && RE_QUOTE.test(lines[i])) {
        q.push(lines[i].replace(RE_QUOTE, ''))
        i++
      }
      blocks.push({ type: 'quote', spans: parseInline(q.join(' ')) })
      continue
    }
    if (RE_LIST.test(line)) {
      const ordered = RE_ORDERED.test(line)
      const items: InlineSpan[][] = []
      while (i < lines.length && RE_LIST.test(lines[i]) && RE_ORDERED.test(lines[i]) === ordered) {
        items.push(parseInline(lines[i].replace(RE_LIST, '')))
        i++
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    const para: string[] = []
    while (i < lines.length && !startsBlock(lines[i])) {
      para.push(lines[i])
      i++
    }
    blocks.push({ type: 'paragraph', spans: parseInline(para.join(' ')) })
  }
  return blocks
}
