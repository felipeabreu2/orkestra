// Ombro T4 (docs/planejamento/ombro.md): monta o corpo enriquecido da Notification nativa de
// "agente ocioso" — nome do agente + prévia da última linha + título conforme o STATUS detectado.
// Função 100% PURA (sem Electron/I/O): recebe {agentName, bufferText} e devolve {title, body}, para
// o composition root (main/index.ts) só passar ao `new Notification(...)`. Reusa o detector puro da
// T3 (classifyAgentStatus/lastNonEmptyLine/toLines de src/shared/agentStatus.ts).
import {
  classifyAgentStatus,
  lastNonEmptyLine,
  toLines,
  type AgentStatus
} from '../../shared/agentStatus'

export interface AttentionNotificationInput {
  agentName?: string
  bufferText: string
}

export interface AttentionNotification {
  title: string
  body: string
}

// Fallbacks conservadores: nome genérico quando o mirror não tem o nome do nó; corpo padrão quando o
// buffer não tem nenhuma linha não-vazia (nunca `undefined`/`"undefined"` — critério de aceite T4).
export const DEFAULT_AGENT_NAME = 'Agente'
export const DEFAULT_BODY = 'Um agente parou e pode precisar de você.'
// Teto do corpo (~140): uma linha de log muito longa não deve virar um corpo gigante na notificação.
export const MAX_BODY_LEN = 140

function titleForStatus(name: string, status: AgentStatus): string {
  switch (status) {
    case 'needs-input':
      return `${name} precisa de você`
    case 'crashed':
      return `${name} travou`
    case 'done':
      return `${name} ficou ocioso`
  }
}

// Trunca preservando um limite duro de MAX_BODY_LEN chars (o '…' entra no orçamento).
function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

export function buildAttentionNotification(input: AttentionNotificationInput): AttentionNotification {
  const trimmedName = input.agentName?.trim()
  const name = trimmedName && trimmedName !== '' ? trimmedName : DEFAULT_AGENT_NAME
  // O buffer cru de agentBus.read é lido UMA vez pelo chamador; aqui só o classificamos/parseamos.
  const lines = toLines(input.bufferText)
  const status = classifyAgentStatus(lines)
  const preview = lastNonEmptyLine(lines)
  const body = preview !== '' ? truncate(preview, MAX_BODY_LEN) : DEFAULT_BODY
  return { title: titleForStatus(name, status), body }
}
