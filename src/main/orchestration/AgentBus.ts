import type { PtyManager } from '../pty/PtyManager'

const MAX = 8000
const DEFAULT_IDLE_MS = 1500
const DEFAULT_TIMEOUT_MS = 120000

export class AgentBus {
  private buffers = new Map<string, string>()
  private tracked = new Set<string>()
  constructor(private pty: PtyManager) {}

  track(ptyId: string): void {
    if (this.tracked.has(ptyId)) return
    this.tracked.add(ptyId)
    this.pty.onData(ptyId, (data) => {
      const cur = (this.buffers.get(ptyId) ?? '') + data
      this.buffers.set(ptyId, cur.length > MAX ? cur.slice(-MAX) : cur)
    })
    // Auto-untrack: quando o pty sai (sozinho ou via kill), o buffer não deve sobreviver a ele.
    this.pty.onExit(ptyId, () => this.untrack(ptyId))
  }
  ask(ptyId: string, prompt: string): void {
    this.pty.write(ptyId, prompt + '\n')
  }
  read(ptyId: string): string {
    return this.buffers.get(ptyId) ?? ''
  }
  untrack(ptyId: string): void {
    this.buffers.delete(ptyId)
    this.tracked.delete(ptyId)
  }

  // Fase 14 (Task 1): resolve quando o pty ficar `idleMs` sem nenhum onData, ou quando
  // `timeoutMs` estourar — o que vier primeiro — com o output acumulado desde a chamada.
  // Isso é o que permite um "orq ask --wait" bloqueante em vez do fire-and-forget de ask().
  //
  // Fix 1 (bug de perda de dados corrigido): a versão anterior resolvia com
  // `this.read(ptyId).slice(startMark)` contra o buffer COMPARTILHADO que track() trunca para
  // os últimos 8000 chars (MAX). Se o buffer estourasse esse limite entre a chamada e a
  // resolução, o slice ficava errado (delta menor que o real); se o buffer já estivesse
  // saturado em 8000 no momento da chamada — o caso comum de qualquer sessão com histórico
  // (banner + prompt + saída anterior) — o delta devolvido era a STRING VAZIA mesmo com saída
  // nova real. Correção: o próprio `waitForIdle` acumula seu delta (`delta`) dentro do callback
  // temporário de `onData`, independente do buffer compartilhado — imune à truncagem de MAX.
  //
  // Tradeoff aceito e documentado: PtyManager.onData(id, cb) é multi-subscriber e ADITIVO —
  // não existe unsubscribe. O assinante temporário registrado abaixo (para acumular o delta e
  // resetar o timer de ociosidade) fica preso na lista interna do pty até ele sair do
  // processo; usamos a flag `done` para fazê-lo virar no-op assim que resolvemos, então o
  // único custo residual é uma closure ociosa por chamada — sem efeito colateral observável.
  waitForIdle(ptyId: string, opts: { idleMs?: number; timeoutMs?: number } = {}): Promise<string> {
    const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

    return new Promise((resolve) => {
      let delta = ''
      let done = false
      let idleTimer: ReturnType<typeof setTimeout>

      const finish = (): void => {
        if (done) return
        done = true
        clearTimeout(idleTimer)
        clearTimeout(ceilingTimer)
        resolve(delta) // próprio acumulador — imune à truncagem do buffer compartilhado
      }
      const resetIdleTimer = (): void => {
        clearTimeout(idleTimer)
        idleTimer = setTimeout(finish, idleMs)
      }

      const ceilingTimer = setTimeout(finish, timeoutMs)
      resetIdleTimer()

      this.pty.onData(ptyId, (chunk) => {
        if (done) return
        delta += chunk
        resetIdleTimer()
      })
    })
  }
}
