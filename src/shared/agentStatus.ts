// Detector puro de estado de agente a partir do TEXTO do buffer — mesma técnica de
// `generatingSignal.ts` (regex sobre linhas, função 100% pura, sem I/O / Electron / React).
// Colocado em `src/shared/` para ser importável tanto pelo `main` (corpo da notificação) quanto
// pelo renderer (HUD), no padrão dos demais módulos puros compartilhados (`roles.ts`, `ssh.ts`).
//
// Fonte do texto: as linhas VISÍVEIS do xterm (alta fidelidade, já sem ANSI) ou, como fallback
// "pobre mas 100% local", o buffer cru de `agentBus.read` (append-only, cheio de escapes/repaints).
// Por isso o detector opera sobre `string[]` e oferece `stripAnsi`/`toLines` para o caso cru.
//
// Os markers são HEURÍSTICA — falso-positivo/negativo é aceitável (é um aviso, não um gate);
// ajustá-los é o único knob, exatamente como `WORKING_MARKER` em `generatingSignal.ts`.

export type AgentStatus = 'needs-input' | 'crashed' | 'done'

// "Precisa de você": o agente parou esperando uma resposta interativa.
export const NEEDS_INPUT_MARKERS: RegExp[] = [
  /\((y\/n|yes\/no)\)/i, // (y/n) / (yes/no)
  /\[y\/n\]/i, // [y/N] / [Y/n]
  /do you want to (proceed|continue)/i,
  /press (enter|return) to continue/i,
  /overwrite\b.*\?/i, // "Overwrite existing file?"
  /^\s*❯?\s*\d+\.\s+(yes|no)\b/im // prompt de seleção estilo Claude Code: "❯ 1. Yes  2. No"
]

// "Travou": o agente terminou com um erro/stack trace.
export const CRASH_MARKERS: RegExp[] = [
  /traceback \(most recent call last\)/i,
  /^\s*at\s+.+\(.*:\d+:\d+\)/m, // frame de stack JS: "at Object.<anonymous> (/x/y.js:10:5)"
  /^\s*File ".*", line \d+/m, // frame de stack Python: File "app.py", line 42
  /\b(Error|Exception|panic):/, // Error:, Exception:, panic:
  /segmentation fault/i
]

// Remove sequências de escape ANSI (CSI/SGR + OSC) para que o texto cru do pty vire texto legível.
const CSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
// Escapes de um único caractere que sobram (ex.: ESC seguido de um byte de 0x40-0x5F).
const SINGLE_RE = /\x1b[@-Z\\-_]/g

export function stripAnsi(s: string): string {
  return s.replace(OSC_RE, '').replace(CSI_RE, '').replace(SINGLE_RE, '')
}

export function toLines(text: string): string[] {
  return stripAnsi(text).split(/\r?\n/)
}

// Precedência: needs-input > crashed > done. Testa cada marker contra o texto inteiro (junção das
// linhas) para que markers ancorados (`^ ... /m`) funcionem por linha.
export function classifyAgentStatus(lines: string[]): AgentStatus {
  const text = lines.join('\n')
  if (NEEDS_INPUT_MARKERS.some((re) => re.test(text))) return 'needs-input'
  if (CRASH_MARKERS.some((re) => re.test(text))) return 'crashed'
  return 'done'
}

// Última linha não-vazia (com trim). Nunca `undefined` — default `''`.
export function lastNonEmptyLine(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (trimmed !== '') return trimmed
  }
  return ''
}
