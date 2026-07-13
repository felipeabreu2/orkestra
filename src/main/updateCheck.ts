// Lógica pura da checagem de atualização (Fase 12, revisão pós-1.0). Fica isolada de `electron`
// para ser testável no ambiente `node` do Vitest — o updater.ts é quem faz o I/O (fetch/dialog/shell).

// Extrai [major, minor, patch] de uma string de versão, tolerando o prefixo "v" e sufixos de
// pré-lançamento (ex.: "v1.2.3", "1.2.3-beta.1"). Componentes ausentes viram 0.
export function parseVersion(v: string): [number, number, number] {
  const core = v.trim().replace(/^v/i, '').split(/[-+]/)[0] // descarta "-beta"/"+build"
  const parts = core.split('.').map((n) => {
    const p = parseInt(n, 10)
    return Number.isFinite(p) ? p : 0
  })
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

// true quando `remote` é estritamente maior que `local` (compara major, depois minor, depois patch).
// Empate ou local mais novo → false (não oferece "atualização" para uma versão igual/antiga).
export function isNewerVersion(local: string, remote: string): boolean {
  const a = parseVersion(local)
  const b = parseVersion(remote)
  for (let i = 0; i < 3; i++) {
    if (b[i] > a[i]) return true
    if (b[i] < a[i]) return false
  }
  return false
}
