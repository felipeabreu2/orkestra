import { roleMeta } from './roles'
import { buildRolePrompt } from './rolePrompt'

// Sidecar `role.json` (T3a) — PORTABILIDADE/METADADO do papel, NÃO o mecanismo de injeção. O papel
// continua chegando ao agente por ORKESTRA_ROLE no env do pty + wrapper `claude`
// (--append-system-prompt); o sidecar só registra, num arquivo legível, quem é aquele agente.
// Shape idêntico ao do Maestri (`name`/`color`/`prompt`) para interoperabilidade futura.
//
// Tudo aqui é PURO (sem fs/process): o I/O vive em quem chama (registerPtyIpc), então estas regras
// são testáveis em isolamento e não se reimplementam inline em cada call site.
export interface RoleSidecar {
  name: string
  color: string
  prompt: string
}

export function serializeRoleSidecar(sidecar: RoleSidecar): string {
  // Reconstrói o objeto chave a chave (em vez de serializar o argumento cru) para o arquivo nunca
  // ganhar campos extras que um chamador tenha anexado: o shape é o contrato com o Maestri.
  const { name, color, prompt } = sidecar
  return JSON.stringify({ name, color, prompt }, null, 2)
}

// Parse DEFENSIVO: o arquivo está fora do controle do app (o usuário/agente pode editá-lo à mão) e
// lixo em disco não pode virar exceção em quem lê. Qualquer coisa que não seja um sidecar completo
// e bem formado → null. Nunca lança.
export function parseRoleSidecar(json: unknown): RoleSidecar | null {
  if (typeof json !== 'string') return null
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const { name, color, prompt } = data as Record<string, unknown>
  if (typeof name !== 'string' || typeof color !== 'string' || typeof prompt !== 'string') return null
  return { name, color, prompt }
}

// Deriva o sidecar do papel do nó. name/color vêm de roleMeta e prompt de buildRolePrompt — as
// MESMAS fontes que alimentam o badge do canvas e o ORKESTRA_ROLE do env, para o arquivo nunca
// divergir do que o agente realmente recebeu. Sem papel → null (nada a gravar).
export function buildRoleSidecar(role: string): RoleSidecar | null {
  if (typeof role !== 'string' || !role.trim()) return null
  const { label, color } = roleMeta(role)
  // Papel livre não tem instrução → prompt vazio (mesma semântica de buildRolePrompt).
  return { name: label, color, prompt: buildRolePrompt(role) }
}

// T4b — o sidecar em disco pertence ao papel ATUAL do nó? É a pergunta que decide, no spawn, entre
// honrar um refino do agente (`orq role write`) e regenerar o prompt do papel.
//
// Casar por `name` é o que separa os dois casos: o refino persiste enquanto o papel for o mesmo, mas
// TROCAR o papel do nó (Command Palette / `orq reassign`) deixa o sidecar antigo com outro `name` —
// não casa, e o prompt volta a sair do papel novo. A troca de papel manda; o refino não cola no
// papel errado.
//
// Os DOIS lados passam por roleMeta para reusar a resolução canônica (id ou label, case-insensitive,
// trim): um sidecar com `name: "dev"` escrito à mão casa com o papel `Dev` do nó. Papel livre/
// importado (não-preset) casa pelo próprio nome, que é o que roleMeta devolve.
export function sidecarMatchesRole(sidecar: RoleSidecar | null, role: string): boolean {
  if (!sidecar) return false
  if (typeof role !== 'string' || !role.trim()) return false
  if (!sidecar.name.trim()) return false
  return roleMeta(sidecar.name).label === roleMeta(role).label
}

// nodeId vem por IPC e é usado como COMPONENTE DE CAMINHO do subdir do sidecar (~/.orkestra/agents/
// <nodeId>/) — validamos o formato (o canvas gera `terminal-<uuid>`) para fechar path traversal
// (`../`), caminho absoluto e separadores. Papel/preset NUNCA entram no caminho.
const SAFE_NODE_ID = /^[A-Za-z0-9_-]+$/

export function isSafeNodeId(nodeId: unknown): boolean {
  return typeof nodeId === 'string' && SAFE_NODE_ID.test(nodeId)
}
