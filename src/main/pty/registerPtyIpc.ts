import type { IpcMain, WebContents } from 'electron'
import type { PtyManager } from './PtyManager'

export function registerPtyIpc(
  ipcMain: IpcMain,
  ptyManager: PtyManager,
  getSender: () => WebContents | null,
  // Env extra (ex.: ORKESTRA_PORT/TOKEN/PATH) a injetar em todo pty spawnado — hoje usado
  // pela orquestração para o `orq` enxergar o servidor local. Sem orquestração, default vazio.
  getEnv: () => Record<string, string> = () => ({}),
  // Hook chamado com o id logo após cada pty:spawn — hoje usado para agentBus.track(id), de
  // forma que registerPtyIpc não precise conhecer o AgentBus diretamente (Fase 6).
  onSpawn: (ptyId: string) => void = () => {},
  // Resolve floorId -> worktreePath (Fase 8). Injetado em vez de acoplar este módulo ao
  // FloorManager diretamente; opcional/retrocompatível — sem ele (ou sem opts.floorId), o
  // comportamento é idêntico ao pré-Fase 8 (usa opts.cwd).
  resolveCwd?: (floorId: string) => string | undefined
): void {
  type SpawnOpts = {
    cwd?: string
    cols?: number
    rows?: number
    nodeId?: string
    initialCommand?: string
    floorId?: string
  }
  ipcMain.handle('pty:spawn', (_e, opts: SpawnOpts) => {
    const o = opts ?? {}
    // O cwd do floor (quando resolve) vence o opts.cwd explícito; se o floor não resolver
    // (ex.: removido) ou não houver floorId, cai para opts.cwd normalmente.
    const cwd = o.floorId ? (resolveCwd?.(o.floorId) ?? o.cwd) : o.cwd
    const id = ptyManager.spawn({ ...o, cwd, env: getEnv() })
    ptyManager.onData(id, (data) => getSender()?.send('pty:data', id, data))
    onSpawn(id)
    return id
  })
  ipcMain.on('pty:write', (_e, id: string, data: string) => ptyManager.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => ptyManager.resize(id, cols, rows))
  ipcMain.on('pty:kill', (_e, id: string) => ptyManager.kill(id))
}
