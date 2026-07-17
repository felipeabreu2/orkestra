import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, type Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseRoleSidecar, type RoleSidecar } from '../../shared/roleSidecar'
import {
  dedupeDiscoveredRoles,
  parseImportedRoles,
  serializeImportedRoles,
  resolveImportedPrompt
} from '../../shared/discoverRoles'

// T5 — camada de I/O da descoberta/importação de papéis. FINA de propósito: toda regra (dedupe,
// classificação contra presets, parse do registro) mora em src/shared/discoverRoles.ts, testada em
// isolamento. Aqui só: onde os arquivos ficam, os TETOS da varredura e a degradação em falha de I/O.
//
// Tudo vive em ~/.orkestra — NUNCA dentro do repositório do usuário (mesma decisão do sidecar T3a:
// `.orkestra` não está no .gitignore de ninguém e o app não suja working tree alheio).

// Teto de subdiretórios varridos. ~/.orkestra/agents/ ganha UM subdir por nó de terminal que já
// nasceu com papel, e acumula (nada apaga os órfãos hoje) — num uso pesado de meses são dezenas.
// 200 cobre isso com folga e ainda assim limita a varredura a ~200 statSync+readFileSync (poucos ms)
// no pior caso, mesmo se o diretório for poluído por outra ferramenta.
export const MAX_SCAN_DIRS = 200

// Teto por arquivo. O sidecar real tem ~1 KB (o maior prompt de preset não passa de 400 bytes) e o
// papel aceito no spawn já é cortado em 4000 chars (MAX_ROLE_LEN). 64 KB é ordens de grandeza acima
// do legítimo: serve só para não carregar na memória um arquivo enorme que caiu ali por engano.
export const MAX_SIDECAR_BYTES = 64 * 1024

// Teto do registro de importados — o arquivo inteiro é um array de papéis; 256 KB comporta centenas.
const MAX_REGISTRY_BYTES = 256 * 1024

export function agentsDir(): string {
  return join(homedir(), '.orkestra', 'agents')
}

export function rolesFile(): string {
  return join(homedir(), '.orkestra', 'roles.json')
}

// Varredura LIMITADA (plano T5) dos sidecars: profundidade FIXA de 1 nível — o layout é
// ~/.orkestra/agents/<nodeId>/role.json e nada mais, então não há glob nem recursão que possa
// descer numa árvore grande. Qualquer falha de I/O (diretório ausente, permissão, arquivo que
// sumiu no meio da varredura) degrada para "esse não conta"; a descoberta nunca lança.
export function scanRoleSidecars(dir: string = agentsDir()): RoleSidecar[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const found: (RoleSidecar | null)[] = []
  let scanned = 0
  // Ordem estável (readdir não garante ordenação entre plataformas): dedupeDiscoveredRoles prefere
  // o PRIMEIRO de cada nome, então sem isto a versão vencedora de um papel duplicado dançaria.
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue
    if (scanned >= MAX_SCAN_DIRS) break
    scanned++
    const file = join(dir, entry.name, 'role.json')
    try {
      const st = statSync(file)
      if (!st.isFile() || st.size > MAX_SIDECAR_BYTES) continue
      found.push(parseRoleSidecar(readFileSync(file, 'utf-8')))
    } catch {
      // sem sidecar nesse agente (o normal para terminal sem papel) ou I/O falhou — segue.
    }
  }
  return dedupeDiscoveredRoles(found)
}

// Registro dos papéis IMPORTADOS pelo usuário (~/.orkestra/roles.json). É o que dá efeito real à
// importação: o spawn consulta este arquivo para resolver o prompt de um papel que não é preset.
export function readImportedRoles(file: string = rolesFile()): RoleSidecar[] {
  try {
    const st = statSync(file)
    if (!st.isFile() || st.size > MAX_REGISTRY_BYTES) return []
    return parseImportedRoles(readFileSync(file, 'utf-8'))
  } catch {
    return []
  }
}

// Best-effort, como o sidecar: uma falha de escrita não pode derrubar o IPC/o spawn de ninguém.
export function writeImportedRoles(roles: readonly RoleSidecar[], file: string = rolesFile()): void {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, serializeImportedRoles(roles), 'utf-8')
  } catch {
    // degradação amigável — o usuário reimporta; nada mais no app depende desta escrita.
  }
}

// Prompt de um papel importado, pelo nome (case-insensitive). Chamado no spawn quando o papel não é
// preset: '' significa "não conheço" e o agente nasce sem ORKESTRA_ROLE, como qualquer papel livre.
export function importedPromptFor(role: string, file: string = rolesFile()): string {
  return resolveImportedPrompt(readImportedRoles(file), role)
}
