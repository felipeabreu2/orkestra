# Onda 5 — Notas rich-text (TipTap) + post-its coloridos (F06/F07) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps em checkbox.

**Goal:** A nota vira um editor WYSIWYG (TipTap) com barra de formatação abaixo da topbar (cor, tamanho, B/I/S/U, código, heading, listas, imagem) e cor de post-it preenchendo o fundo. O Markdown das notas antigas é migrado para HTML sem perda.

**Architecture:** `NoteNode` passa a montar um editor TipTap (`useEditor`), persistindo `data.html` (debounced) e `data.color`. Um **registry de editores** (molde do `terminalRegistry`) expõe o editor da nota ao `NodeToolbar`, que — quando o nó é nota — renderiza a barra de formatação controlando esse editor. A migração usa um serializador puro `markdownToHtml` (reaproveita o parser `parseBlocks`/`parseInline` já existente). Modelo da nota: `{ html: string; color?: string }` (antes `{ content }`).

**Tech Stack:** TipTap v3.27 (`@tiptap/react`, `@tiptap/starter-kit` [inclui Underline/Link/Heading/listas/code], `@tiptap/extension-text-style` [TextStyle+Color+FontSize+FontFamily], `@tiptap/extension-image`), React 18, zustand 5, Vitest.

## Global Constraints

- UI/comentários/commits em **português**. Deps TipTap já instaladas.
- Teste: lógica pura (`markdownToHtml`, store) → TDD (`*.test.ts`); NoteNode/barra (componentes TipTap) → `typecheck`/`lint`/`build` + checkpoint visual (imagens 6/7). Não testar o editor TipTap em si (lib de terceiro).
- **zustand v5:** seletores primitivos; nada de derivados sem `useShallow`.
- **Ícones:** barra usa o wrapper `Icon` ([[reference_orkestra_icons]]).
- **Migração segura:** a conversão é lazy no `NoteNode` (nota antiga com `content` e sem `html` → converte e passa a persistir `html`). O `content` original **não é apagado** do snapshot na v1 (fica como fallback até a migração estar validada) — só deixa de ser usado.
- **React Flow:** a área do editor precisa de `nodrag nowheel` (selecionar texto/rolar sem arrastar/zoom o nó).

---

### Task 1: `markdownToHtml` (serializador AST→HTML) — migração

**Files:**
- Create: `src/renderer/src/markdown/markdownToHtml.ts`
- Test: `src/renderer/src/markdown/markdownToHtml.test.ts`

**Interfaces:**
- Consumes: `parseBlocks`/`isSafeHref` de `./markdown`.
- Produces: `markdownToHtml(md: string): string`.

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from 'vitest'
import { markdownToHtml } from './markdownToHtml'

