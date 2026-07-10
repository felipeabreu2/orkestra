import type { PtyManager } from '../pty/PtyManager'

const MAX = 8000

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
}
