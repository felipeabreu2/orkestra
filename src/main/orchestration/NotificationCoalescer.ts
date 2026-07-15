// Ombro T6 (docs/planejamento/ombro.md): coalescer anti-spam para as notificações de "agente
// ocioso". Com muitos agentes, N eventos de `onAttention` em rajada virariam N notificações nativas
// simultâneas; aqui os eventos numa janela curta (windowMs) são acumulados e emitidos como UMA
// notificação agregada ("2 agentes ficaram ociosos: Dev, Revisor"). Um único evento na janela degrada
// para a notificação individual rica da T4. Mantido DESLIGÁVEL (windowMs=0 = passthrough) para não
// mascarar bugs de disparo.
import { buildAttentionNotification, DEFAULT_AGENT_NAME } from './attentionNotification'

export interface AttentionEvent {
  nodeId: string
  agentName?: string
  bufferText: string
}

export interface CoalescedNotification {
  title: string
  body: string
}

// Janela padrão: curta o bastante para não atrasar perceptivelmente o aviso de um único agente, longa
// o bastante para juntar uma rajada.
export const DEFAULT_COALESCE_WINDOW_MS = 600

function nameOf(ev: AttentionEvent): string {
  const trimmed = ev.agentName?.trim()
  return trimmed && trimmed !== '' ? trimmed : DEFAULT_AGENT_NAME
}

// PURO: monta {title, body} da notificação a partir dos eventos coalescidos. 1 evento delega à
// notificação individual da T4 (mantém prévia + título por status); 2+ troca detalhe por volume
// (contagem no título, lista de nomes no corpo). A agregada perde a prévia por-agente — aceitável.
export function buildAggregateBody(events: AttentionEvent[]): CoalescedNotification {
  if (events.length === 1) {
    return buildAttentionNotification({
      agentName: events[0].agentName,
      bufferText: events[0].bufferText
    })
  }
  return {
    title: `${events.length} agentes ficaram ociosos`,
    body: events.map(nameOf).join(', ')
  }
}

// PURO: qual nó o click da notificação agregada deve enquadrar — o primeiro evento (o mais antigo da
// janela). Undefined para lista vazia (guard no chamador).
export function aggregateClickTarget(events: AttentionEvent[]): string | undefined {
  return events.length > 0 ? events[0].nodeId : undefined
}

export class NotificationCoalescer {
  private buffer: AttentionEvent[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly onFlush: (events: AttentionEvent[]) => void,
    private readonly windowMs: number = DEFAULT_COALESCE_WINDOW_MS
  ) {}

  // Acumula o evento e (re)agenda o flush. windowMs<=0 = passthrough: dispara na hora (cada push vira
  // sua própria notificação individual) — o modo "desligado" que não mascara bugs de disparo.
  push(ev: AttentionEvent): void {
    this.buffer.push(ev)
    if (this.windowMs <= 0) {
      this.flush()
      return
    }
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), this.windowMs)
  }

  private flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.buffer.length === 0) return
    const events = this.buffer
    this.buffer = []
    this.onFlush(events)
  }

  // Cancela qualquer flush pendente e descarta o buffer (evita vazamento de timer / flush tardio).
  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.buffer = []
  }
}
