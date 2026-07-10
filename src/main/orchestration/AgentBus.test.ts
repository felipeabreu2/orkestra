import { describe, it, expect, vi } from 'vitest'
import { AgentBus } from './AgentBus'
import { PtyManager, type IPtyLike } from '../pty/PtyManager'

function fakePty(): { pty: IPtyLike; emit: (d: string) => void } {
  let cb: (d: string) => void = () => {}
  return { pty: { onData: (c) => { cb = c }, onExit: () => {}, write: vi.fn(), resize: vi.fn(), kill: vi.fn() }, emit: (d) => cb(d) }
}

describe('AgentBus', () => {
  it('acumula a saída do pty no buffer e read() a retorna', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.track(id)
    f.emit('linha 1\n'); f.emit('linha 2\n')
    expect(bus.read(id)).toContain('linha 1')
    expect(bus.read(id)).toContain('linha 2')
  })
  it('ask escreve o prompt (com newline) no pty', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.ask(id, 'olá agente')
    expect(f.pty.write).toHaveBeenCalledWith('olá agente\n')
  })
  it('read limita o buffer aos últimos ~8000 chars', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.track(id)
    f.emit('x'.repeat(10000))
    expect(bus.read(id).length).toBeLessThanOrEqual(8000)
  })
})
