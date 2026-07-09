import { describe, it, expect, vi } from 'vitest'
import { registerPersistenceIpc } from './registerPersistenceIpc'

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

describe('registerPersistenceIpc', () => {
  it('persistence:load chama persistence.load', async () => {
    const persistence = { load: vi.fn(() => null), save: vi.fn() }
    const ipc = fakeIpcMain()
    registerPersistenceIpc(ipc as any, persistence as any)
    const result = await ipc.handlers.get('persistence:load')!({})
    expect(persistence.load).toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('persistence:save encaminha o snapshot a persistence.save', () => {
    const persistence = { load: vi.fn(), save: vi.fn() }
    const ipc = fakeIpcMain()
    registerPersistenceIpc(ipc as any, persistence as any)
    const snap = { version: 1, nodes: [] }
    ipc.listeners.get('persistence:save')!({}, snap)
    expect(persistence.save).toHaveBeenCalledWith(snap)
  })
})
