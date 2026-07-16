import type { IpcMain } from 'electron'
import type { FileTreeService } from './FileTreeService'

// Fase 19 (Task 1): árvore de arquivos (canvas file-explorer node). list/read/gitStatus são só
// leitura; `write` (Onda 2 · T4) é a PRIMEIRA mutação — grava um arquivo de forma atômica e valida
// no MAIN que o caminho está sob a raiz da árvore (svc.write -> isInsideRoot). Cada handler delega
// 1:1 ao serviço; erros (dir/arquivo inexistente, escrita fora da raiz etc.) não são tratados aqui —
// propagam como rejeição do invoke(), que o renderer trata (mostra o erro na UI do editor/árvore).
export function registerFileTreeIpc(ipcMain: IpcMain, svc: FileTreeService): void {
  ipcMain.handle('filetree:list', (_e, dir: string) => svc.list(dir))
  ipcMain.handle('filetree:read', (_e, path: string) => svc.read(path))
  ipcMain.handle('filetree:gitStatus', (_e, dir: string) => svc.gitStatus(dir))
  ipcMain.handle('filetree:write', (_e, path: string, content: string, root: string) =>
    svc.write(path, content, root)
  )
}
