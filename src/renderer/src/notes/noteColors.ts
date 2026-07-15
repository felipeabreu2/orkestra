// Cores de post-it (F07). A chave (persistida em data.color) NÃO muda — só o valor `bg`, que é
// consumido exclusivamente como valor de estilo CSS (style={{ background }} em NoteNode/NoteFormatBar).
// Por isso os 6 hex de papel migraram para os tokens --note-* (definidos em styles/tokens.css na
// reformulação 2026-07-14): var(--note-yellow/pink/blue/green/purple/orange). São tints de papel
// theme-independentes (post-it é sempre claro); o texto por cima é escuro fixo (--note-ink, ver nodes.css).
// `undefined`/ausente = post-it neutro (padrão do tema).
export const NOTE_COLORS: Array<{ key: string; label: string; bg: string }> = [
  { key: 'amarelo', label: 'Amarelo', bg: 'var(--note-yellow)' },
  { key: 'rosa', label: 'Rosa', bg: 'var(--note-pink)' },
  { key: 'azul', label: 'Azul', bg: 'var(--note-blue)' },
  { key: 'verde', label: 'Verde', bg: 'var(--note-green)' },
  { key: 'roxo', label: 'Roxo', bg: 'var(--note-purple)' },
  { key: 'laranja', label: 'Laranja', bg: 'var(--note-orange)' }
]

export function noteColorBg(color?: string): string | undefined {
  return NOTE_COLORS.find((c) => c.key === color)?.bg
}
