// Último segmento não-vazio de um caminho (POSIX "/a/b/" e Windows "C:\\a\\b\\"). Extraído da
// ProjectsSidebar (Fase 17) para reuso na Topbar (rótulo do workspace) — DRY.
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}
