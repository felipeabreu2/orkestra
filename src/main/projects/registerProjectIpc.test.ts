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
    setIcon: vi.fn((_id: string, _icon: string): void => {}),
    // Resiliência T6: hibernação (terminais por id explícito).
    terminalNodeIds: vi.fn((_id: string): string[] => []),
    // Batuta T5: leitura crua para o índice cross-projeto.
    crossProjectCanvases: vi.fn(() => [])
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

  // PTY-1 (auditoria 2026-07-14): o handler mata os ptys dos terminais do projeto removido (via
  // callback) e devolve ao renderer o mesmo shape {activeId, snapshot} de sempre (sem removedNodeIds).
  it('projects:remove mata os ptys do projeto removido e não vaza removedNodeIds ao renderer', async () => {
    const mgr = fakeMgr()
    mgr.remove = vi.fn((_id: string) => ({ activeId: 'p1', snapshot: null, removedNodeIds: ['terminal-a', 'terminal-b'] }))
    const killed: string[] = []
    const ipc = fakeIpcMain()
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager, undefined, undefined, (ids) => killed.push(...ids))

    const result = await ipc.handlers.get('projects:remove')!({}, 'p1')

    expect(killed).toEqual(['terminal-a', 'terminal-b'])
    expect(result).toEqual({ activeId: 'p1', snapshot: null })
  })

  // ── Resiliência · T6: hibernação de projeto ──────────────────────────────────────────────────
  it('projects:hibernate chama onHibernate com os terminais DAQUELE id e não toca índice/ativo', async () => {
    const mgr = fakeMgr()
    mgr.terminalNodeIds = vi.fn((id: string) => (id === 'p2' ? ['t-b1', 't-b2'] : []))
    const hibernated: string[] = []
    const ipc = fakeIpcMain()
    registerProjectIpc(
      ipc as any,
      mgr as unknown as ProjectManager,
      undefined,
      undefined,
      undefined,
      (ids) => hibernated.push(...ids)
    )

    await ipc.handlers.get('projects:hibernate')!({}, 'p2')

    expect(mgr.terminalNodeIds).toHaveBeenCalledTimes(1)
    expect(mgr.terminalNodeIds).toHaveBeenCalledWith('p2')
    expect(hibernated).toEqual(['t-b1', 't-b2'])
    // hibernar NÃO é switch nem remove: nada de mexer no índice/ativo/canvas
    expect(mgr.switch).not.toHaveBeenCalled()
    expect(mgr.remove).not.toHaveBeenCalled()
    expect(mgr.saveCanvas).not.toHaveBeenCalled()
  })

  it('projects:hibernate sem onHibernate (chamador legado) é no-op seguro', async () => {
    const mgr = fakeMgr()
    mgr.terminalNodeIds = vi.fn(() => ['t1'])
    const ipc = fakeIpcMain()
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager)
    expect(() => ipc.handlers.get('projects:hibernate')!({}, 'p1')).not.toThrow()
  })

  // Batuta T5: o handler compõe crossProjectCanvases + buildCrossProjectIndex (pula o ativo).
  it('projects:crossIndex devolve entradas dos projetos NÃO-ativos, cada uma com projectId', async () => {
    const mgr = fakeMgr()
    mgr.crossProjectCanvases = vi.fn(() => [
      { project: { id: 'p1', name: 'A' }, nodes: [{ id: 't1', type: 'terminal', data: { name: 'Dev' } }] },
      { project: { id: 'p2', name: 'B' }, nodes: [{ id: 't2', type: 'terminal', data: { name: 'Rev' } }] }
    ])
    mgr.list = vi.fn(() => ({ projects: [{ id: 'p1', name: 'A' }], activeId: 'p1' }))
    const ipc = fakeIpcMain()
    registerProjectIpc(ipc as any, mgr as unknown as ProjectManager)
    const idx = (await ipc.handlers.get('projects:crossIndex')!({})) as Array<{ projectId: string }>
    expect(idx.map((e) => e.projectId)).toEqual(['p2']) // p1 é o ativo → pulado
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
