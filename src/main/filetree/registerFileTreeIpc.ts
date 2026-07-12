import type { IpcMain } from 'electron'
import type { FileTreeService } from './FileTreeService'

// Fase 19 (Task 1): árvore de arquivos (canvas file-explorer node) — só leitura, sem mutação de
// fs/git (ver FileTreeService). Cada handler delega 1:1 ao serviço; erros (dir/arquivo
// inexistente etc.) não são tratados aqui — propagam como rejeição do invoke(), que o renderer
// trata (Task 2, fora do escopo desta task).
export function registerFileTreeIpc(ipcMain: IpcMain, svc: FileTreeService): void {
  ipcMain.handle('filetree:list', (_e, dir: string) => svc.list(dir))
  ipcMain.handle('filetree:read', (_e, path: string) => svc.read(path))
  ipcMain.handle('filetree:gitStatus', (_e, dir: string) => svc.gitStatus(dir))
}
