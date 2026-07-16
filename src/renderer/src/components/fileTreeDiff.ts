// Onda 3 · T8 — parser do modo Diff da árvore de arquivos. Puro/testável (o .tsx não é coletado
// pelo vitest, então a lógica mora aqui e o componente só mapeia kind -> classe CSS).
// NÃO é um parser de patch: não reconstrói arquivos, hunks nem offsets — só classifica cada linha
// do `git diff` para o realce SIMPLES que o plano pede. Quem quiser aplicar/reverter patch precisa
// de git de escrita (T11), que não é este escopo.

export type DiffLineKind = 'add' | 'del' | 'hunk' | 'meta' | 'ctx'

export interface DiffLine {
  key: number
  kind: DiffLineKind
  text: string
}

// Cabeçalhos que o git emite ANTES do primeiro `@@`. `+++ b/x` e `--- a/x` são a pegadinha: começam
// com +/- e viraram "adicionado/removido" em todo diff-viewer ingênuo — por isso são testados
// explicitamente e checados ANTES do sinal de +/-.
function classify(line: string): DiffLineKind {
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+++') || line.startsWith('---')) return 'meta'
  if (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('new file mode') ||
    line.startsWith('deleted file mode') ||
    line.startsWith('old mode') ||
    line.startsWith('new mode') ||
    line.startsWith('similarity index') ||
    line.startsWith('rename from') ||
    line.startsWith('rename to') ||
    line.startsWith('Binary files') ||
    line.startsWith('\\ No newline')
  ) {
    return 'meta'
  }
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'ctx'
}

// Quebra o diff em linhas classificadas, na ordem original. O `\n` final (todo diff termina com um)
// não vira uma linha vazia fantasma; `\r` de CRLF é ignorado só para CLASSIFICAR — o `text`
// devolvido é a linha como veio, para o render ser fiel ao arquivo.
export function parseDiffLines(diff: string): DiffLine[] {
  // Só espaço em branco = "sem alterações" (ou fora de repo): nada a renderizar, nem uma linha
  // vazia fantasma.
  if (diff.trim() === '') return []
  const raw = diff.split('\n')
  if (raw[raw.length - 1] === '') raw.pop()
  return raw.map((text, key) => ({ key, kind: classify(text.replace(/\r$/, '')), text }))
}
