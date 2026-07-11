import type { IpcMain } from 'electron'
import type { ProjectManager } from './ProjectManager'

// Fase 15 (Task 2): CRUD de projetos, todo via ipcMain.handle (invoke) — o renderer sempre quer
// o resultado (lista atualizada, projeto criado, canvas trocado, etc.), diferente de
// persistence:save (fire-and-forget, ver registerPersistenceIpc).
export function registerProjectIpc(ipcMain: IpcMain, pm: ProjectManager): void {
  ipcMain.handle('projects:list', () => pm.list())
  ipcMain.handle('projects:create', (_e, name: string) => pm.create(name))
  ipcMain.handle('projects:switch', (_e, id: string) => pm.switch(id))
  ipcMain.handle('projects:rename', (_e, id: string, name: string) => pm.rename(id, name))
  ipcMain.handle('projects:remove', (_e, id: string) => pm.remove(id))
}
