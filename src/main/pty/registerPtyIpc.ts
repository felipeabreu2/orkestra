import type { IpcMain, WebContents } from 'electron'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PtyManager } from './PtyManager'
import { isValidSshHost } from '../../shared/ssh'
import { buildRolePrompt } from '../../shared/rolePrompt'
import {
  buildRoleSidecar,
  serializeRoleSidecar,
  parseRoleSidecar,
  sidecarMatchesRole,
  isSafeNodeId,
  type RoleSidecar
} from '../../shared/roleSidecar'
import { importedPromptFor } from '../roles/roleRegistry'
import { PtyDataBatcher } from './PtyDataBatcher'

// Tamanho máximo do papel aceito do renderer — string livre, cortada defensivamente antes de
// virar prompt. Evita payloads gigantes; não é caminho de shell.
const MAX_ROLE_LEN = 4000

// T3a — grava o sidecar `role.json` do agente em ~/.orkestra/agents/<nodeId>/.
//
// FORA do repositório do usuário, de propósito: o app não suja o working tree de ninguém
// (`.orkestra` nunca esteve no .gitignore, e a primeira versão de T2 chegou a deixar um CLAUDE.md
// untracked em repos reais). Custo aceito: o papel não viaja junto com um checkout da branch.
//
// O sidecar é PORTABILIDADE/METADADO do papel, NÃO o mecanismo de injeção — quem entrega o papel ao
// agente é ORKESTRA_ROLE no env + o wrapper `claude` (--append-system-prompt). Escrever aqui não
// pode, portanto, afetar o terminal: qualquer falha de I/O (permissão, disco cheio, `agents` não
// sendo um diretório) é engolida e o pty nasce igual. Só no spawn NOVO — re-attach (pty:attach) não
// passa por aqui.
//
// T5: `prompt` é o prompt EFETIVO deste spawn (o mesmo que foi para ORKESTRA_ROLE), não
// necessariamente o de buildRoleSidecar — um papel IMPORTADO não é preset, então seu prompt vem do
// registro ~/.orkestra/roles.json. Sem isso o sidecar de um agente importado nasceria com prompt
// vazio e a descoberta (que só oferece papéis COM prompt) nunca reencontraria o papel. Para preset e
// papel livre o valor é idêntico ao de buildRoleSidecar — a generalização não muda nada neles.
//
// T4b: o `prompt` recebido aqui já é o EFETIVO deste spawn (ver a precedência no handler pty:spawn) —
// e a escrita deixou de ser cega. Se o sidecar em disco pertence ao papel ATUAL do nó e tem prompt,
// ele É o refino do agente (`orq role write`) e é PRESERVADO: sobrescrevê-lo com o prompt derivado do
// papel destruía o refino a cada arranque, silenciosamente. name/color continuam vindo de
// buildRoleSidecar (metadado do papel, pode evoluir com o preset); só o texto é do agente.
function roleSidecarPath(nodeId: string): string {
  return join(homedir(), '.orkestra', 'agents', nodeId, 'role.json')
}

// Lê o sidecar do nó. Best-effort e defensivo dos dois lados: isSafeNodeId (o nodeId vem por IPC e é
// componente de caminho — anti traversal) e parseRoleSidecar (o arquivo é editável à mão; lixo em
// disco vira null, nunca exceção). Ausente/ilegível/corrompido → null, e o chamador segue como antes.
function readRoleSidecar(nodeId: string | undefined): RoleSidecar | null {
  if (!isSafeNodeId(nodeId)) return null
  try {
    return parseRoleSidecar(readFileSync(roleSidecarPath(nodeId as string), 'utf-8'))
  } catch {
    return null
  }
}

