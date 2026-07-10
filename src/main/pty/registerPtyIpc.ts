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
  onSpawn: (ptyId: string) => void = () => {}
): void {
  ipcMain.handle('pty:spawn', (_e, opts: { cwd?: string; cols?: number; rows?: number; nodeId?: string }) => {
    const id = ptyManager.spawn({ ...(opts ?? {}), env: getEnv() })
    ptyManager.onData(id, (data) => getSender()?.send('pty:data', id, data))
    onSpawn(id)
    return id
  })
  ipcMain.on('pty:write', (_e, id: string, data: string) => ptyManager.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => ptyManager.resize(id, cols, rows))
  ipcMain.on('pty:kill', (_e, id: string) => ptyManager.kill(id))
}
