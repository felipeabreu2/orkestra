import { isValidSshHost } from './ssh'

// Diretório fixo (LITERAL, nunca vindo do usuário) onde os arquivos arrastados para um terminal
// SSH aterrissam no host remoto — espelha o `/tmp/maestri-drops` do Maestri. Constante do módulo
// para não abrir nenhum vetor de input controlar o caminho remoto (só o basename é derivado, e
// mesmo esse é sanitizado abaixo).
export const REMOTE_DROP_DIR = '/tmp/orkestra-drops'

// Basename puro (sem depender de node:path — este módulo é compartilhado e precisa ficar livre de
// APIs de plataforma). Corta em '/' e '\' para cobrir caminhos POSIX e Windows.
function baseName(p: string): string {
  const parts = p.split(/[/\\]/)
  return parts[parts.length - 1] ?? ''
}

/**
 * Sanitiza o nome de arquivo que virará o SEGMENTO FINAL do destino remoto do `scp`
 * (`host:REMOTE_DROP_DIR/<nome>`). Esse destino é expandido pelo SHELL do servidor remoto, então
 * aspas locais não protegem o outro lado — a defesa é reduzir o nome a `[A-Za-z0-9._-]` (todo o
 * resto — espaço, `;`, `$`, backtick, `(`, `~`, `/`, etc. — vira `_`). Recusa nome vazio ou
 * composto só de pontos (evita virar `.`/`..`/caminho). Gêmeo, no lado do `scp`, do
 * isValidSshHost no lado do host.
 */
export function safeRemoteName(name: string): string {
  const sanitized = name.replace(/[^A-Za-z0-9._-]/g, '_')
  if (sanitized.length === 0 || /^\.+$/.test(sanitized)) {
    throw new Error('Nome de arquivo remoto inválido')
  }
  return sanitized
}

/**
 * Constrói os argumentos (como ARRAYS, prontos para spawn sem shell) do drop de arquivo via `scp`
 * para um host remoto. Dois vetores de segurança, cada um com sua defesa:
 *  1. o HOST (arg[0] de mkdir/scp) — revalidado por `isValidSshHost` (mesma barra do transporte;
 *     o `-` inicial e todo metacaractere já são barrados). Lança se inválido, ANTES de qualquer arg.
 *  2. o NOME do arquivo remoto — sanitizado por `safeRemoteName` (expandido pelo shell remoto).
 * O `remoteDir` é uma constante fixa (REMOTE_DROP_DIR por default), NUNCA input do usuário.
 * O `localPath` (source do scp) é passado cru — é o arquivo real do usuário e, como vai num array
 * sem shell, não sofre interpretação; usamos apenas o seu basename para derivar o nome remoto.
 */
export function buildScpDrop({
  localPath,
  host,
  remoteDir = REMOTE_DROP_DIR
}: {
  localPath: string
  host: string
  remoteDir?: string
}): { mkdirArgs: string[]; scpArgs: string[]; remotePath: string } {
  if (!isValidSshHost(host)) {
    throw new Error('Destino SSH inválido')
  }
  const h = host.trim()
  const remoteName = safeRemoteName(baseName(localPath))
  const remotePath = `${remoteDir}/${remoteName}`
  return {
    // `mkdir -p` é idempotente e garante o diretório de drops no remoto antes do scp.
    mkdirArgs: [h, 'mkdir', '-p', remoteDir],
    // scp SOURCE (local, cru) -> DEST (host:remoteDir/nomeSeguro).
    scpArgs: [localPath, `${h}:${remotePath}`],
    remotePath
  }
}
