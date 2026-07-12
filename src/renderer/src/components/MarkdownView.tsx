import type { JSX } from 'react'
import { parseBlocks, type InlineSpan } from '../markdown/markdown'

function renderSpans(spans: InlineSpan[]): JSX.Element[] {
  return spans.map((s, k) => {
    switch (s.type) {
      case 'strong':
        return <strong key={k}>{s.value}</strong>
      case 'em':
        return <em key={k}>{s.value}</em>
      case 'code':
        return (
          <code key={k} className="ork-md-code">
            {s.value}
          </code>
        )
      case 'link':
        return (
          <a key={k} href={s.href} target="_blank" rel="noreferrer noopener">
            {s.text}
          </a>
        )
      default:
        return <span key={k}>{s.value}</span>
    }
  })
}

export function MarkdownView({ text }: { text: string }): JSX.Element {
  const blocks = parseBlocks(text)
  return (
    <div className="ork-md">
      {blocks.map((b, k) => {
        switch (b.type) {
          case 'heading': {
            const Tag = `h${Math.min(b.level, 6)}` as 'h1'
            return <Tag key={k}>{renderSpans(b.spans)}</Tag>
          }
          case 'paragraph':
            return <p key={k}>{renderSpans(b.spans)}</p>
          case 'code':
            return (
              <pre key={k} className="ork-md-pre">
                <code>{b.value}</code>
              </pre>
            )
          case 'quote':
            return <blockquote key={k}>{renderSpans(b.spans)}</blockquote>
          case 'hr':
            return <hr key={k} />
          case 'list':
            return b.ordered ? (
              <ol key={k}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderSpans(it)}</li>
                ))}
              </ol>
            ) : (
              <ul key={k}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderSpans(it)}</li>
                ))}
              </ul>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
