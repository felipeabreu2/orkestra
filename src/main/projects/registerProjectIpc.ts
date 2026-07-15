import type { IpcMain } from 'electron'
import type { ProjectManager } from './ProjectManager'
import type { CanvasSnapshot } from '../../shared/canvasSnapshot'

// Fase 17 (Task 1): abre o diálogo nativo de escolha de pasta -> path escolhido, ou null se o
// usuário cancelar. Injetável para manter este módulo livre de `electron.dialog` em teste
// (produção passa um wrapper de dialog.showOpenDialog via main/index.ts).
export type PickDirectory = () => Promise<string | null>
// Onda 7: espelha PickDirectory, mas com properties ['openFile'] — anexar 1 arquivo ao canvas.
export type PickFile = () => Promise<string | null>

// Fase 15 (Task 2): CRUD de projetos, todo via ipcMain.handle (invoke) — o renderer sempre quer
// o resultado (lista atualizada, projeto criado, canvas trocado, etc.), diferente de
// persistence:save (fire-and-forget, ver registerPersistenceIpc).
export function registerProjectIpc(
  ipcMain: IpcMain,
  pm: ProjectManager,
  pickDirectory?: PickDirectory,
  pickFile?: PickFile,
  // PTY-1 (auditoria 2026-07-14): chamado com os nodeIds dos terminais do projeto removido, para o
  // main matar os ptys (que sobrevivem à troca de projeto e ficariam órfãos vivos após a remoção).
  // Opcional/appended por retrocompatibilidade (testes e chamadores antigos seguem válidos).
  onProjectRemoved?: (nodeIds: string[]) => void
): void {
  ipcMain.handle('projects:list', () => pm.list())
  // Fase 17 (Task 1): create agora aceita uma pasta (cwd) opcional — escolhida no renderer via
  // projects:pickDirectory antes de chamar create.
  ipcMain.handle('projects:create', (_e, name: string, cwd?: string) => pm.create(name, cwd))
  ipcMain.handle('projects:switch', (_e, id: string) => pm.switch(id))
  ipcMain.handle('projects:rename', (_e, id: string, name: string) => pm.rename(id, name))
  ipcMain.handle('projects:remove', (_e, id: string) => {
    const { activeId, snapshot, removedNodeIds } = pm.remove(id)
    onProjectRemoved?.(removedNodeIds) // mata os ptys dos terminais do projeto removido
    return { activeId, snapshot } // shape para o renderer é inalterado ({activeId, snapshot})
  })
  // Badge da sidebar (2026-07-14): nº de terminais por projeto.
  ipcMain.handle('projects:terminalCounts', () => pm.terminalCounts())
  // Fase 15 (Task 3): flush explícito por id na troca de projeto. Via handle (não send/on) porque
  // o renderer precisa AGUARDAR a gravação terminar antes de chamar projects:switch — ao
  // contrário de persistence:save, aqui a ordem entre este flush e o switch importa.
  ipcMain.handle('projects:saveCanvas', (_e, id: string, snapshot: CanvasSnapshot) =>
    pm.saveCanvas(id, snapshot)
  )
  // Fase 17 (Task 1): troca a pasta de um projeto já existente (ex.: botão "pasta" na sidebar).
  ipcMain.handle('projects:setCwd', (_e, id: string, cwd: string) => pm.setCwd(id, cwd))
  // Fase 18 (Task 4): troca o ícone (emoji) de um projeto já existente (seletor inline na
  // sidebar — lista curada + input de texto livre).
  ipcMain.handle('projects:setIcon', (_e, id: string, icon: string) => pm.setIcon(id, icon))
  // Fase 17 (Task 1): abre o diálogo de pasta -> string | null. Sem pickDirectory injetado
  // (não deveria acontecer em produção, já que main/index.ts sempre passa um), retorna null.
  ipcMain.handle('projects:pickDirectory', async () => (pickDirectory ? await pickDirectory() : null))
  // Onda 7: escolhe 1 arquivo para o nó de arquivo (clip). Mesmo padrão do pickDirectory.
  ipcMain.handle('projects:pickFile', async () => (pickFile ? await pickFile() : null))
}
