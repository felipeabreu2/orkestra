import type { IpcMain } from 'electron'
import type { CanvasSnapshot } from '../../shared/canvasSnapshot'

// Shape "legado": CanvasPersistence (um único canvas.json fixo) ou qualquer objeto {load}.
export interface CanvasStore {
  load(): CanvasSnapshot | null
}

// Shape do ProjectManager (Fase 15 Task 2): persistência sempre relativa ao projeto ATIVO.
// getActive é opcional (fakes antigos de teste não o têm) — sem ele, o load devolve projectId
// null e o renderer simplesmente não liga o autosave por id (nunca salva "no lugar errado").
export interface ActiveProjectStore {
  loadActiveCanvas(): CanvasSnapshot | null
  getActive?(): { id: string } | undefined
}

export type PersistenceTarget = CanvasStore | ActiveProjectStore

// Resposta de persistence:load — snapshot + id do projeto dono, num único round-trip ATÔMICO.
// Fix de corrupção cross-project (2026-07-14): o renderer guarda o projectId recebido aqui
// (canvasStore.activeProjectId) e salva sempre por id explícito (projects:saveCanvas).
// INT-6 (auditoria 2026-07-14): o canal persistence:save FOI REMOVIDO — ele gravava "no projeto
// ativo do momento da escrita", exatamente o mecanismo que corrompeu 3 projetos. Já não tinha
// chamadores (o autosave é por id), então removê-lo elimina o vetor de vez, em vez de deixá-lo
// exposto a um `window.orkestra.persistence.save(...)` de reintroduzir o bug. Só persistence:load
// permanece.
export interface PersistenceLoadResult {
  projectId: string | null
  snapshot: CanvasSnapshot | null
}

function isActiveProjectStore(target: PersistenceTarget): target is ActiveProjectStore {
  return typeof (target as ActiveProjectStore).loadActiveCanvas === 'function'
}

// Fase 15 (Task 2): aceita tanto o ProjectManager (delega ao projeto ativo) quanto o shape antigo
// {load} (CanvasPersistence ou um fake de teste) — detectado por duck-typing.
export function registerPersistenceIpc(ipcMain: IpcMain, target: PersistenceTarget): void {
  const load = (): PersistenceLoadResult =>
    isActiveProjectStore(target)
      ? { projectId: target.getActive?.()?.id ?? null, snapshot: target.loadActiveCanvas() }
      : { projectId: null, snapshot: target.load() }

  ipcMain.handle('persistence:load', () => load())
}
