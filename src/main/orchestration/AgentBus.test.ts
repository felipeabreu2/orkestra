import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentBus } from './AgentBus'
import { PtyManager, type IPtyLike } from '../pty/PtyManager'

// Fake multi-subscriber para onData (como o node-pty real e o fake de PtyManager.test.ts):
// cada chamada a onData() acumula um assinante em vez de sobrescrever o anterior. Isso é o
// que torna a assertiva de idempotência de track() (abaixo) significativa — com um fake de
// slot único, uma dupla assinatura ficaria mascarada (só o último callback "vence").
function fakePty(): { pty: IPtyLike; emit: (d: string) => void; emitExit: (code: number) => void } {
  const dataCbs: Array<(d: string) => void> = []
  let exitCb: (e: { exitCode: number }) => void = () => {}
  return {
    pty: {
      onData: (c) => { dataCbs.push(c) },
      onExit: (c) => { exitCb = c },
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn()
    },
    emit: (d) => { for (const cb of dataCbs) cb(d) },
    emitExit: (code) => exitCb({ exitCode: code })
  }
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
  it('track é idempotente: chamar duas vezes para o mesmo ptyId não duplica a assinatura de dados', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.track(id)
    bus.track(id)
    f.emit('x')
    expect(bus.read(id)).toBe('x') // 'xx' indicaria assinatura duplicada
  })
  it('track desliga o rastreamento sozinho quando o pty sai (untrack automático via onExit)', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.track(id)
    f.emit('antes de sair\n')
    expect(bus.read(id)).toContain('antes de sair')
    f.emitExit(0)
    expect(bus.read(id)).toBe('')
  })
})

// Fase 14 (Task 1): waitForIdle bloqueia até o pty ficar em silêncio por idleMs — ou até
// timeoutMs estourar, o que vier primeiro — para permitir um "orq ask --wait" síncrono.
describe('AgentBus.waitForIdle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('resolve com o output apos idleMs de silencio', async () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty); const bus = new AgentBus(mgr)
    const id = mgr.spawn({}); bus.track(id)
    const p = bus.waitForIdle(id, { idleMs: 1000, timeoutMs: 10000 })
    f.emit('resposta parte 1\n')
    vi.advanceTimersByTime(500)     // ainda não ocioso
    f.emit('resposta parte 2\n')    // reseta o timer de ociosidade
    vi.advanceTimersByTime(1000)    // agora 1000ms de silêncio
    await expect(p).resolves.toContain('resposta parte 2')
  })

  it('resolve no timeoutMs mesmo sem ficar ocioso', async () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty); const bus = new AgentBus(mgr)
    const id = mgr.spawn({}); bus.track(id)
    const p = bus.waitForIdle(id, { idleMs: 5000, timeoutMs: 2000 })
    const spam = setInterval(() => f.emit('x'), 100)  // nunca fica ocioso
    vi.advanceTimersByTime(2000)
    clearInterval(spam)
    await expect(p).resolves.toBeTypeOf('string')
  })
})
