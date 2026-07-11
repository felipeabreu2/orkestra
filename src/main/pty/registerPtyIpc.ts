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
  // Fase 17 (Task 1): resolver late-bound do cwd do projeto ATIVO (ProjectManager.getActive()?.cwd
  // em produção) — chamado a cada pty:spawn, nunca cacheado, então trocar de projeto muda a pasta
  // dos PRÓXIMOS terminais sem afetar os já abertos. Parâmetro opcional/appended por
  // retrocompatibilidade; sem ele (ou sem cwd ativo), o fallback de HOME em PtyManager.spawn segue valendo.
  getProjectCwd?: () => string | undefined
): void {
  type SpawnOpts = {
    cwd?: string
    cols?: number
    rows?: number
    nodeId?: string
    initialCommand?: string
  }
  ipcMain.handle('pty:spawn', (_e, opts: SpawnOpts) => {
    const o = opts ?? {}
    const cwd = o.cwd ?? getProjectCwd?.()
    const id = ptyManager.spawn({ ...o, cwd, env: getEnv() })
    ptyManager.onData(id, (data) => getSender()?.send('pty:data', id, data))
    onSpawn(id)
    return id
  })
  ipcMain.on('pty:write', (_e, id: string, data: string) => ptyManager.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => ptyManager.resize(id, cols, rows))
  ipcMain.on('pty:kill', (_e, id: string) => ptyManager.kill(id))
}
