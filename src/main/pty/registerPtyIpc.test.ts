import { describe, it, expect, vi } from 'vitest'
import { registerPtyIpc } from './registerPtyIpc'
import { PtyManager, type IPtyLike, type PtySpawner } from './PtyManager'
import { AgentBus } from '../orchestration/AgentBus'

function fakeIpcMain() {
  const handlers = new Map<string, (...a: any[]) => any>()
  const listeners = new Map<string, (...a: any[]) => void>()
  return {
    handle: (ch: string, fn: (...a: any[]) => any) => handlers.set(ch, fn),
    on: (ch: string, fn: (...a: any[]) => void) => listeners.set(ch, fn),
    handlers,
    listeners
  }
}

function makeFakePty(): { pty: IPtyLike; emit: (d: string) => void } {
  let dataCb: (d: string) => void = () => {}
  return {
    pty: { onData: (cb) => { dataCb = cb }, onExit: () => {}, write: vi.fn(), resize: vi.fn(), kill: vi.fn() },
    emit: (d) => dataCb(d)
  }
}

// Fake multi-subscriber (não sobrescreve o assinante anterior) — o mesmo formato usado em
// PtyManager.test.ts. Necessário aqui para provar que DUAS assinaturas onData independentes
// (o streaming do registerPtyIpc para o renderer + o buffer do AgentBus) coexistem no mesmo
// pty sem uma pisar na outra, o que o fake de slot único acima não conseguiria revelar.
function makeMultiSubFakePty(): { pty: IPtyLike; emit: (d: string) => void } {
  const dataCbs: Array<(d: string) => void> = []
  return {
    pty: {
      onData: (cb) => { dataCbs.push(cb) },
      onExit: () => {},
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn()
    },
    emit: (d) => { for (const cb of dataCbs) cb(d) }
  }
}

describe('registerPtyIpc', () => {
  it('pty:spawn cria pty e encaminha data ao sender', async () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const sender = { send: vi.fn() }
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => sender as any)

    const id = await ipc.handlers.get('pty:spawn')!({}, { cols: 80, rows: 24 })
    expect(typeof id).toBe('string')
    fake.emit('data-x')
    expect(sender.send).toHaveBeenCalledWith('pty:data', id, 'data-x')
  })

  it('pty:write encaminha ao PtyManager', async () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)
    const id = await ipc.handlers.get('pty:spawn')!({}, {})
    ipc.listeners.get('pty:write')!({}, id, 'echo hi\n')
    expect(fake.pty.write).toHaveBeenCalledWith('echo hi\n')
  })

  it('pty:spawn injeta o env de orquestração (getEnv) no PtyManager.spawn', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null, () => ({ ORKESTRA_PORT: '4321', ORKESTRA_TOKEN: 'tok' }))

    await ipc.handlers.get('pty:spawn')!({}, { cols: 80, rows: 24 })

    const call = spawner.mock.calls[0]
    expect(call[2].env.ORKESTRA_PORT).toBe('4321')
    expect(call[2].env.ORKESTRA_TOKEN).toBe('tok')
  })

  it('pty:spawn sem getEnv explícito não quebra (default env vazio)', async () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)
    const id = await ipc.handlers.get('pty:spawn')!({}, {})
    expect(typeof id).toBe('string')
  })

  it('pty:spawn chama onSpawn(id) depois de criar o pty (hook opcional)', async () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const ipc = fakeIpcMain()
    const onSpawn = vi.fn()
    registerPtyIpc(ipc as any, mgr, () => null, undefined, onSpawn)
    const id = await ipc.handlers.get('pty:spawn')!({}, {})
    expect(onSpawn).toHaveBeenCalledWith(id)
  })

  it('pty:spawn sem onSpawn explícito não quebra (default no-op)', async () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)
    const id = await ipc.handlers.get('pty:spawn')!({}, {})
    expect(typeof id).toBe('string')
  })

  // Fase 17 (Task 1): getProjectCwd é o resolver late-bound do cwd do projeto ATIVO — chamado a
  // cada pty:spawn (não cacheado), então trocar de projeto muda a pasta dos PRÓXIMOS terminais.
  it('pty:spawn sem o.cwd usa getProjectCwd() como cwd', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null, undefined, undefined, () => '/tmp/proj')

    await ipc.handlers.get('pty:spawn')!({}, { cols: 80, rows: 24 })

    const call = spawner.mock.calls[0]
    expect(call[2].cwd).toBe('/tmp/proj')
  })

  it('pty:spawn com o.cwd explícito vence sobre getProjectCwd()', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null, undefined, undefined, () => '/tmp/proj')

    await ipc.handlers.get('pty:spawn')!({}, { cwd: '/tmp/explicito' })

    const call = spawner.mock.calls[0]
    expect(call[2].cwd).toBe('/tmp/explicito')
  })

  // Segurança: o handler de pty:spawn deve fazer allowlist explícito dos campos vindos do
  // renderer. Sem isto, `{ ...o }` repassaria file/args arbitrários direto ao PtyManager.spawn
  // (que os repassa ao spawner real/node-pty), permitindo RCE a partir de um renderer
  // comprometido — bypassando totalmente o gate de isValidSshHost.
  it('ignora file/args vindos do renderer (allowlist) — não spawna binário arbitrário', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)

    await ipc.handlers.get('pty:spawn')!({}, { file: '/bin/sh', args: ['-c', 'x'], nodeId: 'n1' })

    const call = spawner.mock.calls[0]
    expect(call[0]).not.toBe('/bin/sh') // usou o shell padrão, não o file vindo do renderer
    expect(call[1]).toEqual([])         // args vindos do renderer são ignorados
  })

  it('pty:spawn sem o.cwd e sem getProjectCwd deixa o PtyManager aplicar o fallback de HOME', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)

    await ipc.handlers.get('pty:spawn')!({}, {})

    const call = spawner.mock.calls[0]
    expect(call[2].cwd).toBe(process.env.HOME ?? process.cwd())
  })

  it('a assinatura onData do streaming (renderer) e a do AgentBus.track coexistem no mesmo pty (multi-subscriber)', async () => {
    const fake = makeMultiSubFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const bus = new AgentBus(mgr)
    const sender = { send: vi.fn() }
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => sender as any, undefined, (id) => bus.track(id))

    const id = await ipc.handlers.get('pty:spawn')!({}, {})
    fake.emit('saida-do-agente')

    expect(sender.send).toHaveBeenCalledWith('pty:data', id, 'saida-do-agente')
    expect(bus.read(id)).toContain('saida-do-agente')
  })
})
