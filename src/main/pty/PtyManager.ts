export interface IPtyLike {
  onData(cb: (d: string) => void): void
  onExit(cb: (e: { exitCode: number }) => void): void
  write(d: string): void
  resize(c: number, r: number): void
  kill(): void
}

export type PtySpawner = (
  file: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; cols: number; rows: number }
) => IPtyLike

export class PtyManager {
  private ptys = new Map<string, IPtyLike>()
  private ptyByNode = new Map<string, string>()
  private nextId = 1

  constructor(private spawner: PtySpawner) {}

  spawn(opts: {
    file?: string
    cwd?: string
    cols?: number
    rows?: number
    env?: Record<string, string>
    nodeId?: string
  }): string {
    const id = String(this.nextId++)
    const file = opts.file ?? process.env.SHELL ?? '/bin/bash'
    const pty = this.spawner(file, [], {
      cwd: opts.cwd ?? process.env.HOME ?? process.cwd(),
      env: { ...process.env, ...opts.env },
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24
    })
    this.ptys.set(id, pty)
    if (opts.nodeId) this.ptyByNode.set(opts.nodeId, id)
    pty.onExit(() => {
      this.ptys.delete(id)
      this.removeNodeMapping(id)
    })
    return id
  }

  ptyIdForNode(nodeId: string): string | undefined {
    return this.ptyByNode.get(nodeId)
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
    }
  }
  killAll(): void {
    for (const id of [...this.ptys.keys()]) this.kill(id)
  }
  has(id: string): boolean {
    return this.ptys.has(id)
  }
}
