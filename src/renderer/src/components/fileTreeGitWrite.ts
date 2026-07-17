// Onda 3 · T11 — lógica PURA do menu de git de escrita da árvore (extraída de FileTreeNode.tsx,
// que é .tsx e a suíte não coleta: `vitest` roda `src/**/*.test.ts`). O que mora aqui é exatamente
// o que precisa de teste — o que a confirmação PROMETE ao usuário e o que a UI recusa antes de
// incomodar o main.

// ── O que entra no commit ─────────────────────────────────────────────────────────────────────
// Espelha, em cima do `gitStatus.entries` que a árvore JÁ tem, a semântica do `git commit -a` que o
// main executa. Existe para a confirmação não mentir: o botão diz "commit", e o usuário tem direito
// de ver a lista exata ANTES de mutar o repositório dele.
//
// A regra: '??' (untracked) FICA DE FORA; todo o resto (M/A/D/R…) entra.
//   · fora: untracked. É o que impede um `add -A` cego de varrer um `.env` não ignorado, um dump ou
//     um artefato de build para dentro do histórico — que, publicado, não se desfaz sem reescrever.
//   · dentro: tudo que o usuário JÁ decidiu versionar, mais o que ele mesmo pôs em stage (um
//     untracked que recebeu `git add` aparece como 'A', não '??', e o `-a` o inclui — a lista aqui
//     acompanha isso de graça, porque lê o mesmo status).
//
// NB: o escopo é o REPO inteiro (semântica do `-a`), não só a raiz da árvore — e as chaves de
// `entries` já são relativas ao TOPLEVEL do repo, então a lista mostrada é a lista que acontece.
export function commitPreview(entries: Record<string, string>): {
  included: string[]
  excluded: string[]
} {
  const included: string[] = []
  const excluded: string[] = []
  for (const [path, status] of Object.entries(entries)) {
    if (status === '??') excluded.push(path)
    else included.push(path)
  }
  included.sort()
  excluded.sort()
  return { included, excluded }
}

// Há algo para commitar? A UI desabilita o commit quando não — melhor um botão apagado do que um
// erro "nothing to commit" depois de digitar a mensagem inteira.
export function canCommit(entries: Record<string, string>): boolean {
  return commitPreview(entries).included.length > 0
}

// Texto da confirmação. Em português e explícito sobre a EXCLUSÃO: um usuário que não vê o
// `.env` na lista precisa entender que foi de propósito, não que a árvore não o enxergou.
export function commitConfirmText(entries: Record<string, string>): string {
  const { included, excluded } = commitPreview(entries)
  const linhas = [
    `Commitar ${included.length} ${included.length === 1 ? 'arquivo' : 'arquivos'}:`,
    ...included.map((p) => `  • ${p}`)
  ]
  if (excluded.length > 0) {
    linhas.push(
      '',
      `Fora do commit — ${excluded.length} não rastreado(s) pelo git:`,
      ...excluded.map((p) => `  ◦ ${p}`),
      '',
      'Para incluir um destes, use `git add <arquivo>` no terminal antes de commitar.'
    )
  }
  return linhas.join('\n')
}

// ── Nome de branch (lado da UI) ───────────────────────────────────────────────────────────────
// ESPELHO da isSafeBranchName do main, para feedback imediato no input. A autoridade é o MAIN
// (que revalida e ainda pergunta ao próprio git via `check-ref-format`): o renderer é privilegiado
// (tem pty.spawn), então uma checagem só aqui não seria segurança nenhuma — é só UX. Deliberadamente
// NÃO importa do main: renderer não importa de src/main (bundles separados).
export function branchNameError(name: string): string {
  if (name.length === 0) return 'Digite um nome'
  if (name.startsWith('-')) return 'Não pode começar com "-"'
  if (name !== name.trim()) return 'Sem espaço no começo/fim'
  if (/[\u0000-\u0020\u007f]/.test(name)) return 'Sem espaços ou caracteres de controle'
  if (name.includes('..')) return 'Não pode conter ".."'
  if (name.endsWith('.lock')) return 'Não pode terminar em ".lock"'
  if (/[~^:?*[\\]/.test(name)) return 'Caractere inválido para o git (~ ^ : ? * [ \\)'
  return ''
}
