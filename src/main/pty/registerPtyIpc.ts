import type { IpcMain, WebContents } from 'electron'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { PtyManager } from './PtyManager'
import { isValidSshHost } from '../../shared/ssh'
import { planRoleInjection } from '../../shared/roleInjection'
import { PtyDataBatcher } from './PtyDataBatcher'

// Tamanho máximo do papel aceito do renderer — string livre, cortada defensivamente antes de
// virar conteúdo de arquivo. Evita payloads gigantes; não é caminho de shell.
const MAX_ROLE_LEN = 4000
// nodeId é usado como COMPONENTE DE CAMINHO do subdir de contexto. Vem por IPC, então validamos o
// formato (react-flow gera `terminal-<uuid>`) para fechar path traversal (`../`). Papel/preset
// NUNCA entram no caminho — só o nodeId validado.
const SAFE_NODE_ID = /^[A-Za-z0-9_-]+$/

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
  getProjectCwd?: () => string | undefined,
  // Escopo de projeto (auditoria 2026-07-14): id do projeto ATIVO no momento do spawn — vira
  // ORKESTRA_PROJECT_ID no env do pty, e o orq o envia em toda request (x-orkestra-project) para
  // o servidor rejeitar comandos de agentes cujo projeto não está mais ativo (os ptys sobrevivem
  // à troca de projeto). Late-bound como getProjectCwd; opcional por retrocompatibilidade.
  getProjectId?: () => string | undefined
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
    // T2 (injeção de papel): preset do agente (claude/codex/gemini/shell) e papel (string livre)
    // — usados para decidir o arquivo de contexto (planRoleInjection). Entram por allowlist.
    preset?: string
    role?: string
  }
  // Otimização (Bloco 2a): um batcher compartilhado agrupa os chunks de output de todos os ptys e
  // faz flush em lote (~1 frame), cortando o volume de mensagens IPC pty:data.
  const batcher = new PtyDataBatcher((id, data) => getSender()?.send('pty:data', id, data))
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
    // T2 allowlist: preset/role vêm por destructure validado (nunca `{ ...o }`). role é string
    // livre → valida tipo e corta o tamanho. preset, quando ausente, cai no initialCommand (que
    // para agentes é o próprio id do preset: 'claude'/'codex'/'gemini'), mantendo a injeção
    // funcional mesmo enquanto o renderer ainda não propaga `preset` explicitamente.
    const role = typeof o.role === 'string' ? o.role.slice(0, MAX_ROLE_LEN) : ''
    const preset =
      typeof o.preset === 'string'
        ? o.preset
        : typeof initialCommand === 'string'
          ? initialCommand
          : undefined
    let cwd = o.cwd ?? getProjectCwd?.()
    // T2 (materialização, estratégia A): se o preset é um agente com arquivo de contexto e há
    // papel, grava CLAUDE.md/AGENTS.md num subdir isolado por nodeId e aponta o cwd do pty pra lá
    // (o CLI lê o papel no startup, sem gastar tokens). Só no spawn NOVO — re-attach (pty:attach)
    // não passa por aqui, então não reescreve (idempotência). Falha de I/O degrada para o cwd
    // original sem derrubar o terminal.
    if (cwd && nodeId && SAFE_NODE_ID.test(nodeId)) {
      const injection = planRoleInjection({ preset, role })
      if (injection.kind === 'file') {
        try {
          const dir = join(cwd, '.orkestra', 'agents', nodeId)
          mkdirSync(dir, { recursive: true })
          writeFileSync(join(dir, injection.filename), injection.content, 'utf8')
          cwd = dir
        } catch {
          // permissão/disco: mantém o cwd original e segue sem injeção (degradação amigável).
        }
      }
    }
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
    // ORKESTRA_NODE_ID: id do nó deste terminal no canvas — deixa o `orq` resolver "as notas
    // ligadas à MINHA saída" sem o agente precisar adivinhar (ex.: orq note write "...").
    // ORKESTRA_PROJECT_ID: projeto dono deste terminal (ver comentário em getProjectId acima).
    const baseEnv = getEnv()
    const projectId = getProjectId?.()
    // Sempre define as duas chaves — `undefined` instrui o PtyManager a APAGAR um valor herdado de
    // process.env (dev aninhado: app iniciado de dentro de um terminal do Orkestra), evitando que
    // um pty sem projeto/nó herde a etiqueta de outro projeto.
    const env = {
      ...baseEnv,
      ORKESTRA_NODE_ID: nodeId || undefined,
      ORKESTRA_PROJECT_ID: projectId || undefined
    }
    // Auto-início do agente: chama o wrapper do Orkestra pelo CAMINHO ABSOLUTO, não pelo nome. O
    // wrapper (~/.orkestra/bin/claude) injeta o onboarding, mas o `.zshrc` do usuário costuma
    // reordenar o PATH e mascará-lo com o binário real (ex.: prepende ~/.local/bin) — então não dá
    // pra confiar que "claude" resolva pro wrapper. O caminho absoluto ignora o PATH por completo.
    // BLD-1: no Windows o wrapper é um script `sh` (inexecutável lá) — cai no `claude` puro (sem
    // onboarding, mas funcional); o wrapper .cmd de Windows é um follow-up que precisa de máquina
    // Windows para validar. join() garante o separador de caminho correto por plataforma.
    const resolvedCommand =
      initialCommand === 'claude' && baseEnv.ORKESTRA_BIN && process.platform !== 'win32'
        ? join(baseEnv.ORKESTRA_BIN, 'claude')
        : initialCommand
    const id = ptyManager.spawn({
      cols,
      rows,
      nodeId,
      initialCommand: resolvedCommand,
      ...sshFields,
      cwd,
      env
    })
    ptyManager.onData(id, (data) => batcher.push(id, data))
    // No exit, flush imediato do pendente deste pty — não perder o final do output (ex.: o pty
    // morre em menos de um frame após o último chunk). Onda 2 (T1): além do flush, encaminha o
    // exit ao renderer pelo MESMO getSender() de pty:data — é o sinal que o TerminalNode assina
    // (pty.onExit no preload) para o badge SSH virar "caiu". Infra genérica (qualquer terminal),
    // não só SSH; o `e.exitCode` vem do PtyManager.onExit (multi-subscriber já existente).
    ptyManager.onExit(id, (e) => {
      batcher.flushOne(id)
      getSender()?.send('pty:exit', id, e.exitCode)
    })
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