describe('markdownToHtml', () => {
  it('converte heading e parágrafo', () => {
    expect(markdownToHtml('# Oi\n\ntexto')).toBe('<h1>Oi</h1><p>texto</p>')
  })
  it('converte ênfases inline', () => {
    expect(markdownToHtml('**b** e *i* e `c`')).toBe('<p><strong>b</strong> e <em>i</em> e <code>c</code></p>')
  })
  it('escapa HTML no texto', () => {
    expect(markdownToHtml('a < b & c')).toBe('<p>a &lt; b &amp; c</p>')
  })
  it('lista não-ordenada', () => {
    expect(markdownToHtml('- um\n- dois')).toBe('<ul><li>um</li><li>dois</li></ul>')
  })
  it('string vazia vira string vazia', () => {
    expect(markdownToHtml('')).toBe('')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/renderer/src/markdown/markdownToHtml.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
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
          return isSafeHref(s.href)
            ? `<a href="${escAttr(s.href)}">${esc(s.text)}</a>`
            : esc(s.text)
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
      return `<${b.ordered ? 'ol' : 'ul'}>${b.items.map((it) => `<li>${spansToHtml(it)}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`
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
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/renderer/src/markdown/markdownToHtml.test.ts` → PASS. (Se o `parseBlocks` emitir um heading com nível/estrutura diferente, ajustar o teste ao que o parser realmente produz — a fonte da verdade é `markdown.ts`.)

- [ ] **Step 5: Commit**
```bash
git add src/renderer/src/markdown/markdownToHtml.ts src/renderer/src/markdown/markdownToHtml.test.ts
git commit -m "feat(notes): markdownToHtml — serializador p/ migrar notas antigas (Onda 5)"
```

---

### Task 2: Store — modelo `{ html, color }` da nota

**Files:**
- Modify: `src/renderer/src/store/canvasStore.ts` (interface + `addNoteNode` + novas ações)
- Modify: `src/renderer/src/store/canvasStore.test.ts`

**Interfaces:**
- Produces: `updateNoteHtml(id, html)`, `updateNoteColor(id, color)`; `addNoteNode` cria `data: { html: '', color: undefined }`.

- [ ] **Step 1: Teste que falha** — adicionar ao `canvasStore.test.ts`:
```ts
describe('nota rich-text', () => {
  it('addNoteNode cria com html vazio; updateNoteHtml/Color atualizam', () => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], lastCommitTag: null })
    useCanvasStore.getState().addNoteNode({ x: 0, y: 0 })
    const id = useCanvasStore.getState().nodes[0].id
    expect((useCanvasStore.getState().nodes[0].data as { html?: string }).html).toBe('')
    useCanvasStore.getState().updateNoteHtml(id, '<p>oi</p>')
    useCanvasStore.getState().updateNoteColor(id, 'amarelo')
    const data = useCanvasStore.getState().nodes[0].data as { html?: string; color?: string }
    expect(data.html).toBe('<p>oi</p>')
    expect(data.color).toBe('amarelo')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar no store**
  - Interface: adicionar `updateNoteHtml: (id: string, html: string) => void` e `updateNoteColor: (id: string, color: string) => void` (perto de `updateNoteContent`, que fica para compat/migração).
  - `addNoteNode`: trocar `data: { content: '' }` por `data: { html: '', color: undefined }`.
  - Implementar (com histórico coalescido, como as outras edições de nota):
```ts
  updateNoteHtml: (id, html): void =>
    set((state) => ({
      ...histPatch(state, 'notehtml:' + id),
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, html } } : n))
    })),
  updateNoteColor: (id, color): void =>
    set((state) => ({
      ...histPatch(state, 'notecolor:' + id),
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, color } } : n))
    })),
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/renderer/src/store/canvasStore.test.ts`.

- [ ] **Step 5: Typecheck + commit**
```bash
git add src/renderer/src/store/canvasStore.ts src/renderer/src/store/canvasStore.test.ts
git commit -m "feat(notes): modelo {html,color} da nota no store (Onda 5)"
```

---

### Task 3: `NoteNode` com TipTap + registry de editores + cor + CSS (smoke/checkpoint)

**Files:**
- Create: `src/renderer/src/notes/noteEditorRegistry.ts`
- Create: `src/renderer/src/notes/noteColors.ts`
- Modify: `src/renderer/src/components/NoteNode.tsx` (reescrever)
- Modify: `src/renderer/src/components/nodes.css` (estilos do editor + post-it)

**Interfaces:**
- Consumes: `markdownToHtml` (T1); `updateNoteHtml`/`updateNoteColor` (T2).
- Produces: `registerNoteEditor`/`unregisterNoteEditor`/`getNoteEditor`/`subscribeNoteEditors`; `NOTE_COLORS` (paleta) e `noteColorBg(color)`.

- [ ] **Step 1: Registry de editores** — `notes/noteEditorRegistry.ts`:
```ts
import type { Editor } from '@tiptap/react'

// Expõe o editor TipTap de cada nota (por nodeId) à barra de formatação, que vive FORA do nó
// (NodeToolbar, abaixo da topbar). Molde do terminalRegistry. `subscribe` avisa a barra quando um
// editor registra/sai (ex.: ao selecionar outra nota), para ela repegar o editor certo.
const editors = new Map<string, Editor>()
const listeners = new Set<() => void>()

