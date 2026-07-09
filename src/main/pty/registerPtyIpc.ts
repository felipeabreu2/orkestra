import type { IpcMain, WebContents } from 'electron'
import type { PtyManager } from './PtyManager'

export function registerPtyIpc(
  ipcMain: IpcMain,
  ptyManager: PtyManager,
  getSender: () => WebContents | null
): void {
  ipcMain.handle('pty:spawn', (_e, opts: { cwd?: string; cols?: number; rows?: number }) => {
    const id = ptyManager.spawn(opts ?? {})
    ptyManager.onData(id, (data) => getSender()?.send('pty:data', id, data))
    return id
  })
  ipcMain.on('pty:write', (_e, id: string, data: string) => ptyManager.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => ptyManager.resize(id, cols, rows))
  ipcMain.on('pty:kill', (_e, id: string) => ptyManager.kill(id))
}
