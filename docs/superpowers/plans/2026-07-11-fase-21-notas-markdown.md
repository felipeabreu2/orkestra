# Orkestra — Fase 21 (Notas em Markdown) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A nota do canvas passa a **renderizar Markdown** com um **toggle editar/visualizar**: no modo "visualizar" o conteúdo aparece formatado (títulos, **negrito**, *itálico*, `código`, listas, citações, links, regras); no modo "editar" continua o `textarea` atual. Um **parser Markdown próprio** (sem dependências novas) converte o texto em uma árvore de blocos, e um componente de render mapeia essa árvore para elementos React (que escapam o texto — sem `dangerouslySetInnerHTML`, sem risco de XSS).

**Architecture:** Um módulo puro `src/renderer/src/markdown/markdown.ts` expõe `parseBlocks(text): Block[]` e `parseInline(text): InlineSpan[]` — 100% testável, sem React. Um componente `MarkdownView.tsx` faz o mapeamento 1:1 `Block → JSX` (sem lógica de parsing). O `NoteNode.tsx` ganha um estado local `mode: 'edit' | 'preview'` (não persistido) e um botão no header para alternar; em `preview` renderiza `<MarkdownView text={content} />`, em `edit` o `textarea` atual. Links externos são abertos no navegador do SO via `setWindowOpenHandler` no main (padrão Electron — nega janela nova, chama `shell.openExternal` para http/https).

**Tech Stack:** Parser próprio em TypeScript (zero deps). Vitest (`environment: 'node'`, arquivos `*.test.ts`, `globals:false` → importar `describe/it/expect` de `vitest`). React 18.

## Global Constraints

- **Sem dependências novas.** O parser é próprio; confirmado que não há `marked`/`markdown-it`/`react-markdown`/`remark` no projeto.
- **Segurança:** render via elementos React (nunca `dangerouslySetInnerHTML`). Links só navegam se o href tiver esquema **http/https/mailto** ou for relativo/âncora; `javascript:`/`data:`/`file:`/`vbscript:` viram texto plano. `<a>` usa `rel="noreferrer noopener"`. Renderer/preload não importam `fs`/`http`/`node-pty`/`child_process`.
- **Persistência intacta:** o modo preview/edit é **estado local do componente, não vai para `data`** — assim o teste de round-trip existente (`canvasStore.test.ts`, "conteúdo da nota sobrevive ao round-trip", que faz igualdade exata `data === { content: '…' }`) continua verde. Não adicionar campos novos a `data` da nota.
- Zero regressão a terminais/`orq`/portais/projetos/árvore/grupos/atenção/palette. Nomenclatura em PT-BR, sem marcas de terceiros.

---

### Task 1: Parser Markdown puro (`markdown.ts`) — TDD

**Files:**
- Create: `src/renderer/src/markdown/markdown.ts`, `src/renderer/src/markdown/markdown.test.ts`

