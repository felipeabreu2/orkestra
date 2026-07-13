/** Envolve um caminho em aspas simples (seguro para espaços e unicode) para digitar no shell;
    aspas simples internas viram a sequência '\'' (fecha, escapa a aspa, reabre). */
export function quotePathForShell(p: string): string {
  return `'${p.replace(/'/g, "'\\''")}'`
}

/** Junta os caminhos de um drop num texto pronto para inserir no terminal, com um espaço no
    fim para separar do que o usuário digitar em seguida. Entradas vazias são ignoradas. */
export function pathsToTerminalInput(paths: string[]): string {
  const cleaned = paths.filter((p) => p.length > 0)
  if (cleaned.length === 0) return ''
  return cleaned.map(quotePathForShell).join(' ') + ' '
}
