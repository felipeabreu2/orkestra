import type { PortalActionResult } from '../../shared/orchestration'

// T1 — registry PURO de ações de portal pendentes por requestId. A ponte main->renderer é
// unidirecional (webContents.send), então click/fill não conseguem "aguardar" o retorno na própria
// chamada: o main registra uma pendência aqui, relaya o comando ao renderer com o requestId, e
// resolve a pendência quando o renderer devolve o booleano pelo canal de volta (IPC portal:result).
//
// O timeout é a rede de segurança: se o webview morrer entre o send e o reply (ou o renderer
// descartar o comando pelo guard de projeto — assíncrono e invisível ao main), a promise resolve
// {ok:false} em vez de pendurar o agente para sempre, e a entrada é removida do mapa (sem
// vazamento — mesmo cuidado do teto de AgentBus.waitForIdle).
//
// Sem estado de Electron/HTTP aqui: é testável em unidade com vi.useFakeTimers().
interface Pending {
  resolve: (result: PortalActionResult) => void
  timer: ReturnType<typeof setTimeout>
}

const DEFAULT_TIMEOUT_MS = 5000

export class PortalActionRegistry {
  private pending = new Map<string, Pending>()

  constructor(private timeoutMs: number = DEFAULT_TIMEOUT_MS) {}

  // Nº de pendências vivas — usado nos testes para provar que não há vazamento após resolve/timeout.
  get size(): number {
    return this.pending.size
  }

  // Registra a ação `id` e devolve a promise que o servidor aguarda. Resolve por resolve(id, ...)
  // (reply do renderer) ou, no pior caso, por timeout com {ok:false}.
  register(id: string): Promise<PortalActionResult> {
    return new Promise<PortalActionResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve({ ok: false })
      }, this.timeoutMs)
      // Não segurar o event loop vivo só por causa desta pendência (o processo main já vive por
      // conta própria). `unref` só existe no Timeout do Node; sob fake timers/número, o ?. é no-op.
      ;(timer as { unref?: () => void }).unref?.()
      this.pending.set(id, { resolve, timer })
    })
  }

  // Cumpre a pendência `id` com o resultado do renderer. requestId desconhecido (reply duplicado,
  // ação já expirada, ou id de outro processo) é no-op — nunca lança.
  resolve(id: string, result: PortalActionResult): void {
    const entry = this.pending.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(id)
    entry.resolve(result)
  }
}
