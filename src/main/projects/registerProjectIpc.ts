import type { IpcMain } from 'electron'
import type { ProjectManager } from './ProjectManager'
import type { CanvasSnapshot } from '../../shared/canvasSnapshot'

// Fase 17 (Task 1): abre o diálogo nativo de escolha de pasta -> path escolhido, ou null se o
// usuário cancelar. Injetável para manter este módulo livre de `electron.dialog` em teste
// (produção passa um wrapper de dialog.showOpenDialog via main/index.ts).
export type PickDirectory = () => Promise<string | null>

// Fase 15 (Task 2): CRUD de projetos, todo via ipcMain.handle (invoke) — o renderer sempre quer
// o resultado (lista atualizada, projeto criado, canvas trocado, etc.), diferente de
// persistence:save (fire-and-forget, ver registerPersistenceIpc).
export function registerProjectIpc(ipcMain: IpcMain, pm: ProjectManager, pickDirectory?: PickDirectory): void {
  ipcMain.handle('projects:list', () => pm.list())
  // Fase 17 (Task 1): create agora aceita uma pasta (cwd) opcional — escolhida no renderer via
  // projects:pickDirectory antes de chamar create.
  ipcMain.handle('projects:create', (_e, name: string, cwd?: string) => pm.create(name, cwd))
  ipcMain.handle('projects:switch', (_e, id: string) => pm.switch(id))
  ipcMain.handle('projects:rename', (_e, id: string, name: string) => pm.rename(id, name))
  ipcMain.handle('projects:remove', (_e, id: string) => pm.remove(id))
  // Fase 15 (Task 3): flush explícito por id na troca de projeto. Via handle (não send/on) porque
  // o renderer precisa AGUARDAR a gravação terminar antes de chamar projects:switch — ao
  // contrário de persistence:save, aqui a ordem entre este flush e o switch importa.
  ipcMain.handle('projects:saveCanvas', (_e, id: string, snapshot: CanvasSnapshot) =>
    pm.saveCanvas(id, snapshot)
  )
  // Fase 17 (Task 1): troca a pasta de um projeto já existente (ex.: botão "pasta" na sidebar).
  ipcMain.handle('projects:setCwd', (_e, id: string, cwd: string) => pm.setCwd(id, cwd))
  // Fase 17 (Task 1): abre o diálogo de pasta -> string | null. Sem pickDirectory injetado
  // (não deveria acontecer em produção, já que main/index.ts sempre passa um), retorna null.
  ipcMain.handle('projects:pickDirectory', async () => (pickDirectory ? await pickDirectory() : null))
}
