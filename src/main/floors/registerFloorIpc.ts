import type { IpcMain } from 'electron'
import type { FloorManager } from './FloorManager'

// pickRepo injetável p/ testes; em produção usa dialog.showOpenDialog (main/index.ts).
export function registerFloorIpc(
  ipcMain: IpcMain,
  mgr: FloorManager,
  pickRepo: () => Promise<string | null>
): void {
  ipcMain.handle('floor:create', async (_e, name: string) => {
    const repoPath = await pickRepo()
    if (!repoPath) return null
    return mgr.create(repoPath, name)
  })
  ipcMain.handle('floor:list', async () => mgr.list())
  ipcMain.handle('floor:land', async (_e, id: string) => mgr.land(id))
  ipcMain.handle('floor:remove', async (_e, id: string) => {
    await mgr.remove(id)
    return true
  })
}
