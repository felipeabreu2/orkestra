import type { IpcMain } from 'electron'
import type { CanvasPersistence } from './CanvasPersistence'
import type { CanvasSnapshot } from '../../shared/canvasSnapshot'

export function registerPersistenceIpc(ipcMain: IpcMain, persistence: CanvasPersistence): void {
  ipcMain.handle('persistence:load', () => persistence.load())
  ipcMain.on('persistence:save', (_e, snapshot: CanvasSnapshot) => persistence.save(snapshot))
}
