import { describe, it, expect, vi, afterEach } from 'vitest'
import { PtyManager, type IPtyLike, type PtySpawner } from './PtyManager'

function makeFakePty() {
  let dataCb: (d: string) => void = () => {}
  let exitCb: (e: { exitCode: number }) => void = () => {}
  const pty: IPtyLike = {
    onData: (cb) => { dataCb = cb },
    onExit: (cb) => { exitCb = cb },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn()
  }
  return {
    pty,
    emit: (d: string) => dataCb(d),
    emitExit: (code: number) => exitCb({ exitCode: code })
  }
}

describe('PtyManager', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

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

  it('remove o pty do mapa quando ele sai sozinho (onExit)', () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const id = mgr.spawn({})
    expect(mgr.has(id)).toBe(true)
    fake.emitExit(0)
    expect(mgr.has(id)).toBe(false)
  })

  it('passa file/cwd/cols/rows ao spawner com defaults', () => {
    vi.stubEnv('SHELL', '/bin/zsh')
    vi.stubEnv('HOME', '/tmp/home')
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    mgr.spawn({})
    const call = spawner.mock.calls[0]
    expect(call[0]).toBe('/bin/zsh')
    expect(call[1]).toEqual([])
    expect(call[2].cwd).toBe('/tmp/home')
    expect(call[2].env).toBe(process.env)
    expect(call[2].cols).toBe(80)
    expect(call[2].rows).toBe(24)
  })

  it('usa cols/rows explícitos em vez dos defaults', () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    mgr.spawn({ cols: 100, rows: 30 })
    const call = spawner.mock.calls[0]
    expect(call[2].cols).toBe(100)
    expect(call[2].rows).toBe(30)
  })

  it('usa file/cwd explícitos em vez dos defaults de ambiente', () => {
    vi.stubEnv('SHELL', '/bin/zsh')
    vi.stubEnv('HOME', '/tmp/home')
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    mgr.spawn({ file: '/bin/fish', cwd: '/explicit/cwd' })
    const call = spawner.mock.calls[0]
    expect(call[0]).toBe('/bin/fish')
    expect(call[2].cwd).toBe('/explicit/cwd')
  })
})