**Interfaces:**
- Produces (consumido pela Task 2):
  ```ts
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

  export function isSafeHref(href: string): boolean
  export function parseInline(text: string): InlineSpan[]
  export function parseBlocks(src: string): Block[]
  ```

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Em `src/renderer/src/markdown/markdown.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isSafeHref, parseInline, parseBlocks } from './markdown'

describe('isSafeHref', () => {
  it('aceita http, https, mailto, relativo e âncora', () => {
    expect(isSafeHref('https://a.com')).toBe(true)
    expect(isSafeHref('http://a.com')).toBe(true)
    expect(isSafeHref('mailto:x@y.com')).toBe(true)
    expect(isSafeHref('/docs/x')).toBe(true)
    expect(isSafeHref('#secao')).toBe(true)
    expect(isSafeHref('./rel.md')).toBe(true)
  })
  it('rejeita esquemas perigosos', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
    expect(isSafeHref('data:text/html,x')).toBe(false)
    expect(isSafeHref('file:///etc/passwd')).toBe(false)
    expect(isSafeHref('vbscript:x')).toBe(false)
  })
})

describe('parseInline', () => {
  it('texto puro vira um único span de texto', () => {
    expect(parseInline('olá mundo')).toEqual([{ type: 'text', value: 'olá mundo' }])
  })
  it('reconhece negrito, itálico e código', () => {
    expect(parseInline('a **b** c')).toEqual([
      { type: 'text', value: 'a ' }, { type: 'strong', value: 'b' }, { type: 'text', value: ' c' }
    ])
    expect(parseInline('um *dois*')).toEqual([
      { type: 'text', value: 'um ' }, { type: 'em', value: 'dois' }
    ])
    expect(parseInline('use `code` aqui')).toEqual([
      { type: 'text', value: 'use ' }, { type: 'code', value: 'code' }, { type: 'text', value: ' aqui' }
    ])
  })
  it('itálico com underscore', () => {
    expect(parseInline('_ok_')).toEqual([{ type: 'em', value: 'ok' }])
  })
  it('link seguro vira span de link; link inseguro vira texto', () => {
    expect(parseInline('veja [aqui](https://x.com)')).toEqual([
      { type: 'text', value: 'veja ' }, { type: 'link', text: 'aqui', href: 'https://x.com' }
    ])
    expect(parseInline('[x](javascript:alert(1))')).toEqual([
      { type: 'text', value: '[x](javascript:alert(1))' }
    ])
  })
  it('código inline preserva asteriscos internos (não os interpreta)', () => {
    expect(parseInline('`a*b*c`')).toEqual([{ type: 'code', value: 'a*b*c' }])
  })
})

describe('parseBlocks', () => {
  it('título com nível pelo número de #', () => {
    expect(parseBlocks('## Olá')).toEqual([
      { type: 'heading', level: 2, spans: [{ type: 'text', value: 'Olá' }] }
    ])
  })
  it('parágrafos separados por linha em branco; linhas contíguas juntam', () => {
    const b = parseBlocks('linha um\nlinha dois\n\nsegundo')
    expect(b).toEqual([
      { type: 'paragraph', spans: [{ type: 'text', value: 'linha um linha dois' }] },
      { type: 'paragraph', spans: [{ type: 'text', value: 'segundo' }] }
    ])
  })
  it('bloco de código cercado por ``` preserva conteúdo e lang', () => {
    const b = parseBlocks('```ts\nconst a = 1\n```')
    expect(b).toEqual([{ type: 'code', value: 'const a = 1', lang: 'ts' }])
  })
  it('lista não-ordenada e ordenada', () => {
    expect(parseBlocks('- um\n- dois')).toEqual([
      { type: 'list', ordered: false, items: [[{ type: 'text', value: 'um' }], [{ type: 'text', value: 'dois' }]] }
    ])
    expect(parseBlocks('1. a\n2. b')).toEqual([
      { type: 'list', ordered: true, items: [[{ type: 'text', value: 'a' }], [{ type: 'text', value: 'b' }]] }
    ])
  })
  it('citação e regra horizontal', () => {
    expect(parseBlocks('> nota')).toEqual([
      { type: 'quote', spans: [{ type: 'text', value: 'nota' }] }
    ])
    expect(parseBlocks('---')).toEqual([{ type: 'hr' }])
  })
  it('texto vazio vira lista vazia de blocos', () => {
    expect(parseBlocks('')).toEqual([])
    expect(parseBlocks('   \n  \n')).toEqual([])
  })
  it('mistura títulos, listas e parágrafos na ordem correta', () => {
    const b = parseBlocks('# T\n\ntexto\n\n- a\n- b')
    expect(b.map((x) => x.type)).toEqual(['heading', 'paragraph', 'list'])
  })
})
```

- [ ] **Step 2: Rodar os testes e ver falhar** — `npm test -- markdown` → falha (módulo não existe).

- [ ] **Step 3: Implementar `markdown.ts`**

```ts
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
    m = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest)
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
```

- [ ] **Step 4: Rodar testes + typecheck + build** — `npm test` (todos verdes, incl. os novos), `npm run typecheck`, `npm run build` — limpos.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: parser Markdown proprio (parseBlocks/parseInline) + href seguro (Fase 21)"`

