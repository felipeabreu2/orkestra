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

// ————————————————————————————————————————————————————————————————————————————————————————————
// Onda 3 · T12 — citar um bloco do diff → agente conectado.
//
// DECISÃO: a unidade citável é o HUNK inteiro sob a linha clicada, não uma seleção livre de texto.
// Motivo: o DiffView é markup próprio (<pre> com <div> por linha), não CodeMirror — não existe
// `state.selection`, e ler `window.getSelection()` seria (a) intestável aqui, já que o vitest não
// coleta .tsx, (b) capaz de produzir um recorte SEM SENTIDO para o agente (metade de um hunk, ou
// linhas de dois arquivos diferentes, sem o `@@` que diz quais linhas são) e (c) incapaz de nomear
// o arquivo do trecho — que é exatamente o que o rótulo "diff — <arquivo>" precisa. O hunk é a
// unidade que o próprio git escolheu: sempre completo, sempre atribuível a um arquivo, e é o que o
// critério de aceite pede ("citar um hunk"). Por isso o `selectionLineRange` da T5 NÃO se aplica
// (ele mede offsets numa seleção de texto); o que se reusa da T5 é o essencial — a resolução do
// terminal conectado e o `buildContextBlock`.
// ————————————————————————————————————————————————————————————————————————————————————————————

export interface DiffHunk {
  // Caminho do arquivo RELATIVO ao repo, como o git emite (sem o `a/`/`b/`).
  file: string
  // Texto do hunk, do `@@` (inclusive) até a linha antes do próximo `@@`/`diff --git`.
  text: string
  // Índices (= `key`) da primeira e da última linha do hunk, INCLUSIVOS — a UI usa para realçar.
  startKey: number
  endKey: number
}

const FILE_HEADER = 'diff --git'

// Nome do arquivo dono do hunk que começa em `start`, procurando para TRÁS o cabeçalho mais próximo.
// Preferimos `+++ b/x` (o lado novo). Num arquivo APAGADO o git emite `+++ /dev/null`, e aí o único
// nome real está no `--- a/x` — sem este fallback o rótulo viraria "diff — /dev/null".
function fileForHunk(lines: readonly DiffLine[], start: number): string {
  let novo = ''
  let velho = ''
  for (let i = start - 1; i >= 0; i--) {
    const t = lines[i].text
    if (!novo && t.startsWith('+++ ')) novo = t.slice(4)
    if (!velho && t.startsWith('--- ')) velho = t.slice(4)
    // O `diff --git` delimita o arquivo: nada antes dele descreve ESTE hunk.
    if (t.startsWith(FILE_HEADER)) break
  }
  const escolhido = novo && novo !== '/dev/null' ? novo : velho
  if (!escolhido || escolhido === '/dev/null') return ''
  // `a/`/`b/` são o prefixo convencional do git (diff.noprefix desliga; daí o replace condicional).
  return escolhido.replace(/^[ab]\//, '')
}

/**
 * Hunk que contém a linha `key` — do `@@` que o abre até a linha antes do próximo `@@`/`diff --git`.
 * `null` quando `key` está fora do diff ou cai num CABEÇALHO de arquivo (`diff --git`/`index`/`+++`/
 * `---`), que não pertence a hunk nenhum: não há nada de concreto ali para o agente explicar.
 */
export function diffHunkAt(lines: readonly DiffLine[], key: number): DiffHunk | null {
  if (key < 0 || key >= lines.length) return null

  // Para trás até o `@@` que abre o hunk. Um `diff --git` no caminho significa que `key` está no
  // cabeçalho deste arquivo, antes do primeiro hunk dele — e nunca no hunk do arquivo ANTERIOR.
  let start = -1
  for (let i = key; i >= 0; i--) {
    if (lines[i].kind === 'hunk') {
      start = i
      break
    }
    if (lines[i].text.startsWith(FILE_HEADER)) return null
  }
  if (start === -1) return null

  // Para frente até (exclusive) o próximo `@@` ou o cabeçalho do próximo arquivo.
  let end = lines.length - 1
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].kind === 'hunk' || lines[i].text.startsWith(FILE_HEADER)) {
      end = i - 1
      break
    }
  }

  return {
    file: fileForHunk(lines, start),
    text: lines
      .slice(start, end + 1)
      .map((l) => l.text)
      .join('\n'),
    startKey: start,
    endKey: end
  }
}

/**
 * Rótulo da citação de um hunk, no formato do plano: `diff — src/a.ts`. É o `label` passado ao
 * `buildContextBlock` (o mesmo montador da T5) — o análogo do `quoteLabel` do editor, que aqui não
 * serve porque não citamos um intervalo de linhas do arquivo, e sim um hunk já auto-descrito
 * (o próprio `@@ -a,b +c,d @@` carrega as linhas).
 */
export function diffQuoteLabel(file: string): string {
  return `diff — ${file}`
}
