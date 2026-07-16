import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

// Onda 3 · T4 (CodeMirror) — tema do editor embutido, escrito 100% sobre os tokens do projeto.
//
// Por que var(--token) e não getComputedStyle (como o xtermTheme faz): o xterm pinta num <canvas> e
// NÃO entende CSS custom properties — por isso precisa ler os tokens em JS e reaplicar a cada flip
// de tema (MutationObserver em TerminalNode). O CodeMirror é DOM/CSS: `EditorView.theme` só injeta
// uma folha de estilo, então `var(--accent)` resolve na cascata do próprio elemento. Consequência:
// claro↔escuro funciona SOZINHO no flip de `data-theme` no <html> — sem observer, sem recriar o
// EditorView, sem perder cursor/histórico/scroll. Nenhum hex cru mora aqui.
//
// Nota sobre `EditorView.theme(spec)` sem `{dark}`: o baseTheme do CM tem regras condicionadas a
// `&dark`/`&light` (fundo de painel, etc.) que ficam inertes sem o flag — por isso este tema pinta
// explicitamente painéis/gutters/seleção. Passar `dark: true` fixaria um dos temas, que é
// exatamente o que não queremos num app que troca de tema em runtime.

/** Realce por tag do lezer → var(--syn-*) (definidos nos DOIS temas em styles/tokens.css). */
export const orkestraHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], color: 'var(--syn-type)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: 'var(--syn-function)' },
  { tag: [t.meta, t.processingInstruction, t.annotation], color: 'var(--syn-meta)' },
  { tag: [t.link, t.url], color: 'var(--syn-link)', textDecoration: 'underline' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--syn-type)' },
  { tag: t.tagName, color: 'var(--syn-keyword)' },
  { tag: t.heading, color: 'var(--syn-keyword)', fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.invalid, color: 'var(--err)' }
])

/** Cromo do editor (fundo, cursor, seleção, gutter, painéis de busca/ir-para-linha). */
export const orkestraEditorTheme: Extension = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--text-1)',
    backgroundColor: 'transparent',
    fontSize: 'var(--fs-sm)'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: 'var(--lh-normal)',
    overflow: 'auto'
  },
  '.cm-content': { caretColor: 'var(--accent)', padding: 'var(--space-2) 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  // as duas metades da seleção: .cm-selectionBackground é o desenho do drawSelection (editor
  // focado ou não); ::selection cobre a seleção nativa do contenteditable.
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--accent-weak)'
  },
  '.cm-activeLine': { backgroundColor: 'var(--bg-2-weak)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--text-3)',
    border: 'none',
    borderRight: '1px solid var(--border)'
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--bg-2-weak)', color: 'var(--text-2)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 var(--space-2) 0 var(--space-1-5)' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--bg-3)',
    border: '1px solid var(--border)',
    color: 'var(--text-2)'
  },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--accent-weak)',
    outline: '1px solid var(--accent)'
  },
  '.cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'var(--err-weak)' },
  '.cm-searchMatch': { backgroundColor: 'var(--warn-weak)', outline: '1px solid var(--warn)' },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--accent-weak)',
    outline: '1px solid var(--accent)'
  },
  '.cm-selectionMatch': { backgroundColor: 'var(--bg-3)' },
  // painéis do @codemirror/search (find/replace e ir-para-linha) — mesmo idioma dos controles do nó.
  '.cm-panels': {
    backgroundColor: 'var(--bg-2)',
    color: 'var(--text-1)',
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--fs-xs)'
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-panel.cm-search label, .cm-panel.cm-gotoLine label': { color: 'var(--text-2)' },
  '.cm-panel input, .cm-panel input[type=text]': {
    backgroundColor: 'var(--bg-1)',
    color: 'var(--text-1)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px 6px',
    fontFamily: 'var(--font-mono)'
  },
  '.cm-panel input:focus': { outline: 'none', borderColor: 'var(--accent)' },
  '.cm-panel input[type=checkbox]': { accentColor: 'var(--accent)' },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px 8px'
  },
  '.cm-button:hover': { backgroundColor: 'var(--bg-3)', color: 'var(--text-1)' },
  '.cm-button:active': { backgroundImage: 'none', backgroundColor: 'var(--accent-weak)' },
  '.cm-panel.cm-search [name=close]': { color: 'var(--text-2)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--bg-2)',
    color: 'var(--text-1)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)'
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent-weak)',
    color: 'var(--text-1)'
  }
})

/** O tema completo do editor da árvore: cromo + realce. É isto que o FileEditor monta. */
export const orkestraCodeMirrorTheme: Extension = [
  orkestraEditorTheme,
  syntaxHighlighting(orkestraHighlightStyle)
]
