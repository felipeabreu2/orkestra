import { describe, it, expect, vi, afterEach } from 'vitest'
import { PtyManager, type IPtyLike, type PtySpawner } from './PtyManager'

function makeFakePty() {
  const dataCbs: Array<(d: string) => void> = []
  let exitCb: (e: { exitCode: number }) => void = () => {}
  const pty: IPtyLike = {
    onData: (cb) => { dataCbs.push(cb) },
    onExit: (cb) => { exitCb = cb },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn()
  }
  return {
    pty,
    emit: (d: string) => { for (const cb of dataCbs) cb(d) },
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

  it('killAll mata todos os ptys e limpa o mapa', () => {
    const fakeA = makeFakePty()
    const fakeB = makeFakePty()
    const fakes = [fakeA.pty, fakeB.pty]
    const spawner: PtySpawner = () => fakes.shift()!
    const mgr = new PtyManager(spawner)
    const idA = mgr.spawn({})
    const idB = mgr.spawn({})
    mgr.killAll()
    expect(fakeA.pty.kill).toHaveBeenCalled()
    expect(fakeB.pty.kill).toHaveBeenCalled()
    expect(mgr.has(idA)).toBe(false)
    expect(mgr.has(idB)).toBe(false)
  })

  it('remove o pty do mapa quando ele sai sozinho (onExit)', () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const id = mgr.spawn({})
    expect(mgr.has(id)).toBe(true)
    fake.emitExit(0)
    expect(mgr.has(id)).toBe(false)
  })

  it('onExit(id, cb) notifica um assinante externo quando o pty sai, sem quebrar a limpeza interna', () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const id = mgr.spawn({ nodeId: 'node-Z' })
    const got: number[] = []
    mgr.onExit(id, (e) => got.push(e.exitCode))
    fake.emitExit(7)
    expect(got).toEqual([7])
    // a limpeza interna (ptys/ptyByNode) continua acontecendo normalmente
    expect(mgr.has(id)).toBe(false)
    expect(mgr.ptyIdForNode('node-Z')).toBeUndefined()
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
    expect(call[2].env).toEqual(process.env) // agora é uma cópia (merge com opts.env), não a mesma referência
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

  it('registra nodeId->ptyId e resolve com ptyIdForNode', () => {
    const mgr = new PtyManager(() => makeFakePty().pty)
    const id = mgr.spawn({ nodeId: 'node-A' })
    expect(mgr.ptyIdForNode('node-A')).toBe(id)
  })

  it('remove o mapa nodeId->ptyId quando mata explicitamente', () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const id = mgr.spawn({ nodeId: 'node-X' })
    expect(mgr.ptyIdForNode('node-X')).toBe(id)
    mgr.kill(id)
    expect(mgr.ptyIdForNode('node-X')).toBeUndefined()
  })

  it('remove o mapa nodeId->ptyId quando o pty sai sozinho', () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const id = mgr.spawn({ nodeId: 'node-Y' })
    expect(mgr.ptyIdForNode('node-Y')).toBe(id)
    fake.emitExit(0)
    expect(mgr.ptyIdForNode('node-Y')).toBeUndefined()
  })

  it('mescla env extra sobre process.env no spawn', () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    mgr.spawn({ env: { ORKESTRA_PORT: '1234' } })
    const call = spawner.mock.calls[0]
    expect(call[2].env.ORKESTRA_PORT).toBe('1234')
    expect(call[2].env.PATH).toBe(process.env.PATH) // preserva o resto
  })
})