function writeRoleSidecar(
  nodeId: string | undefined,
  role: string,
  prompt: string,
  existing: RoleSidecar | null
): void {
  // isSafeNodeId fecha path traversal: o nodeId vem por IPC e é componente de caminho.
  if (!isSafeNodeId(nodeId)) return
  const base = buildRoleSidecar(role)
  if (!base) return
  // Preserva o refino quando o sidecar é do papel atual; regenera quando não existe, quando o `name`
  // diverge (papel trocado) ou quando o arquivo não parseou (existing === null).
  const keep = sidecarMatchesRole(existing, role) && (existing as RoleSidecar).prompt
  const sidecar = { ...base, prompt: keep || prompt }
  try {
    const dir = join(homedir(), '.orkestra', 'agents', nodeId as string)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'role.json'), serializeRoleSidecar(sidecar), 'utf-8')
  } catch {
    // degradação amigável — o papel já viaja pelo env; o sidecar é um extra.
  }
}

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
    // T2 (injeção de papel): papel do agente (string livre) — vira ORKESTRA_ROLE no env do pty,
    // que o wrapper `claude` injeta no --append-system-prompt. Entra por allowlist.
    // `preset` (claude/codex/gemini/shell) continua aceito por compatibilidade com o renderer, mas
    // não é mais lido aqui: o papel é preset-agnóstico no env e quem decide usá-lo é o wrapper.
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
    // T2 allowlist: role vem por destructure validado (nunca `{ ...o }`). É string livre → valida
    // tipo e corta o tamanho antes de virar prompt.
    const role = typeof o.role === 'string' ? o.role.slice(0, MAX_ROLE_LEN) : ''
    // REGRA INEGOCIÁVEL: o cwd do pty é a RAIZ DO PROJETO. Sempre. A primeira versão de T2 gravava
    // CLAUDE.md em `<projeto>/.orkestra/agents/<nodeId>/` e apontava o cwd pra lá — como o Claude
    // Code limita o acesso a arquivos ao cwd, todo agente COM PAPEL nascia cego (via só o próprio
    // CLAUDE.md, não o código do usuário). O papel agora viaja por ORKESTRA_ROLE no env, e o
    // wrapper `claude` (installOrq) o injeta no --append-system-prompt junto do onboarding — o
    // mesmo caminho que o projeto já usa e confia. Nada de I/O no spawn.
    const cwd = o.cwd ?? getProjectCwd?.()
    // Prompt do papel (vazio quando não há papel / papel livre sem prompt → nada a injetar).
    // T5: se o papel não é preset, ainda pode ser um papel IMPORTADO pelo usuário ("Descobrir
    // Responsabilidades") — aí o prompt vem do registro ~/.orkestra/roles.json. Preset vence sempre
    // (buildRolePrompt primeiro): o registro nunca sequestra "Dev"/"Revisor". Leitura best-effort,
    // já degradada para '' dentro de importedPromptFor — nenhum I/O aqui pode derrubar um spawn.
    //
    // T4b: ANTES de tudo isso vem o sidecar, quando ele é do papel ATUAL do nó — aí o `prompt` dele é
    // o texto que o próprio agente refinou (`orq role write`) e é ELE que deve arrancar. Sem esta
    // precedência o refino nunca chegava ao agente e ainda era apagado no spawn seguinte. Casar por
    // `name` mantém a troca de papel soberana: sidecar de outro papel não casa → regenera do papel
    // novo. Leitura best-effort (ver readRoleSidecar): sidecar ausente/corrompido → cadeia de sempre.
    const existingSidecar = readRoleSidecar(nodeId)
    const refined = sidecarMatchesRole(existingSidecar, role) ? existingSidecar!.prompt : ''
    const rolePrompt = refined || buildRolePrompt(role) || importedPromptFor(role)
    // T3a: sidecar do papel em ~/.orkestra/agents/<nodeId>/role.json — metadado/portabilidade,
    // best-effort, fora do repo do usuário e SEM tocar no cwd acima (ver writeRoleSidecar).
    writeRoleSidecar(nodeId, role, rolePrompt, existingSidecar)
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
    // ORKESTRA_ROLE: prompt do papel deste agente — lido pelo wrapper `claude` (installOrq) e
    // concatenado ao onboarding no --append-system-prompt de TODA invocação do claude neste
    // terminal (inclusive se o usuário fechar e reabrir o claude na mão). Preset-agnóstico de
    // propósito: quem decide consumi-lo é o wrapper, então um terminal `shell` cujo nó tem papel
    // também o injeta se o usuário rodar `claude` ali.
    // Sempre define as três chaves — `undefined` instrui o PtyManager a APAGAR um valor herdado de
    // process.env (dev aninhado: app iniciado de dentro de um terminal do Orkestra), evitando que
    // um pty sem projeto/nó/papel herde a etiqueta (ou o papel) de outro.
    const env = {
      ...baseEnv,
      ORKESTRA_NODE_ID: nodeId || undefined,
      ORKESTRA_PROJECT_ID: projectId || undefined,
      ORKESTRA_ROLE: rolePrompt || undefined
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