export function registerNoteEditor(id: string, editor: Editor): void {
  editors.set(id, editor)
  listeners.forEach((l) => l())
}
export function unregisterNoteEditor(id: string): void {
  if (editors.delete(id)) listeners.forEach((l) => l())
}
export function getNoteEditor(id: string): Editor | undefined {
  return editors.get(id)
}
export function subscribeNoteEditors(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
```

- [ ] **Step 2: Paleta de cores** — `notes/noteColors.ts`:
```ts
// Cores de post-it (F07). Chave persistida em data.color; o valor é a cor de fundo. `undefined`/
// ausente = post-it neutro (padrão do tema). Tons suaves que funcionam nos dois temas com texto
// escuro (as notas coloridas usam texto escuro fixo — ver nodes.css).
export const NOTE_COLORS: Array<{ key: string; label: string; bg: string }> = [
  { key: 'amarelo', label: 'Amarelo', bg: '#fff4b8' },
  { key: 'rosa', label: 'Rosa', bg: '#ffc9de' },
  { key: 'azul', label: 'Azul', bg: '#bfe3ff' },
  { key: 'verde', label: 'Verde', bg: '#c9f0d1' },
  { key: 'roxo', label: 'Roxo', bg: '#e0d1ff' },
  { key: 'laranja', label: 'Laranja', bg: '#ffd9b0' }
]

export function noteColorBg(color?: string): string | undefined {
  return NOTE_COLORS.find((c) => c.key === color)?.bg
}
```

- [ ] **Step 3: Reescrever `NoteNode.tsx`**

```tsx
import { useEffect } from 'react'
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color, FontSize, FontFamily } from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'
import { useCanvasStore } from '../store/canvasStore'
import { markdownToHtml } from '../markdown/markdownToHtml'
import { noteColorBg } from '../notes/noteColors'
import { registerNoteEditor, unregisterNoteEditor } from '../notes/noteEditorRegistry'
import './nodes.css'

// Extensões compartilhadas por todas as notas (constante de módulo — não recriar por render, o
// TipTap avisa sobre isso). StarterKit já traz bold/italic/strike/underline/heading/listas/code/
// link; text-style traz cor/fonte/tamanho de texto; Image insere imagens por URL.
const NOTE_EXTENSIONS = [StarterKit, TextStyle, Color, FontSize, FontFamily, Image]

export function NoteNode({ id, selected, data }: NodeProps): JSX.Element {
  const updateNoteHtml = useCanvasStore((s) => s.updateNoteHtml)
  const d = data as { html?: string; content?: string; color?: string }
  // Migração lazy: nota antiga tem `content` (Markdown) e não `html` — converte na 1ª montagem.
  const initialHtml = d.html ?? (d.content ? markdownToHtml(d.content) : '')
  const bg = noteColorBg(d.color)

  const editor = useEditor({
    extensions: NOTE_EXTENSIONS,
    content: initialHtml,
    onUpdate: ({ editor }) => updateNoteHtml(id, editor.getHTML())
  })

  // Se a migração converteu algo, persiste o HTML já na montagem (senão o `content` seguiria sendo
  // a única fonte e a nota "perderia" a edição ao recarregar).
  useEffect(() => {
    if (editor && !d.html && d.content) updateNoteHtml(id, editor.getHTML())
  }, [editor])

  // Registro para a barra de formatação (NodeToolbar) alcançar este editor.
  useEffect(() => {
    if (!editor) return
    registerNoteEditor(id, editor)
    return () => unregisterNoteEditor(id)
  }, [editor, id])

  return (
    <>
      <NodeResizer minWidth={160} minHeight={100} isVisible={selected ?? false} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className={`ork-node ork-note${bg ? ' ork-note--colored' : ''}`} style={bg ? { background: bg } : undefined}>
        <EditorContent editor={editor} className="nodrag nowheel ork-note-editor" />
      </div>
    </>
  )
}
```

- [ ] **Step 4: CSS em `nodes.css`** — acrescentar:
```css
/* Onda 5 (F06/F07): nota como editor rich-text (TipTap). Post-it colorido usa texto escuro fixo
   para contraste sobre os tons claros, independentemente do tema. */
