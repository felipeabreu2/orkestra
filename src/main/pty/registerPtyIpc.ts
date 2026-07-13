import type { IpcMain, WebContents } from 'electron'
import type { PtyManager } from './PtyManager'
import { isValidSshHost } from '../../shared/ssh'

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
    // Fase 27 (Task 2): destino SSH opcional — validado aqui dentro (isValidSshHost) e só então
    // mapeado para file:'ssh', args:[host]. Nunca repassado cru; ver comentário no handler.
    sshHost?: string
  }
  ipcMain.handle('pty:spawn', async (_e, opts: SpawnOpts) => {
    // async: garante que um throw síncrono (ex.: sshHost inválido) vire uma Promise rejeitada —
    // é isso que o ipcRenderer.invoke() do renderer recebe como rejeição (ver TerminalNode.catch).
    const o = opts ?? {}
    // Segurança: allowlist explícito dos campos aceitos do renderer via destructure — NUNCA
    // espalhar o payload bruto (`{ ...o }`) aqui. PtyManager.spawn honra file/args (Fase 27
    // Task 1, base p/ SSH remoto); um renderer comprometido poderia repassar
    // `{ file: '/bin/sh', args: [...] }` e conseguir RCE se esses campos vazassem sem filtro.
    // file/args só entram nesta lista quando forem validados aqui dentro (ex.: sshHost via
    // isValidSshHost, Fase 27 Task 2) — nunca repassados crus do IPC.
    const { cols, rows, nodeId, initialCommand, sshHost } = o
    const cwd = o.cwd ?? getProjectCwd?.()
    // sshHost, quando presente, é validado aqui (no main) e só então mapeado para file/args —
    // o renderer nunca fornece file/args diretamente (allowlist acima), então este é o ÚNICO
    // caminho pelo qual um binário diferente do shell padrão pode ser spawnado.
    let sshFields: { file?: string; args?: string[] } = {}
    if (sshHost !== undefined) {
      if (!isValidSshHost(sshHost)) {
        throw new Error('Destino SSH inválido')
      }
      sshFields = { file: 'ssh', args: [sshHost.trim()] }
    }
    const id = ptyManager.spawn({ cols, rows, nodeId, initialCommand, ...sshFields, cwd, env: getEnv() })
    ptyManager.onData(id, (data) => getSender()?.send('pty:data', id, data))
    onSpawn(id)
    return id
  })
  ipcMain.on('pty:write', (_e, id: string, data: string) => ptyManager.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => ptyManager.resize(id, cols, rows))
  ipcMain.on('pty:kill', (_e, id: string) => ptyManager.kill(id))
  // Fase 31: re-attach — o TerminalNode, ao montar, pergunta se este nó já tem um pty vivo (que
  // sobreviveu a uma troca de projeto). Se sim, devolve o ptyId + o scrollback p/ restaurar o
  // xterm; senão null (o renderer faz spawn normal). O stream 'pty:data' já foi assinado no
  // spawn original com getSender() dinâmico, então volta a chegar sem precisar re-assinar aqui.
  ipcMain.handle('pty:attach', (_e, nodeId: string) => {
    const ptyId = ptyManager.ptyIdForNode(nodeId)
    if (!ptyId) return null
    return { ptyId, buffer: ptyManager.getBuffer(ptyId) }
  })
  // Fase 31: mata o pty de um nó (ao remover o terminal do canvas). Diferente de pty:kill (por
  // ptyId) — o × do TerminalFlowNode chama por nodeId, robusto mesmo sem o registry do renderer.
  ipcMain.on('pty:killForNode', (_e, nodeId: string) => ptyManager.killByNode(nodeId))
}
