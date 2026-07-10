import { describe, it, expect, vi } from 'vitest'
import { registerFloorIpc } from './registerFloorIpc'
import type { FloorManager } from './FloorManager'
import type { Floor } from '../../shared/floors'

function fakeIpcMain() {
  const handlers = new Map<string, (...a: any[]) => any>()
  return {
    handle: (ch: string, fn: (...a: any[]) => any) => handlers.set(ch, fn),
    handlers
  }
}

function fakeFloor(overrides: Partial<Floor> = {}): Floor {
  return {
    id: 'f1',
    name: 'demo',
    repoPath: '/repo',
    worktreePath: '/repo/.floors/f1',
    branch: 'orkestra/floor-demo-f1',
    ...overrides
  }
}

// Fake mínimo do FloorManager: implementa só os métodos que registerFloorIpc chama, como
// vi.fn() espiáveis. Cast via `as unknown as FloorManager` porque FloorManager tem campos
// privados — nenhum objeto literal é estruturalmente atribuível a ele (mesma técnica de
// `ipc as any` já usada em registerPtyIpc.test.ts para o fake de ipcMain).
function fakeMgr() {
  return {
    create: vi.fn(async (repoPath: string, name: string) => fakeFloor({ repoPath, name })),
    list: vi.fn((): Floor[] => [fakeFloor()]),
    get: vi.fn((): Floor | undefined => undefined),
    land: vi.fn(async (id: string) => ({ ok: true, output: `landed ${id}` })),
    remove: vi.fn(async (_id: string) => {}),
    loadPersisted: vi.fn(async () => {})
  }
}

describe('registerFloorIpc', () => {
  it('floor:list chama mgr.list() e retorna o resultado', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    registerFloorIpc(ipc as any, mgr as unknown as FloorManager, async () => null)

    const result = await ipc.handlers.get('floor:list')!({})

    expect(mgr.list).toHaveBeenCalled()
    expect(result).toEqual([fakeFloor()])
  })

  it('floor:land chama mgr.land(id) e retorna o resultado', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    registerFloorIpc(ipc as any, mgr as unknown as FloorManager, async () => null)

    const result = await ipc.handlers.get('floor:land')!({}, 'f1')

    expect(mgr.land).toHaveBeenCalledWith('f1')
    expect(result).toEqual({ ok: true, output: 'landed f1' })
  })

  it('floor:remove chama mgr.remove(id) e retorna true', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    registerFloorIpc(ipc as any, mgr as unknown as FloorManager, async () => null)

    const result = await ipc.handlers.get('floor:remove')!({}, 'f1')

    expect(mgr.remove).toHaveBeenCalledWith('f1')
    expect(result).toBe(true)
  })

  it('floor:create chama pickRepo e, com um path escolhido, mgr.create(repoPath, name)', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    const pickRepo = vi.fn(async () => '/some/repo')
    registerFloorIpc(ipc as any, mgr as unknown as FloorManager, pickRepo)

    const result = await ipc.handlers.get('floor:create')!({}, 'Feature X')

    expect(pickRepo).toHaveBeenCalled()
    expect(mgr.create).toHaveBeenCalledWith('/some/repo', 'Feature X')
    expect(result).toEqual(fakeFloor({ repoPath: '/some/repo', name: 'Feature X' }))
  })

  it('floor:create retorna null e não chama mgr.create quando pickRepo cancela', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    const pickRepo = vi.fn(async (): Promise<string | null> => null)
    registerFloorIpc(ipc as any, mgr as unknown as FloorManager, pickRepo)

    const result = await ipc.handlers.get('floor:create')!({}, 'Feature X')

    expect(pickRepo).toHaveBeenCalled()
    expect(mgr.create).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })
})
