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
export function buildEnvPath(
  binDir: string,
  currentPath: string,
  platform: NodeJS.Platform,
  home: string
): { path: string; realPath: string } {
  const sep = platform === 'win32' ? ';' : ':'
  const extra =
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
  const present = new Set(currentPath.split(sep).filter(Boolean))
  const missing = extra.filter((d) => !present.has(d))
  const realPath = [currentPath, ...missing].filter(Boolean).join(sep)
  const path = [binDir, realPath].filter(Boolean).join(sep)
  return { path, realPath }
}
