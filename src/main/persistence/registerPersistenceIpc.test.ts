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

  // Fase 15 (Task 2): registerPersistenceIpc agora também aceita um ProjectManager (que não tem
  // load/save, e sim loadActiveCanvas/saveActiveCanvas) — persistence:load/save passam a operar
  // sobre o projeto ATIVO. Detecção por duck-typing (presença de loadActiveCanvas), então o
  // shape antigo {load,save} acima continua funcionando sem mudança (testes anteriores intactos).
  it('persistence:load delega a pm.loadActiveCanvas quando o alvo é um ProjectManager', async () => {
    const pm = {
      loadActiveCanvas: vi.fn(() => ({ version: 2, nodes: [], edges: [] })),
      saveActiveCanvas: vi.fn()
    }
    const ipc = fakeIpcMain()
    registerPersistenceIpc(ipc as any, pm as any)

    const result = await ipc.handlers.get('persistence:load')!({})

    expect(pm.loadActiveCanvas).toHaveBeenCalled()
    expect(result).toEqual({ version: 2, nodes: [], edges: [] })
  })

  it('persistence:save delega a pm.saveActiveCanvas quando o alvo é um ProjectManager', () => {
    const pm = { loadActiveCanvas: vi.fn(), saveActiveCanvas: vi.fn() }
    const ipc = fakeIpcMain()
    registerPersistenceIpc(ipc as any, pm as any)
    const snap = { version: 2, nodes: [], edges: [] }

    ipc.listeners.get('persistence:save')!({}, snap)

    expect(pm.saveActiveCanvas).toHaveBeenCalledWith(snap)
  })
})
