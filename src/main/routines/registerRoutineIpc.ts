import type { IpcMain } from 'electron'
import type { RoutineScheduler } from './RoutineScheduler'
import type { Routine } from '../../shared/routines'

export function registerRoutineIpc(ipcMain: IpcMain, scheduler: RoutineScheduler): void {
  ipcMain.handle('routine:list', () => scheduler.list())
  ipcMain.handle('routine:add', (_e, payload: Omit<Routine, 'id'>) => scheduler.add(payload))
  ipcMain.handle('routine:remove', (_e, id: string) => {
    scheduler.remove(id)
    return true
  })
  ipcMain.handle('routine:toggle', (_e, id: string, enabled: boolean) => {
    scheduler.setEnabled(id, enabled)
    return true
  })
}