.ork-note-editor {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 10px 12px;
}
.ork-note-editor .ProseMirror {
  outline: none;
  min-height: 100%;
  font-size: 13px;
  line-height: 1.5;
}
.ork-note--colored,
.ork-note--colored .ProseMirror {
  color: #1a1a1a;
}
.ork-note--colored .ProseMirror a {
  color: #0b5;
}
```

- [ ] **Step 5: Typecheck + lint + build** — `npm run typecheck && npm run lint && npm run build`. **Ponto de risco:** TipTap dentro do React Flow. Se o build quebrar por ESM/CSS, resolver antes de seguir.

- [ ] **Step 6: CHECKPOINT (smoke do TipTap)** — `npm run dev`: criar uma nota, digitar, negrito por atalho (`Cmd/Ctrl+B`), recarregar (`Cmd+R`) e confirmar que o conteúdo persiste. Selecionar/rolar o texto sem arrastar o nó. **Parar aqui para validação do usuário antes da barra.**

- [ ] **Step 7: Commit**
```bash
git add src/renderer/src/notes/ src/renderer/src/components/NoteNode.tsx src/renderer/src/components/nodes.css
git commit -m "feat(notes): NoteNode com editor TipTap + cor de post-it + migracao (Onda 5)"
```

---

### Task 4: Barra de formatação da nota no `NodeToolbar`

**Files:**
- Create: `src/renderer/src/notes/useNoteEditor.ts`
- Create: `src/renderer/src/components/NoteFormatBar.tsx`
- Modify: `src/renderer/src/components/NodeToolbar.tsx` (branch por tipo de nó)

**Interfaces:**
- Consumes: registry (T3), `NOTE_COLORS` (T3), `updateNoteColor` (T2).
- Produces: `useNoteEditor(id): Editor | null`; `NoteFormatBar({ nodeId })`.

- [ ] **Step 1: Hook `useNoteEditor.ts`** — pega o editor do registry e re-renderiza quando ele registra ou muda (para os botões refletirem bold-ativo etc.):
```ts
import { useEffect, useReducer } from 'react'
import type { Editor } from '@tiptap/react'
import { getNoteEditor, subscribeNoteEditors } from './noteEditorRegistry'

export function useNoteEditor(id: string): Editor | null {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => subscribeNoteEditors(force), [])
  const editor = getNoteEditor(id) ?? null
  useEffect(() => {
    if (!editor) return
    editor.on('transaction', force)
    return () => {
      editor.off('transaction', force)
    }
  }, [editor])
  return editor
}
```

- [ ] **Step 2: `NoteFormatBar.tsx`** — os controles da imagem 6:
```tsx
import type { JSX } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { useNoteEditor } from '../notes/useNoteEditor'
import { NOTE_COLORS } from '../notes/noteColors'
import { Icon } from './Icon'

