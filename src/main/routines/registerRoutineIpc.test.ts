import { describe, it, expect, vi } from 'vitest'
import { registerRoutineIpc } from './registerRoutineIpc'
import { RoutineScheduler } from './RoutineScheduler'

// Mesmo fake mínimo de ipcMain usado em registerFloorIpc.test.ts/registerPtyIpc.test.ts.
function fakeIpcMain() {
  const handlers = new Map<string, (...a: any[]) => any>()
  return {
    handle: (ch: string, fn: (...a: any[]) => any) => handlers.set(ch, fn),
    handlers
  }
}

// Scheduler real (não fake) por instrução do brief: RoutineScheduler não toca disco sem
// persistPath, então é seguro/rápido de usar diretamente aqui.
function realScheduler(now?: () => Date): RoutineScheduler {
  return new RoutineScheduler({ onFire: vi.fn(), now })
}

describe('registerRoutineIpc', () => {
  it('routine:list chama scheduler.list() e retorna o resultado', async () => {
    const scheduler = realScheduler()
    scheduler.add({ name: 'R', schedule: '* * * * *', target: 'D', command: 'x', enabled: true })
    const ipc = fakeIpcMain()
    registerRoutineIpc(ipc as any, scheduler)

    const result = await ipc.handlers.get('routine:list')!({})

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ name: 'R', schedule: '* * * * *', target: 'D', command: 'x', enabled: true })
  })

  it('routine:add chama scheduler.add(payload) e retorna a rotina criada com id', async () => {
    const scheduler = realScheduler()
    const ipc = fakeIpcMain()
    registerRoutineIpc(ipc as any, scheduler)

    const payload = { name: 'R', schedule: '* * * * *', target: 'D', command: 'x', enabled: true }
    const result = await ipc.handlers.get('routine:add')!({}, payload)

    expect(result).toMatchObject(payload)
    expect(typeof result.id).toBe('string')
    expect(result.id.length).toBeGreaterThan(0)
    expect(scheduler.list()).toEqual([result])
  })

  it('routine:remove chama scheduler.remove(id) e tira a rotina da lista', async () => {
    const scheduler = realScheduler()
    const r = scheduler.add({ name: 'R', schedule: '* * * * *', target: 'D', command: 'x', enabled: true })
    const ipc = fakeIpcMain()
    registerRoutineIpc(ipc as any, scheduler)

    const result = await ipc.handlers.get('routine:remove')!({}, r.id)

    expect(result).toBe(true)
    expect(scheduler.list()).toHaveLength(0)
  })

  it('routine:toggle chama scheduler.setEnabled(id, enabled) e o tick para de disparar', async () => {
    const at930 = new Date(2026, 6, 10, 9, 30, 0, 0)
    const onFire = vi.fn()
    const scheduler = new RoutineScheduler({ onFire, now: () => at930 })
    const r = scheduler.add({ name: 'R', schedule: '30 9 * * *', target: 'D', command: 'x', enabled: true })
    const ipc = fakeIpcMain()
    registerRoutineIpc(ipc as any, scheduler)

    const result = await ipc.handlers.get('routine:toggle')!({}, r.id, false)
    scheduler.tick()

    expect(result).toBe(true)
    expect(onFire).not.toHaveBeenCalled()
    expect(scheduler.list()[0]).toMatchObject({ id: r.id, enabled: false })
  })
})
