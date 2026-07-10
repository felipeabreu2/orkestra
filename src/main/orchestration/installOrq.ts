import { mkdirSync, copyFileSync, chmodSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Copia o orq compilado (out/orq/bin.js) para ~/.orkestra/bin/orq e o torna executável.
// Retorna o diretório bin, para ser prefixado no PATH dos terminais spawnados.
export function installOrq(compiledBinPath: string): string {
  const binDir = join(homedir(), '.orkestra', 'bin')
  mkdirSync(binDir, { recursive: true })
  const dest = join(binDir, 'orq')
  copyFileSync(compiledBinPath, dest)
  chmodSync(dest, 0o755)
  return binDir
}
