import type { IpcMain } from 'electron'
import type { ProjectManager } from './ProjectManager'
import type { CanvasSnapshot } from '../../shared/canvasSnapshot'

// Fase 15 (Task 2): CRUD de projetos, todo via ipcMain.handle (invoke) — o renderer sempre quer
// o resultado (lista atualizada, projeto criado, canvas trocado, etc.), diferente de
// persistence:save (fire-and-forget, ver registerPersistenceIpc).
export function registerProjectIpc(ipcMain: IpcMain, pm: ProjectManager): void {
  ipcMain.handle('projects:list', () => pm.list())
  ipcMain.handle('projects:create', (_e, name: string) => pm.create(name))
  ipcMain.handle('projects:switch', (_e, id: string) => pm.switch(id))
  ipcMain.handle('projects:rename', (_e, id: string, name: string) => pm.rename(id, name))
  ipcMain.handle('projects:remove', (_e, id: string) => pm.remove(id))
  // Fase 15 (Task 3): flush explícito por id na troca de projeto. Via handle (não send/on) porque
  // o renderer precisa AGUARDAR a gravação terminar antes de chamar projects:switch — ao
  // contrário de persistence:save, aqui a ordem entre este flush e o switch importa.
  ipcMain.handle('projects:saveCanvas', (_e, id: string, snapshot: CanvasSnapshot) =>
    pm.saveCanvas(id, snapshot)
  )
}
