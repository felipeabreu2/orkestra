// Fix border-beam preso (2026-07-15, tentativa 3): as duas heurísticas de OCIOSIDADE anteriores
// (timer fixo de 500ms em TerminalNode.tsx; depois o watcher `busy` do AgentBus com idleMs) ficam
// PRESAS ligadas porque a TUI do Claude Code (Ink) emite saída mesmo ociosa (repaints da barra de
// status, cursor piscando) em intervalos curtos — "silêncio" no stream do pty nunca acontece de
// verdade. Esta terceira abordagem abandona "silêncio" como sinal e detecta por CONTEÚDO da tela:
// o Claude Code mostra "esc to interrupt" na linha de status SÓ enquanto está gerando (ex.:
// "✻ Herding… (12s · ↑ 1.5k tokens · esc to interrupt)"); ao terminar, a tela re-renderiza para o
// prompt ocioso ("auto mode on (shift+tab to cycle)") e a marca SOME. Varrer o buffer VISÍVEL do
// xterm (o estado ATUAL da tela) em vez do stream do pty (append-only, nunca "desmostra" nada)
// torna a detecção imune a repaints ociosos: sem a marca na tela, não há geração em andamento —
// não importa quantos bytes o pty tenha emitido nos últimos segundos.
export const WORKING_MARKER = /esc to interrupt/i

export function screenIsGenerating(visibleLines: string[]): boolean {
  return visibleLines.some((line) => WORKING_MARKER.test(line))
}
