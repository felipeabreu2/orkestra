// Otimização (Bloco 2a): acumula os chunks de output de cada pty e faz flush em lote (~1 frame),
// reduzindo drasticamente o nº de mensagens IPC pty:data (antes: uma por chunk). O renderer
// continua recebendo (id, string) — só menos vezes e com strings maiores. O scheduler
// (setTimeout/clearTimeout) é injetável para testabilidade sem relógio real.
export class PtyDataBatcher {
  private pending = new Map<string, string>()
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly flushFn: (id: string, data: string) => void,
    private readonly delayMs = 16,
    private readonly schedule: (cb: () => void, ms: number) => ReturnType<typeof setTimeout> = setTimeout,
    private readonly cancel: (t: ReturnType<typeof setTimeout>) => void = clearTimeout
  ) {}

  // Acumula um chunk; arma o timer de flush no primeiro pendente (ordem preservada por pty via
  // concatenação em ordem de chegada).
  push(id: string, data: string): void {
    this.pending.set(id, (this.pending.get(id) ?? '') + data)
    if (this.timer === null) {
      this.timer = this.schedule(() => this.flushAll(), this.delayMs)
    }
  }

  // Flush imediato do pendente de UM pty (ex.: no exit — nunca perder o final do output).
  flushOne(id: string): void {
    const data = this.pending.get(id)
    if (data !== undefined) {
      this.pending.delete(id)
      this.flushFn(id, data)
    }
  }

  // Envia todo o pendente (uma mensagem por pty) e limpa o timer.
  flushAll(): void {
    if (this.timer !== null) {
      this.cancel(this.timer)
      this.timer = null
    }
    for (const [id, data] of this.pending) this.flushFn(id, data)
    this.pending.clear()
  }
}