---

### Task 2: `MarkdownView` + toggle no `NoteNode` + links externos + CSS (+ checkpoint)

**Files:**
- Create: `src/renderer/src/components/MarkdownView.tsx`
- Modify: `src/renderer/src/components/NoteNode.tsx`, `src/renderer/src/components/nodes.css`, `src/main/index.ts`

**Interfaces:**
- Consumes: `parseBlocks`, `Block`, `InlineSpan` de `../markdown/markdown` (Task 1).
- Produces: `export function MarkdownView({ text }: { text: string }): JSX.Element`.

- [ ] **Step 1: `MarkdownView.tsx`** (mapeamento puro `Block → JSX`, sem parsing)

```tsx
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
```

- [ ] **Step 2: Integrar no `NoteNode.tsx`** — modo local `edit`/`preview` (não persistido), botão no header, dblclick no preview → edit

Reescrever o corpo (preservando header/handles/NodeResizer existentes):
```tsx
import { useState } from 'react'
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { MarkdownView } from './MarkdownView'
import './nodes.css'

export function NoteNode({ id, selected, data }: NodeProps): JSX.Element {
  const updateNoteContent = useCanvasStore((s) => s.updateNoteContent)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const content = (data?.content as string) ?? ''
  const [mode, setMode] = useState<'edit' | 'preview'>(content.trim() ? 'preview' : 'edit')
  return (
    <>
      <NodeResizer minWidth={160} minHeight={100} isVisible={selected ?? false} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="ork-node">
        <div className="ork-node-header">
          <span className="ork-node-dot ork-node-dot--note" aria-hidden="true" />
          <span className="ork-node-title">Nota</span>
          <button
            className="nodrag ork-node-toggle"
            onClick={() => setMode((m) => (m === 'edit' ? 'preview' : 'edit'))}
            aria-label={mode === 'edit' ? 'Ver formatado' : 'Editar'}
            title={mode === 'edit' ? 'Ver formatado' : 'Editar'}
          >
            {mode === 'edit' ? 'Ver' : 'Editar'}
          </button>
          <button
            className="nodrag ork-node-iconbtn"
            onClick={() => removeNode(id)}
            aria-label="Fechar nota"
            title="Remover nó"
          >
            ×
          </button>
        </div>
        {mode === 'edit' ? (
          <textarea
            className="nodrag nowheel ork-note-textarea"
            value={content}
            onChange={(e) => updateNoteContent(id, e.target.value)}
            placeholder="Escreva… (Markdown)"
            autoFocus
          />
        ) : (
          <div
            className="nodrag nowheel ork-note-preview"
            onDoubleClick={() => setMode('edit')}
            title="Duplo-clique para editar"
          >
            {content.trim() ? (
              <MarkdownView text={content} />
            ) : (
              <span className="ork-note-empty">Nota vazia — duplo-clique para editar.</span>
            )}
          </div>
        )}
      </div>
    </>
  )
}
```
Nota: manter a assinatura/exports do arquivo como estão hoje (export nomeado `NoteNode`). Não alterar `addNoteNode`/`updateNoteContent` no store. O `autoFocus` no textarea ajuda ao alternar para edição.

- [ ] **Step 3: Abrir links externos no navegador do SO** — em `src/main/index.ts`

Procurar por um `setWindowOpenHandler` já existente na criação da `mainWindow`. **Se já existir**, garantir que ele trata http/https com `shell.openExternal` e retorna `{ action: 'deny' }`. **Se não existir**, adicionar logo após criar a `BrowserWindow` (e garantir `import { shell } from 'electron'` no topo):
```ts
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  if (/^https?:\/\//i.test(url)) {
    void shell.openExternal(url)
  }
  return { action: 'deny' }
})
```
Isso cobre o `target="_blank"` dos links das notas (e é uma defesa geral: nenhuma janela Electron nova é criada por conteúdo). **Cuidado:** se houver lógica de `will-attach-webview`/portais que dependa de `window.open`, não removê-la — apenas assegurar que links http(s) abram externamente. Se a base já tiver um handler equivalente, deixar como está e anotar no relatório.

