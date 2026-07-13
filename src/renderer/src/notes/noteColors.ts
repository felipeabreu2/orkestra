// Cores de post-it (F07). A chave é persistida em data.color; o valor `bg` é a cor de fundo.
// `undefined`/ausente = post-it neutro (padrão do tema). Tons suaves que funcionam nos dois temas
// com texto escuro fixo (as notas coloridas usam texto escuro — ver nodes.css).
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
