/* eslint-disable no-control-regex */
// Remove sequências de escape ANSI/VT (cores SGR, movimento de cursor, limpeza de tela/linha,
// títulos OSC etc.) de um chunk de saída do pty, preservando o texto legível — usado pela
// paleta Cmd+K (Fase 24 Task 2) para exibir a resposta do agente sem lixo de terminal.
export function stripAnsi(input: string): string {
  return input
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC ... BEL ou ST
    .replace(/\x1b[P^_][^\x1b]*\x1b\\/g, '') // DCS/PM/APC ... ST
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '') // CSI (cores, cursor, limpeza)
    .replace(/\x1b[=>NODEc78]/g, '') // ESC + 1 char
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // controles (mantém \t \n \r)
}
