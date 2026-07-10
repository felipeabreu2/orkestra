import type { PtyManager } from '../pty/PtyManager'

const MAX = 8000

export class AgentBus {
  private buffers = new Map<string, string>()
  constructor(private pty: PtyManager) {}

  track(ptyId: string): void {
    this.pty.onData(ptyId, (data) => {
      const cur = (this.buffers.get(ptyId) ?? '') + data
      this.buffers.set(ptyId, cur.length > MAX ? cur.slice(-MAX) : cur)
    })
  }
  ask(ptyId: string, prompt: string): void {
    this.pty.write(ptyId, prompt + '\n')
  }
  read(ptyId: string): string {
    return this.buffers.get(ptyId) ?? ''
  }
  untrack(ptyId: string): void {
    this.buffers.delete(ptyId)
  }
}
