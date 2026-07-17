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
 * Valida o CAMINHO LOCAL (source do `scp`). Gêmeo, no lado do arquivo, do `isValidSshHost` do lado
 * do host: o `scp` faz getopt no primeiro argumento posicional, então um caminho começando com `-`
 * não é lido como caminho e sim como OPÇÃO — e `-oProxyCommand=...` executa um comando na máquina
 * LOCAL. Não passar por shell não protege disso (é o próprio scp que reinterpreta o argv).
 *
 * A regra é exigir caminho ABSOLUTO (`/...`), o que de uma vez: (a) barra o `-` inicial (vetor de
 * option injection), (b) barra vazio/só-espaço, (c) barra relativo — inclusive `..`, `./x` e `~/x`
 * (til só é expandido por shell; aqui viraria um diretório literal). É o que a UI já produz
 * (webUtils.getPathForFile devolve caminho absoluto), então o caso feliz não muda.
 */
function assertSafeLocalPath(localPath: string): void {
  if (typeof localPath !== 'string' || !localPath.startsWith('/')) {
    throw new Error('Caminho local inválido')
  }
}

/**
 * Constrói os argumentos (como ARRAYS, prontos para spawn sem shell) do drop de arquivo via `scp`
 * para um host remoto. Três vetores de segurança, cada um com sua defesa:
 *  1. o HOST (arg[0] de mkdir/scp) — revalidado por `isValidSshHost` (mesma barra do transporte;
 *     o `-` inicial e todo metacaractere já são barrados). Lança se inválido, ANTES de qualquer arg.
 *  2. o CAMINHO LOCAL (source do scp) — `assertSafeLocalPath` exige absoluto, barrando o `-` inicial
 *     (option injection no getopt do scp). Redundante com o `--` abaixo, de propósito.
 *  3. o NOME do arquivo remoto — sanitizado por `safeRemoteName` (expandido pelo shell remoto).
 * O `remoteDir` é uma constante fixa (REMOTE_DROP_DIR por default), NUNCA input do usuário.
 * Validado o caminho, o `localPath` vai cru para o argv (é o arquivo real do usuário e, indo em
 * array sem shell, não sofre interpretação); só o seu basename deriva o nome remoto.
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
  assertSafeLocalPath(localPath)
  const h = host.trim()
  const remoteName = safeRemoteName(baseName(localPath))
  const remotePath = `${remoteDir}/${remoteName}`
  return {
    // `mkdir -p` é idempotente e garante o diretório de drops no remoto antes do scp.
    mkdirArgs: [h, 'mkdir', '-p', remoteDir],
    // scp -- SOURCE (local, validado) -> DEST (host:remoteDir/nomeSeguro).
    // O `--` é cinto-e-suspensório do assertSafeLocalPath: encerra o getopt do scp, então mesmo que
    // um dia a validação afrouxe, nenhum posicional pode voltar a ser lido como opção.
    scpArgs: ['--', localPath, `${h}:${remotePath}`],
    remotePath
  }
}
