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
  it('persistence:load chama persistence.load (shape legado: projectId null)', async () => {
    const persistence = { load: vi.fn(() => null) }
    const ipc = fakeIpcMain()
    registerPersistenceIpc(ipc as any, persistence as any)
    const result = await ipc.handlers.get('persistence:load')!({})
    expect(persistence.load).toHaveBeenCalled()
    expect(result).toEqual({ projectId: null, snapshot: null })
  })

  // INT-6 (auditoria 2026-07-14): o canal persistence:save foi REMOVIDO (era o vetor da corrupção
  // cross-project e não tinha mais chamadores). Só persistence:load permanece registrado.
  it('persistence:save NÃO é mais registrado (canal removido)', () => {
    const persistence = { load: vi.fn(() => null) }
    const ipc = fakeIpcMain()
    registerPersistenceIpc(ipc as any, persistence as any)
    expect(ipc.listeners.has('persistence:save')).toBe(false)
  })

  // Fase 15 (Task 2): registerPersistenceIpc também aceita um ProjectManager (loadActiveCanvas em
  // vez de load), detectado por duck-typing. Fix de corrupção cross-project (2026-07-14): o load
  // devolve TAMBÉM o id do projeto ativo, num round-trip atômico — o renderer guarda esse id
  // (canvasStore.activeProjectId) e salva por id explícito (projects:saveCanvas).
  it('persistence:load delega a pm.loadActiveCanvas e inclui o projectId ativo', async () => {
    const pm = {
      loadActiveCanvas: vi.fn(() => ({ version: 2, nodes: [], edges: [] })),
      getActive: vi.fn(() => ({ id: 'proj-1', name: 'P1' }))
    }
    const ipc = fakeIpcMain()
    registerPersistenceIpc(ipc as any, pm as any)

    const result = await ipc.handlers.get('persistence:load')!({})

    expect(pm.loadActiveCanvas).toHaveBeenCalled()
    expect(result).toEqual({ projectId: 'proj-1', snapshot: { version: 2, nodes: [], edges: [] } })
  })
})
