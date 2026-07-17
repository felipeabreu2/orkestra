import { parseRoleSidecar, serializeRoleSidecar, type RoleSidecar } from './roleSidecar'
import type { Role } from './roles'

// T5 — "Descobrir Responsabilidades": lógica PURA (sem fs/process) da descoberta/importação de
// papéis a partir dos sidecars `role.json`. O I/O (varredura de ~/.orkestra/agents/*/role.json e o
// registro ~/.orkestra/roles.json) vive em src/main/roles/roleRegistry.ts — aqui só regras
// testáveis em isolamento.
//
// Fecha o ciclo de portabilidade: T3a GRAVA o sidecar de cada agente, T5 LÊ os sidecars, oferece os
// papéis que ainda não existem no app e os IMPORTA para um registro do usuário. O papel importado
// continua chegando ao agente por ORKESTRA_ROLE + wrapper `claude` (o sidecar nunca foi o mecanismo
// de injeção); o registro só ensina o main a resolver o PROMPT de um papel que não é preset.

export interface DiscoveredRole {
  sidecar: RoleSidecar
  // 'preset' = já existe em PRESET_ROLES (não pode ser importado, duplicaria); 'new' = importável.
  status: 'new' | 'preset'
}

// Payload do canal `roles:discover` — vive no shared porque é o contrato ENTRE main (quem varre o
// disco), preload (quem expõe o canal) e renderer (quem desenha a lista).
export interface DiscoverResult {
  discovered: DiscoveredRole[]
  // Papéis já no registro do usuário (~/.orkestra/roles.json) — a UI usa para não reoferecer.
  imported: RoleSidecar[]
}

// Chave de comparação de papel — a MESMA normalização de roleMeta (trim + lowercase), para
// "Auditor"/"auditor"/"  AUDITOR " serem sempre o mesmo papel em toda a cadeia.
function key(name: string): string {
  return name.trim().toLowerCase()
}

// Um sidecar só é IMPORTÁVEL se tem nome e prompt. O prompt vazio é o caso do papel LIVRE (ex.:
// "Arquiteto"): o spawn grava o sidecar dele (o nome é metadado útil para quem lê o disco), mas
// importá-lo não acrescentaria nada — roleMeta já resolve qualquer texto livre para label + cor
// neutra + prompt vazio, então o "papel importado" seria indistinguível de digitar o nome na
// paleta. Descoberta é sobre trazer CONFIGURAÇÃO (o prompt refinado por um agente via `orq role`
// ou por outra máquina), não nomes.
function isImportable(s: RoleSidecar): boolean {
  return s.name.trim().length > 0 && s.prompt.trim().length > 0
}

// Normaliza o resultado cru da varredura: descarta null (o que parseRoleSidecar recusou), descarta
// o que não é importável e deduplica por nome preferindo o PRIMEIRO (a varredura entrega os
// diretórios em ordem estável, então o resultado não dança entre execuções).
export function dedupeDiscoveredRoles(found: readonly (RoleSidecar | null)[]): RoleSidecar[] {
  const out: RoleSidecar[] = []
  const seen = new Set<string>()
  for (const s of found) {
    if (!s || !isImportable(s)) continue
    const k = key(s.name)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

// Classifica cada descoberto contra os presets do app (por id OU label, como roleMeta): quem já é
// preset vem marcado para a UI não oferecer uma importação que duplicaria um papel existente.
export function mergeIntoPresets(presets: readonly Role[], found: readonly RoleSidecar[]): DiscoveredRole[] {
  return found.map((sidecar) => {
    const k = key(sidecar.name)
    const clash = presets.some((p) => p.id.toLowerCase() === k || p.label.toLowerCase() === k)
    return { sidecar, status: clash ? 'preset' : 'new' }
  })
}

// Registro de importados (~/.orkestra/roles.json) = array do MESMO shape do sidecar. Parse
// defensivo em duas camadas: o arquivo pode ter sido editado à mão, e cada entrada passa pelo
// parseRoleSidecar (fonte única da validação de shape — não reimplementamos aqui). Nunca lança.
export function parseImportedRoles(json: unknown): RoleSidecar[] {
  if (typeof json !== 'string') return []
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  return dedupeDiscoveredRoles(data.map((entry) => parseRoleSidecar(JSON.stringify(entry))))
}

export function serializeImportedRoles(roles: readonly RoleSidecar[]): string {
  // Cada entrada passa pelo serializador do sidecar (fonte única do contrato de campos) e volta
  // como objeto para o array final: o arquivo nunca ganha campos extras que um chamador anexou.
  return JSON.stringify(
    roles.map((r) => JSON.parse(serializeRoleSidecar(r))),
    null,
    2
  )
}

// Aplica uma importação sobre o registro atual: nome já existente é ATUALIZADO no lugar (re-importar
// um papel refinado deve trazer o texto novo, não uma segunda cópia), nome novo entra no fim.
export function mergeImports(existing: readonly RoleSidecar[], chosen: readonly RoleSidecar[]): RoleSidecar[] {
  const out = existing.slice()
  for (const c of dedupeDiscoveredRoles(chosen)) {
    const i = out.findIndex((r) => key(r.name) === key(c.name))
    if (i >= 0) out[i] = c
    else out.push(c)
  }
  return out
}

// Resolve o prompt de um papel importado pelo nome (mesma normalização de roleMeta). É o que faz o
// papel importado VALER: o spawn usa isto quando buildRolePrompt não conhece o papel (não é preset).
// Papel desconhecido → '' (o agente nasce sem ORKESTRA_ROLE, como um papel livre qualquer).
export function resolveImportedPrompt(imported: readonly RoleSidecar[], role: string): string {
  if (typeof role !== 'string' || !role.trim()) return ''
  const k = key(role)
  return imported.find((r) => key(r.name) === k)?.prompt ?? ''
}
