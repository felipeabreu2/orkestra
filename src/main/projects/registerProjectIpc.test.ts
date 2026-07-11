import { describe, it, expect, vi } from 'vitest'
import { registerProjectIpc } from './registerProjectIpc'
import type { ProjectManager } from './ProjectManager'
import type { Project, ProjectIndex } from '../../shared/project'
import type { CanvasSnapshot } from '../../shared/canvasSnapshot'

function fakeIpcMain() {
  const handlers = new Map<string, (...a: any[]) => any>()
  return {
    handle: (ch: string, fn: (...a: any[]) => any) => handlers.set(ch, fn),
    handlers
  }
}

function fakeIndex(): ProjectIndex {
  return { projects: [{ id: 'p1', name: 'Projeto 1' }], activeId: 'p1' }
}

// Fake mínimo do ProjectManager: só os métodos que registerProjectIpc chama, como vi.fn()
// espiáveis (cast via `as unknown as ProjectManager` porque a classe real tem campos privados).
function fakeMgr() {
  return {
    bootstrap: vi.fn(),
    list: vi.fn((): ProjectIndex => fakeIndex()),
    create: vi.fn((name: string, cwd?: string): Project => (cwd === undefined ? { id: 'p2', name } : { id: 'p2', name, cwd })),
    switch: vi.fn((_id: string): CanvasSnapshot | null => ({ version: 2, nodes: [], edges: [] })),
    rename: vi.fn((_id: string, _name: string): void => {}),
    remove: vi.fn((_id: string) => ({ activeId: 'p1', snapshot: null })),
    loadActiveCanvas: vi.fn((): CanvasSnapshot | null => null),
    saveActiveCanvas: vi.fn(),
    saveCanvas: vi.fn((_id: string, _snapshot: CanvasSnapshot): void => {}),
    // Fase 17 (Task 1): cwd do projeto.
    getActive: vi.fn((): Project | undefined => fakeIndex().projects[0]),
    setCwd: vi.fn((_id: string, _cwd: string): void => {}),
    // Fase 18 (Task 4): ícone (emoji) do projeto.
    setIcon: vi.fn((_id: string, _icon: string): void => {})
  }
}

describe('registerProjectIpc', () => {
  it('projects:list chama pm.list() e retorna o índice', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager)

    const result = await ipc.handlers.get('projects:list')!({})

    expect(mgr.list).toHaveBeenCalled()
    expect(result).toEqual(fakeIndex())
  })

  it('projects:create chama pm.create(name) e retorna o projeto criado', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager)

    const result = await ipc.handlers.get('projects:create')!({}, 'Backend')

    expect(mgr.create).toHaveBeenCalledWith('Backend', undefined)
    expect(result).toEqual({ id: 'p2', name: 'Backend' })
  })

  // Fase 17 (Task 1): create(name, cwd) — a pasta escolhida no diálogo (renderer) chega aqui
  // como segundo argumento e é repassada ao ProjectManager tal qual.
  it('projects:create com cwd chama pm.create(name, cwd) e retorna o projeto com cwd', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager)

    const result = await ipc.handlers.get('projects:create')!({}, 'Backend', '/Users/x/Apps')

    expect(mgr.create).toHaveBeenCalledWith('Backend', '/Users/x/Apps')
    expect(result).toEqual({ id: 'p2', name: 'Backend', cwd: '/Users/x/Apps' })
  })

  it('projects:setCwd chama pm.setCwd(id, cwd)', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager)

    await ipc.handlers.get('projects:setCwd')!({}, 'p1', '/Users/x/outro')

    expect(mgr.setCwd).toHaveBeenCalledWith('p1', '/Users/x/outro')
  })

  // pickDirectory é injetável: produção usa dialog.showOpenDialog (main/index.ts), teste usa um
  // fake — registerProjectIpc não conhece `dialog`/electron diretamente.
  it('projects:pickDirectory chama o pickDirectory injetado e retorna o path', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    const pickDirectory = vi.fn(async (): Promise<string | null> => '/Users/x/escolhida')
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager, pickDirectory)

    const result = await ipc.handlers.get('projects:pickDirectory')!({})

    expect(pickDirectory).toHaveBeenCalled()
    expect(result).toBe('/Users/x/escolhida')
  })

  it('projects:pickDirectory retorna null quando o usuário cancela o diálogo', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    const pickDirectory = vi.fn(async (): Promise<string | null> => null)
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager, pickDirectory)

    const result = await ipc.handlers.get('projects:pickDirectory')!({})

    expect(result).toBeNull()
  })

  // Fase 18 (Task 4): ícone (emoji) por projeto — a sidebar chama isso a partir do seletor
  // inline, tanto pelas opções curadas quanto pelo input de texto livre.
  it('projects:setIcon chama pm.setIcon(id, icon)', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager)

    await ipc.handlers.get('projects:setIcon')!({}, 'p1', '🚀')

    expect(mgr.setIcon).toHaveBeenCalledWith('p1', '🚀')
  })

  it('projects:switch chama pm.switch(id) e retorna o canvas do projeto', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager)

    const result = await ipc.handlers.get('projects:switch')!({}, 'p2')

    expect(mgr.switch).toHaveBeenCalledWith('p2')
    expect(result).toEqual({ version: 2, nodes: [], edges: [] })
  })

  it('projects:rename chama pm.rename(id, name)', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager)

    await ipc.handlers.get('projects:rename')!({}, 'p1', 'Novo nome')

    expect(mgr.rename).toHaveBeenCalledWith('p1', 'Novo nome')
  })

  it('projects:remove chama pm.remove(id) e retorna {activeId, snapshot}', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager)

    const result = await ipc.handlers.get('projects:remove')!({}, 'p1')

    expect(mgr.remove).toHaveBeenCalledWith('p1')
    expect(result).toEqual({ activeId: 'p1', snapshot: null })
  })

  // Fase 15 (Task 3): flush explícito por id na troca de projeto — precisa ser awaitable
  // (ipcMain.handle/invoke), diferente do persistence:save fire-and-forget, porque o renderer
  // precisa aguardar a gravação do projeto ANTIGO terminar antes de trocar o ativo.
  it('projects:saveCanvas chama pm.saveCanvas(id, snapshot)', async () => {
    const mgr = fakeMgr()
    const ipc = fakeIpcMain()
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager)

    const snapshot: CanvasSnapshot = { version: 2, nodes: [], edges: [] }
    await ipc.handlers.get('projects:saveCanvas')!({}, 'p1', snapshot)

    expect(mgr.saveCanvas).toHaveBeenCalledWith('p1', snapshot)
  })
})
