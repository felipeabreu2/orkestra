import { describe, it, expect, vi } from 'vitest'
import { PtyManager, type IPtyLike, type PtySpawner } from './PtyManager'

function makeFakePty() {
  let dataCb: (d: string) => void = () => {}
  const pty: IPtyLike = {
    onData: (cb) => { dataCb = cb },
    onExit: () => {},
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn()
  }
  return { pty, emit: (d: string) => dataCb(d) }
}

describe('PtyManager', () => {
  it('gera ids únicos por spawn', () => {
    const spawner: PtySpawner = () => makeFakePty().pty
    const mgr = new PtyManager(spawner)
    const a = mgr.spawn({})
    const b = mgr.spawn({})
    expect(a).not.toBe(b)
    expect(mgr.has(a)).toBe(true)
  })

  it('encaminha data do pty para o assinante', () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const id = mgr.spawn({})
    const got: string[] = []
    mgr.onData(id, (d) => got.push(d))
    fake.emit('olá')
    expect(got).toEqual(['olá'])
  })

  it('escreve input no pty', () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const id = mgr.spawn({})
    mgr.write(id, 'ls\n')
    expect(fake.pty.write).toHaveBeenCalledWith('ls\n')
  })

  it('mata e esquece o pty', () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const id = mgr.spawn({})
    mgr.kill(id)
    expect(fake.pty.kill).toHaveBeenCalled()
    expect(mgr.has(id)).toBe(false)
  })

  it('passa file/cwd/cols/rows ao spawner com defaults', () => {
    const spawner = vi.fn(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    mgr.spawn({ cols: 100, rows: 30 })
    const call = spawner.mock.calls[0]
    expect(call[2].cols).toBe(100)
    expect(call[2].rows).toBe(30)
  })
})
