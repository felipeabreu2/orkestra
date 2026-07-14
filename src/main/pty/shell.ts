// BLD-1 (auditoria 2026-07-14): shell padrão por PLATAFORMA. No Windows, process.env.SHELL é
// undefined — o antigo fallback '/bin/bash' não existe lá, então o spawn falhava e NENHUM terminal
// abria (a feature central do app, morta no artefato win/nsis publicado). ComSpec (normalmente
// cmd.exe) sempre existe no Windows; POSIX segue usando $SHELL com fallback /bin/bash.
export function defaultShell(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (platform === 'win32') return env.ComSpec ?? 'cmd.exe'
  return env.SHELL ?? '/bin/bash'
}
