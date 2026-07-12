import type { PtyManager } from '../pty/PtyManager'

const MAX = 8000
const DEFAULT_IDLE_MS = 1500
const DEFAULT_TIMEOUT_MS = 120000
// Fase 20 (Task 1): default do watcher de atenção (abaixo) — distinto do DEFAULT_IDLE_MS do
// waitForIdle acima (propósito diferente: um é polling bloqueante sob demanda, o outro é um
// watcher contínuo e passivo). Valor empírico (mesma ressalva de DEFAULT_IDLE_MS).
const DEFAULT_ATTENTION_IDLE_MS = 1200

export interface AgentBusOptions {
  // Fase 20 (Task 1): chamado quando um pty tracked produz output e depois fica `idleMs` sem
  // nenhum novo onData — ou seja, "o agente falou e agora parou". Ver watcher em track().
  onAttention?: (ptyId: string) => void
  idleMs?: number
}

export class AgentBus {
  private buffers = new Map<string, string>()
  private tracked = new Set<string>()
  // Fase 20 (Task 1): estado do watcher de atenção, por ptyId. `sawOutput` marca "há output não
  // confirmado como visto"; `attentionTimers` é o timer de ociosidade corrente (recriado a cada
  // onData, cancelado em clearAttention/untrack).
  private sawOutput = new Map<string, boolean>()
  private attentionTimers = new Map<string, ReturnType<typeof setTimeout>>()

  // opts é opcional e por padrão `{}` — construtor retrocompatível: `new AgentBus(ptyManager)`
  // (uso pré-Fase 20) continua válido e nunca dispara onAttention (fica undefined).
  constructor(
    private pty: PtyManager,
    private opts: AgentBusOptions = {}
  ) {}

  track(ptyId: string): void {
    if (this.tracked.has(ptyId)) return
    this.tracked.add(ptyId)
    const idleMs = this.opts.idleMs ?? DEFAULT_ATTENTION_IDLE_MS
    this.pty.onData(ptyId, (data) => {
      const cur = (this.buffers.get(ptyId) ?? '') + data
      this.buffers.set(ptyId, cur.length > MAX ? cur.slice(-MAX) : cur)

      // Watcher de atenção (Fase 20, Task 1): vive dentro desta MESMA assinatura onData — sem
      // segunda subscrição. Cada chunk de output marca "há output visto" e reagenda o timer de
      // ociosidade; se nenhum novo chunk chegar em `idleMs`, dispara onAttention uma única vez.
      // Não redispara sozinho: o timer só é recriado aqui, dentro de onData — então depois do
      // disparo ele fica ocioso até um NOVO chunk chegar e reagendar um novo timer.
      this.sawOutput.set(ptyId, true)
      const existing = this.attentionTimers.get(ptyId)
      if (existing) clearTimeout(existing)
      this.attentionTimers.set(
        ptyId,
        setTimeout(() => {
          if (this.sawOutput.get(ptyId)) this.opts.onAttention?.(ptyId)
        }, idleMs)
      )
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
  // Fase 20 (Task 1): "visto" — cancela o disparo pendente (se houver) e exige um NOVO output
  // antes que onAttention possa disparar de novo. Chamado pelo renderer (via IPC) quando o
  // usuário foca o terminal — ver 'agent:attention:clear' em main/index.ts.
  clearAttention(ptyId: string): void {
    this.sawOutput.set(ptyId, false)
    const t = this.attentionTimers.get(ptyId)
    if (t) clearTimeout(t)
    this.attentionTimers.delete(ptyId)
  }
  untrack(ptyId: string): void {
    this.buffers.delete(ptyId)
    this.tracked.delete(ptyId)
    const t = this.attentionTimers.get(ptyId)
    if (t) clearTimeout(t)
    this.attentionTimers.delete(ptyId)
    this.sawOutput.delete(ptyId)
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
  // Fix 5 (bug de resolução prematura corrigido): a versão anterior chamava resetIdleTimer()
  // já na configuração, antes de qualquer onData — então o silêncio ANTES do primeiro token do
  // agente contava como ociosidade. Um agente de IA real que delibera por mais de idleMs
  // (default 1500ms) antes de imprimir o primeiro token fazia waitForIdle resolver cedo demais
  // com delta vazio ou parcial (o caso comum de `orq ask "Dev" "refactor X" --wait`). Correção:
  // o timer de ociosidade só é armado/resetado dentro do callback de onData — ou seja, apenas
  // quando saída de verdade chega. O timer de teto (`ceilingTimer`, ligado a `timeoutMs`)
  // continua sendo armado na configuração e cobre o caso "o agente nunca emite nada".
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
      let idleTimer: ReturnType<typeof setTimeout> | undefined

      const finish = (): void => {
        if (done) return
        done = true
        if (idleTimer) clearTimeout(idleTimer)
        clearTimeout(ceilingTimer)
        resolve(delta) // próprio acumulador — imune à truncagem do buffer compartilhado
      }
      const resetIdleTimer = (): void => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(finish, idleMs)
      }

      const ceilingTimer = setTimeout(finish, timeoutMs)
      // NOTA: NÃO chamar resetIdleTimer() aqui — o silêncio antes do primeiro token não pode
      // contar como ociosidade. O timer de ociosidade só nasce dentro do onData, abaixo.

      this.pty.onData(ptyId, (chunk) => {
        if (done) return
        delta += chunk
        resetIdleTimer() // arma/reseta o timer de ociosidade só quando há saída de verdade
      })
    })
  }
}
