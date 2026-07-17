import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// BLD-2 (auditoria 2026-07-14): num app EMPACOTADO lançado pelo Finder/Dock, process.env.PATH é o
// mínimo do launchd (/usr/bin:/bin:/usr/sbin:/sbin), SEM ~/.claude/local, ~/.local/bin,
// /opt/homebrew/bin etc. — então o wrapper `claude` (que busca o binário real via ORKESTRA_REAL_PATH)
// e o `orq` (que precisa de `node` no PATH) não os encontram, e o auto-início dos agentes morre só
// em produção. Augmenta o PATH com os diretórios comuns de instalação que FALTAM (nunca remove; em
// dev o PATH herdado do terminal já os tem, então é no-op). No Windows não injeta dirs POSIX.
//
// O separador é derivado do `platform` recebido (não do path.delimiter do host) para ser
// determinístico em teste — um host macOS testando o ramo win32 usaria ':' errado, senão.
//
// Retorna `path` (com o binDir do Orkestra À FRENTE, para os terminais spawnados) e `realPath`
// (SEM o binDir, para o wrapper achar o `claude` real sem chamar a si mesmo — ver installOrq).
//
// `extraDirs` são diretórios DESCOBERTOS com I/O fora daqui (ver resolveNvmBinDirs) e injetados —
// buildEnvPath continua PURA/determinística. Vêm à frente dos dirs fixos entre os ACRESCENTADOS,
// para o node do nvm ganhar de um node de sistema; o que já estava no PATH nunca é reordenado.
export function buildEnvPath(
  binDir: string,
  currentPath: string,
  platform: NodeJS.Platform,
  home: string,
  extraDirs: string[] = []
): { path: string; realPath: string } {
  const sep = platform === 'win32' ? ';' : ':'
  const fixed =
    platform === 'win32'
      ? []
      : [
          join(home, '.claude', 'local'),
          join(home, '.local', 'bin'),
          join(home, '.npm-global', 'bin'),
          join(home, '.bun', 'bin'),
          '/opt/homebrew/bin',
          '/usr/local/bin',
          '/usr/bin',
          '/bin'
        ]
  // extraDirs já vêm prontos pra plataforma (resolveNvmBinDirs é no-op no win32), então entram em
  // qualquer plataforma; só a lista POSIX fixa é que fica de fora no Windows.
  const extra = [...new Set([...extraDirs.filter(Boolean), ...fixed])]
  const present = new Set(currentPath.split(sep).filter(Boolean))
  const missing = extra.filter((d) => !present.has(d))
  const realPath = [currentPath, ...missing].filter(Boolean).join(sep)
  const path = [binDir, realPath].filter(Boolean).join(sep)
  return { path, realPath }
}

// Compara "v10.24.1" e "v9.11.2" NUMERICAMENTE — ordenar por string põe v9 acima de v10.
function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function parseVersion(v: string): number[] {
  return v
    .replace(/^v/, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
}

const VERSION_RE = /^v\d+\.\d+\.\d+$/

// Resolve um "spec" do nvm (v24.6.0 | node | 22 | lts/* | lts/jod | …) numa versão INSTALADA.
// Aliases encadeiam (default -> lts/* -> lts/jod -> v22.18.0), daí a recursão com guarda de ciclo.
// Devolve null se não resolver — o chamador cai pra versão mais alta instalada.
function resolveSpec(spec: string, installed: string[], nvmDir: string, seen: Set<string>): string | null {
  const s = spec.trim()
  if (!s || seen.has(s)) return null
  seen.add(s)
  const highest = (from: string[]): string | null => [...from].sort(compareVersions).pop() ?? null
  // "node"/"stable"/"latest" = a mais recente que o usuário tem instalada.
  if (s === 'node' || s === 'stable' || s === 'latest') return highest(installed)
  // Versão exata ou parcial ("22", "22.18", "v22.18.0"): a mais alta que casa com o prefixo.
  if (/^v?\d+(\.\d+)*$/.test(s)) {
    const want = parseVersion(s)
    const matches = installed.filter((v) => want.every((n, i) => parseVersion(v)[i] === n))
    return highest(matches)
  }
  // Qualquer outro nome é um arquivo de alias cujo conteúdo é o próximo spec da cadeia.
  try {
    return resolveSpec(readFileSync(join(nvmDir, 'alias', s), 'utf8'), installed, nvmDir, seen)
  } catch {
    return null
  }
}

// BLD-2b: o `orq` tem shebang `#!/usr/bin/env node`, então SEM `node` no PATH todo comando orq morre
// ("env: node: No such file or directory") — e com isso a orquestração inteira. Nenhum dos dirs fixos
// de buildEnvPath é do nvm, que é o gerenciador de node mais comum; num app empacotado (PATH mínimo do
// launchd) isso quebra 100% dos usuários de nvm, e só em produção. Aqui fica o I/O da descoberta, fora
// da função pura. Devolve no máximo UM bin (versão determinística) ou [] se não houver nvm — no-op.
export function resolveNvmBinDirs(
  env: NodeJS.ProcessEnv,
  home: string,
  platform: NodeJS.Platform
): string[] {
  if (platform === 'win32') return [] // nvm-windows tem outro layout; não injeta caminho POSIX
  const nvmDir = env.NVM_DIR?.trim() || join(home, '.nvm')
  const versionsDir = join(nvmDir, 'versions', 'node')
  let installed: string[]
  try {
    installed = readdirSync(versionsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && VERSION_RE.test(e.name))
      .map((e) => e.name)
  } catch {
    return [] // sem nvm (ou sem permissão): comportamento idêntico ao de antes
  }
  if (installed.length === 0) return []
  let target: string | null = null
  try {
    target = resolveSpec(readFileSync(join(nvmDir, 'alias', 'default'), 'utf8'), installed, nvmDir, new Set())
  } catch {
    // sem alias/default: cai pro fallback abaixo
  }
  // Fallback (sem default, alias quebrado, ou apontando pra versão não instalada): a mais alta.
  if (!target || !installed.includes(target)) target = [...installed].sort(compareVersions).pop() ?? null
  return target ? [join(versionsDir, target, 'bin')] : []
}