export function NoteFormatBar({ nodeId }: { nodeId: string }): JSX.Element | null {
  const editor = useNoteEditor(nodeId)
  const updateNoteColor = useCanvasStore((s) => s.updateNoteColor)
  if (!editor) return null
  const chain = (): ReturnType<typeof editor.chain> => editor.chain().focus()
  const on = (name: string, attrs?: Record<string, unknown>): string =>
    editor.isActive(name, attrs) ? ' ork-fmt--on' : ''
  return (
    <>
      <span className="ork-fmt-colors" role="group" aria-label="Cor da nota">
        {NOTE_COLORS.map((c) => (
          <button
            key={c.key}
            className="ork-fmt-swatch"
            style={{ background: c.bg }}
            title={c.label}
            aria-label={`Cor ${c.label}`}
            onClick={() => updateNoteColor(nodeId, c.key)}
          />
        ))}
      </span>
      <span className="ork-toolbar-divider" />
      <button className={`ork-toolbar-btn ork-node-toolbar-icon${on('bold')}`} title="Negrito" aria-label="Negrito" onClick={() => chain().toggleBold().run()}><Icon name="Bold" size={15} animation="none" /></button>
      <button className={`ork-toolbar-btn ork-node-toolbar-icon${on('italic')}`} title="Itálico" aria-label="Itálico" onClick={() => chain().toggleItalic().run()}><Icon name="Italic" size={15} animation="none" /></button>
      <button className={`ork-toolbar-btn ork-node-toolbar-icon${on('underline')}`} title="Sublinhado" aria-label="Sublinhado" onClick={() => chain().toggleUnderline().run()}><Icon name="Underline" size={15} animation="none" /></button>
      <button className={`ork-toolbar-btn ork-node-toolbar-icon${on('strike')}`} title="Tachado" aria-label="Tachado" onClick={() => chain().toggleStrike().run()}><Icon name="Strikethrough" size={15} animation="none" /></button>
      <span className="ork-toolbar-divider" />
      <button className={`ork-toolbar-btn ork-node-toolbar-icon${on('heading', { level: 1 })}`} title="Título" aria-label="Título" onClick={() => chain().toggleHeading({ level: 1 }).run()}><Icon name="Heading1" size={15} animation="none" /></button>
      <button className={`ork-toolbar-btn ork-node-toolbar-icon${on('bulletList')}`} title="Lista" aria-label="Lista" onClick={() => chain().toggleBulletList().run()}><Icon name="List" size={15} animation="none" /></button>
      <button className={`ork-toolbar-btn ork-node-toolbar-icon${on('orderedList')}`} title="Lista numerada" aria-label="Lista numerada" onClick={() => chain().toggleOrderedList().run()}><Icon name="ListOrdered" size={15} animation="none" /></button>
      <button className={`ork-toolbar-btn ork-node-toolbar-icon${on('code')}`} title="Código" aria-label="Código" onClick={() => chain().toggleCode().run()}><Icon name="Code2" size={15} animation="none" /></button>
      <button className="ork-toolbar-btn ork-node-toolbar-icon" title="Imagem" aria-label="Imagem" onClick={() => { const url = window.prompt('URL da imagem'); if (url) chain().setImage({ src: url }).run() }}><Icon name="Image" size={15} animation="none" /></button>
    </>
  )
}
```
NOTA: `window.prompt` é aceitável aqui? O CLAUDE.md de Electron proíbe `prompt/alert/confirm` (a regra ESLint `no-restricted-globals`). **Trocar** por um pequeno input inline OU pela paleta — na implementação, usar um `input` controlado simples no lugar do `window.prompt` (ver Step ajuste). Deixar um TODO explícito NÃO é permitido; então implementar o inline já neste passo.

- [ ] **Step 3: Ajuste do "inserir imagem" sem `window.prompt`** — substituir o `onClick` da imagem por um pequeno estado local que abre um `input` inline na barra (aparece um campo "colar URL" + confirmar). Implementação concreta: um `useState<string | null>` para a URL em edição; quando não-nula, renderiza um `<input>` que no `Enter` chama `chain().setImage({ src }).run()` e fecha. (Segue o padrão de edição inline já usado na sidebar.)

- [ ] **Step 4: Branch por tipo no `NodeToolbar.tsx`** — quando `node.type === 'note'`, renderizar `<NoteFormatBar nodeId={node.id} />` ANTES dos botões genéricos (ligações/reverter/apagar); manter "renomear" só para terminal. Importar `NoteFormatBar`.

- [ ] **Step 5: CSS dos swatches e do estado ativo** (em `Canvas.css`, perto das regras `.ork-node-toolbar-*`):
```css
.ork-fmt-colors { display: flex; align-items: center; gap: 3px; padding: 0 4px; }
.ork-fmt-swatch { width: 16px; height: 16px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.15); cursor: pointer; }
.ork-fmt-swatch:hover { transform: scale(1.15); }
.ork-fmt--on { background: var(--bg-2); color: var(--text-1); }
```

- [ ] **Step 6: Typecheck + lint + build.**

- [ ] **Step 7: CHECKPOINT final (imagem 6/7)** — `npm run dev`: selecionar uma nota abre a barra com cores + B/I/S/U + heading + listas + código + imagem; aplicar cada um funciona e o botão ativo destaca; trocar a cor pinta o post-it (amarelo/rosa…). Migração: uma nota antiga (Markdown) abre já formatada.

- [ ] **Step 8: Commit**
```bash
git add src/renderer/src/notes/useNoteEditor.ts src/renderer/src/components/NoteFormatBar.tsx src/renderer/src/components/NodeToolbar.tsx src/renderer/src/components/Canvas.css
git commit -m "feat(notes): barra de formatacao da nota (cor/B-I-S/heading/listas/codigo/imagem) (F06/F07)"
```

---

## Self-Review

**Cobertura:** editor WYSIWYG (T3) · barra de formatação abaixo da topbar (T4, F06) · cor de post-it (T3+T4, F07) · migração Markdown→HTML (T1+T3). ✓

**Placeholders:** o `window.prompt` do Step 2/T4 é substituído por input inline no Step 3 (regra `no-restricted-globals` do projeto) — sem TODO pendente.

**Type consistency:** `updateNoteHtml`/`updateNoteColor` (T2) usados por NoteNode/NoteFormatBar; registry (`registerNoteEditor`/`getNoteEditor`/`subscribeNoteEditors`) idêntico entre T3 e T4; `markdownToHtml(md): string` (T1) consumido no NoteNode; `noteColorBg`/`NOTE_COLORS` entre T3 e T4.

**Riscos:** (1) TipTap no React Flow → checkpoint de smoke no fim da T3 antes de investir na barra. (2) `MarkdownView` continua usado? Após a migração, notas usam TipTap; o `MarkdownView` pode ficar órfão — não removê-lo nesta onda (pode ser usado noutro lugar); avaliar depois. (3) `content` mantido no snapshot como fallback (migração não destrutiva na v1).
