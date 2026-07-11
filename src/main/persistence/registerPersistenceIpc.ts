import type { IpcMain } from 'electron'
import type { CanvasSnapshot } from '../../shared/canvasSnapshot'

// Shape "legado": CanvasPersistence (um único canvas.json fixo) ou qualquer objeto {load,save}.
export interface CanvasStore {
  load(): CanvasSnapshot | null
  save(snapshot: CanvasSnapshot): void
}

// Shape do ProjectManager (Fase 15 Task 2): persistência sempre relativa ao projeto ATIVO.
export interface ActiveProjectStore {
  loadActiveCanvas(): CanvasSnapshot | null
  saveActiveCanvas(snapshot: CanvasSnapshot): void
}

export type PersistenceTarget = CanvasStore | ActiveProjectStore

function isActiveProjectStore(target: PersistenceTarget): target is ActiveProjectStore {
  return typeof (target as ActiveProjectStore).loadActiveCanvas === 'function'
}

// Fase 15 (Task 2): aceita tanto o ProjectManager (delega ao projeto ativo) quanto o shape antigo
// {load,save} (CanvasPersistence ou um fake de teste) — detectado por duck-typing, então nenhum
// chamador existente (main/index.ts anterior, testes com {load,save}) precisa mudar.
export function registerPersistenceIpc(ipcMain: IpcMain, target: PersistenceTarget): void {
  const load = (): CanvasSnapshot | null =>
    isActiveProjectStore(target) ? target.loadActiveCanvas() : target.load()
  const save = (snapshot: CanvasSnapshot): void =>
    isActiveProjectStore(target) ? target.saveActiveCanvas(snapshot) : target.save(snapshot)

  ipcMain.handle('persistence:load', () => load())
  ipcMain.on('persistence:save', (_e, snapshot: CanvasSnapshot) => save(snapshot))
}