- [ ] **Step 4: CSS em `nodes.css`** — o botão toggle + o container de preview + estilos do markdown (usar tokens de `tokens.css`)

Acrescentar (perto do bloco `.ork-note-textarea`):
```css
.ork-node-toggle {
  margin-left: auto;
  padding: 1px 7px;
  font-size: 11px;
  color: var(--text-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.ork-node-toggle:hover {
  color: var(--text-1);
  border-color: var(--border-strong);
}
/* quando o toggle usa margin-left:auto, o botão × que vem depois precisa de um respiro */
.ork-node-toggle + .ork-node-iconbtn {
  margin-left: 4px;
}

.ork-note-preview {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 10px;
  color: var(--text-1);
  font-size: 13px;
  line-height: 1.5;
}
.ork-note-empty {
  color: var(--text-3);
  font-size: 12px;
}

.ork-md > :first-child { margin-top: 0; }
.ork-md > :last-child { margin-bottom: 0; }
.ork-md h1, .ork-md h2, .ork-md h3, .ork-md h4, .ork-md h5, .ork-md h6 {
  margin: 10px 0 6px;
  line-height: 1.25;
  color: var(--text-1);
}
.ork-md h1 { font-size: 18px; }
.ork-md h2 { font-size: 16px; }
.ork-md h3 { font-size: 14px; }
.ork-md h4, .ork-md h5, .ork-md h6 { font-size: 13px; }
.ork-md p { margin: 6px 0; }
.ork-md ul, .ork-md ol { margin: 6px 0; padding-left: 20px; }
.ork-md li { margin: 2px 0; }
.ork-md a { color: var(--accent); text-decoration: underline; }
.ork-md blockquote {
  margin: 6px 0;
  padding: 2px 10px;
  border-left: 3px solid var(--border-strong);
  color: var(--text-2);
}
.ork-md hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 10px 0;
}
.ork-md-code {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 4px;
}
.ork-md-pre {
  margin: 6px 0;
  padding: 8px 10px;
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: auto;
}
.ork-md-pre code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-1);
  white-space: pre;
}
```

- [ ] **Step 5: Testes + typecheck + build** — `npm test` (241+ verdes; nada quebrado — em especial o round-trip da nota), `npm run typecheck`, `npm run build` (o `.tsx` novo compila), `npm run lint` — limpos.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: NoteNode com toggle editar/visualizar + render Markdown + links externos (Fase 21)"`

- [ ] **Step 7: CHECKPOINT VISUAL (humano)** — `npm run dev`. Criar uma Nota; digitar Markdown (ex.: `# Título`, `**negrito**`, `- item`, `` `code` ``, `> citação`, `[link](https://example.com)`); clicar **Ver** → aparece formatado; duplo-clique no preview → volta a editar; clicar num link → abre no navegador do SO. Fechar/reabrir o app → o conteúdo persiste (e reabre em modo "Ver" por ter conteúdo).

---

## Notas de risco
- **Parser é um subconjunto de Markdown** (sem tabelas, sem imagens inline, sem ênfase aninhada, sem listas aninhadas por indentação). É o MVP alinhado ao mapa; imagens e `.md` arrastado do Finder são refinamentos de ondas futuras. Documentar a limitação.
- **XSS:** eliminado por construção — só elementos React (que escapam texto), nunca HTML cru; hrefs filtrados por `isSafeHref`.
- **Modo não-persistido:** ao reabrir, a nota decide o modo pelo conteúdo (preview se não-vazia). Escolhido para não quebrar o teste de round-trip por igualdade exata e por ser o comportamento desejável ("notas mostram o formatado por padrão").
- **`setWindowOpenHandler`:** se a base já tiver um (por causa de portais/webview), estender em vez de sobrescrever; o objetivo é só garantir que links http(s) das notas abram externamente e que nenhuma janela Electron nova seja criada por conteúdo.
