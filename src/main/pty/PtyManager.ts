export interface IPtyLike {
  onData(cb: (d: string) => void): void
  onExit(cb: (e: { exitCode: number }) => void): void
  write(d: string): void
  resize(c: number, r: number): void
  kill(): void
}

import { defaultShell } from './shell'

export type PtySpawner = (
  file: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; cols: number; rows: number }
) => IPtyLike

const MAX_BUFFER = 256 * 1024 // scrollback guardado por pty p/ re-attach (troca de projeto)

export class PtyManager {
  private ptys = new Map<string, IPtyLike>()
  private ptyByNode = new Map<string, string>()
  private exitSubs = new Map<string, Array<(e: { exitCode: number }) => void>>()
  // Fase 31: buffer de saída por pty — permite restaurar o visual do terminal ao re-montar o
  // TerminalNode (ex.: voltar a um projeto). Cap em MAX_BUFFER (descarta o começo).
  private buffers = new Map<string, string>()
  private nextId = 1

  constructor(private spawner: PtySpawner) {}

  spawn(opts: {
    file?: string
    // Fase 27 (Task 1): base p/ SSH remoto — repassado direto ao spawner (node-pty), nunca
    // concatenado em string, então não abre brecha de shell injection.
    args?: string[]
    cwd?: string
    cols?: number
    rows?: number
    env?: Record<string, string>
    nodeId?: string
    // Comando de preset (ex.: "claude") a ser digitado no shell assim que ele emitir seu
    // primeiro output (rc já carregado) — ver writer one-shot logo após o registro de exit.
    initialCommand?: string
  }): string {
    const id = String(this.nextId++)
    // BLD-1: shell padrão por plataforma (Windows: ComSpec/cmd.exe; POSIX: $SHELL/bin/bash).
    const file = opts.file ?? defaultShell()
    const pty = this.spawner(file, opts.args ?? [], {
      cwd: opts.cwd ?? process.env.HOME ?? process.cwd(),
      env: { ...process.env, ...opts.env },
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24
    })
    this.ptys.set(id, pty)
    if (opts.nodeId) this.ptyByNode.set(opts.nodeId, id)
    // Fase 31: acumula a saída num buffer (cap MAX_BUFFER) para restaurar o terminal ao re-attach.
    this.buffers.set(id, '')
    this.onData(id, (data) => {
      const cur = (this.buffers.get(id) ?? '') + data
      this.buffers.set(id, cur.length > MAX_BUFFER ? cur.slice(cur.length - MAX_BUFFER) : cur)
    })
    // Único listener bruto de exit por pty (o IPtyLike/fakes de teste nem sempre suportam
    // múltiplas assinaturas). Assinantes externos (ex.: AgentBus) entram via onExit(id, cb)
    // abaixo e são acumulados em exitSubs, disparados aqui junto da limpeza interna.
    pty.onExit((e) => {
      this.ptys.delete(id)
      this.removeNodeMapping(id)
      this.buffers.delete(id)
      const subs = this.exitSubs.get(id)
      this.exitSubs.delete(id)
      if (subs) for (const cb of subs) cb(e)
    })
    if (opts.initialCommand) {
      // One-shot: dispara no primeiro chunk de output do shell (prompt/rc já carregados) e
      // nunca mais — assinado via this.onData (multi-subscriber), sem substituir o listener
      // de streaming da renderer nem o do AgentBus.
      let sent = false
      this.onData(id, () => {
        if (sent) return
        sent = true
        this.write(id, `${opts.initialCommand}\n`)
      })
    }
    return id
  }

  ptyIdForNode(nodeId: string): string | undefined {
    return this.ptyByNode.get(nodeId)
  }

  // Fase 20 (Task 1): reverso de ptyIdForNode — o watcher de atenção do AgentBus só conhece o
  // ptyId (é o que PtyManager.onData/onExit expõem), então precisa deste caminho de volta para
  // achar a que nó do canvas avisar via IPC. Mesma varredura por valor de removeNodeMapping
  // (abaixo); não vale a pena manter um segundo Map reverso só para isto.
  nodeForPty(ptyId: string): string | undefined {
    for (const [nodeId, id] of this.ptyByNode) {
      if (id === ptyId) return nodeId
    }
    return undefined
  }

  // Assinatura extra (multi-subscriber) para o exit de um pty específico, sem depender do
  // IPtyLike subjacente suportar múltiplos onExit — a limpeza interna acima já monopoliza o
  // único pty.onExit() e repassa para cá.
  onExit(id: string, cb: (e: { exitCode: number }) => void): void {
    const list = this.exitSubs.get(id) ?? []
    list.push(cb)
    this.exitSubs.set(id, list)
  }

  private removeNodeMapping(id: string): void {
    for (const [nodeId, ptyId] of this.ptyByNode) {
      if (ptyId === id) {
        this.ptyByNode.delete(nodeId)
        break
      }
    }
  }

  onData(id: string, cb: (d: string) => void): void {
    this.ptys.get(id)?.onData(cb)
  }
  write(id: string, data: string): void {
    this.ptys.get(id)?.write(data)
  }
  resize(id: string, cols: number, rows: number): void {
    this.ptys.get(id)?.resize(cols, rows)
  }
  kill(id: string): void {
    const p = this.ptys.get(id)
    if (p) {
      p.kill()
      this.ptys.delete(id)
      this.removeNodeMapping(id)
      this.buffers.delete(id)
    }
  }
  // Fase 31: mata o pty de um nó (ex.: ao remover o terminal do canvas via ×). No-op se não há.
  killByNode(nodeId: string): void {
    const id = this.ptyByNode.get(nodeId)
    if (id) this.kill(id)
  }
  killAll(): void {
    for (const id of [...this.ptys.keys()]) this.kill(id)
  }
  has(id: string): boolean {
    return this.ptys.has(id)
  }
  // Fase 31: scrollback acumulado de um pty — usado no re-attach para restaurar o xterm.
  getBuffer(id: string): string {
    return this.buffers.get(id) ?? ''
  }
}
