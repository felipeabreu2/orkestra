import { readdir, stat, open, rename, unlink } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve, sep } from 'node:path'
import type { FileEntry } from '../../shared/filetree'

const execFileAsync = promisify(execFile)

const MAX_READ_BYTES = 256 * 1024
const BINARY_SNIFF_BYTES = 8 * 1024

function compareEntries(a: FileEntry, b: FileEntry): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

// Guarda de caminho para `write` (Onda 2 · T4): só permite gravar DENTRO da raiz da árvore. Normaliza
// os dois lados com `resolve` (colapsa `..`/`.`/separadores redundantes), então compara o prefixo
// terminado em separador — assim `/r/a` casa mas `/r-outro` e `/r/../x` NÃO. Defesa em profundidade:
// o renderer é privilegiado (tem pty.spawn), então uma escrita com path envenenado (traversal fora da
// raiz) precisa ser barrada no MAIN, nunca só na UI. NB: comparação puramente lexical/pós-resolve —
// não resolve symlinks (isso, e o guard completo de mutação criar/mover/excluir, são Onda 3 · T13).
export function isInsideRoot(root: string, target: string): boolean {
  const nRoot = resolve(root)
  const nTarget = resolve(target)
  return nTarget === nRoot || nTarget.startsWith(nRoot + sep)
}

// Remove aspas C-style que `git status --porcelain` usa em paths com caracteres especiais (ex.:
// espaços incomuns, unicode). Decodificação best-effort — nunca lança, na dúvida devolve o texto
// como veio (melhor mostrar um path levemente errado do que quebrar o parse inteiro).
function cleanGitPath(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(.)/g, '$1')
  }
  return trimmed
}

// Fase 19 (Task 1): filesystem + git status para o nó de árvore de arquivos do canvas (renderer).
// list/read/gitStatus são só leitura; `write` (Onda 2 · T4) é a ÚNICA mutação — grava um arquivo de
// forma atômica e valida (isInsideRoot) que o caminho está sob a raiz da árvore antes de tocar o
// disco. Ainda NÃO muta o repo git (commit/branch) nem cria/renomeia/exclui (Onda 3). Cobre o que um
// file-explorer/editor de IDE padrão precisa. Erros de fs (dir/arquivo inexistente, sem permissão,
// escrita fora da raiz) propagam como rejeição da
// Promise — quem chama (registerFileTreeIpc) não os trata, e o invoke() do renderer os recebe
// como rejeição, que é onde de fato existe uma ação de recuperação (mostrar erro na árvore).
export class FileTreeService {
  // Lista o conteúdo direto de `dir` (não-recursivo — a árvore no renderer expande sob demanda,
  // nó por nó). Pastas antes de arquivos; dentro de cada grupo, ordem alfabética
  // case-insensitive.
  async list(dir: string): Promise<FileEntry[]> {
    const dirents = await readdir(dir, { withFileTypes: true })
    const entries: FileEntry[] = dirents.map((d) => ({
      name: d.name,
      path: join(dir, d.name),
      isDir: d.isDirectory()
    }))
    return entries.sort(compareEntries)
  }

  // Lê até MAX_READ_BYTES do arquivo (não carrega o arquivo inteiro em memória p/ arquivos
  // grandes). Detecta binário via byte NUL nos primeiros ~8KB efetivamente lidos — sinal clássico
  // de conteúdo não-texto — e nesse caso devolve content vazio em vez de uma string potencialmente
  // corrompida por bytes inválidos de UTF-8. `truncated` reflete o tamanho REAL do arquivo (via
  // stat), não quanto foi lido: um arquivo de 300KB é `truncated:true` mesmo que os 256KB lidos
  // sejam perfeitamente válidos.
  async read(path: string): Promise<{ content: string; truncated: boolean; binary: boolean }> {
    const info = await stat(path)
    const size = info.size
    const toRead = Math.min(size, MAX_READ_BYTES)
    const buffer = Buffer.alloc(toRead)
    if (toRead > 0) {
      const handle = await open(path, 'r')
      try {
        await handle.read(buffer, 0, toRead, 0)
      } finally {
        await handle.close()
      }
    }
    const sniffLength = Math.min(buffer.length, BINARY_SNIFF_BYTES)
    const isBinary = buffer.subarray(0, sniffLength).includes(0)
    if (isBinary) {
      return { content: '', binary: true, truncated: false }
    }
    return { content: buffer.toString('utf-8'), binary: false, truncated: size > MAX_READ_BYTES }
  }

  // Onda 2 (T4): grava `content` (UTF-8) em `filePath` de forma ATÔMICA (tmp + rename), espelhando o
  // padrão endurecido de ProjectManager.writeJson: escreve num `.orktmp`, `fsync` do handle (fecha a
  // janela de queda-de-energia em que o rename de metadado persiste antes do conteúdo), e só então
  // `rename` por cima do alvo — um leitor concorrente vê ou o arquivo velho ou o novo inteiro, nunca
  // um estado truncado. `root` é a raiz da árvore no renderer: gravar FORA dela é recusado por
  // `isInsideRoot` (defesa contra path traversal — este é o primeiro método que ESCREVE, rompendo o
  // read-only, então a validação de caminho é obrigatória). Rejeita (Promise) em erro; o `.orktmp` é
  // removido no catch para não deixar lixo. Só o renderer decide QUANDO gravar (botão salvar); aqui
  // não há undo/backup (o arquivo é do usuário, versionado pelo git dele) — só a garantia de atômico.
  async write(filePath: string, content: string, root: string): Promise<void> {
    if (!isInsideRoot(root, filePath)) {
      throw new Error(`Escrita recusada: caminho fora da raiz permitida (${filePath})`)
    }
    const tmp = `${filePath}.orktmp`
    const handle = await open(tmp, 'w')
    try {
      await handle.writeFile(content, 'utf-8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      await rename(tmp, filePath)
    } catch (err) {
      try {
        await unlink(tmp)
      } catch {
        /* limpeza best-effort: se o tmp já sumiu, seguimos com o erro original */
      }
      throw err
    }
  }

  // `git status --porcelain` -> { entries: { path: 'M' | 'A' | '??' | ... }, prefix }. Os paths que
  // o git devolve são SEMPRE relativos ao TOPLEVEL do repo, nunca a `dir` (confirmado: num repo com
  // `sub/deep/a.txt` modificado, tanto `git -C <toplevel>` quanto `git -C <toplevel>/sub` imprimem
  // `sub/deep/a.txt`). Por isso devolvemos também o `prefix` do `dir` dentro do repo (via
  // `rev-parse --show-prefix`): o consumidor (renderer) compõe `prefix + relativoÀRaiz(root, path)`
  // para casar a chave mesmo quando a raiz da árvore é um SUBdiretório do repo (bug do overlay que
  // sumia em arquivos aninhados). No toplevel o prefixo é '' e o comportamento é idêntico ao de
  // antes. Usamos `--show-prefix` (relativo) e NÃO `--show-toplevel` (absoluto) de propósito: o
  // toplevel normaliza symlinks (ex.: /tmp -> /private/tmp) e não casaria com o `path` cru do
  // renderer. Fora de um repo git (ou git ausente do PATH), execFile rejeita -> { prefix:'',
  // entries:{} }: do ponto de vista do file-explorer isso não é um erro, só "sem status".
  async gitStatus(dir: string): Promise<{ prefix: string; entries: Record<string, string> }> {
    let stdout: string
    try {
      // `core.quotePath=false`: sem isso, o git C-escapa bytes não-ASCII em OCTAL (ex.: `café.txt`
      // -> `"caf\303\251.txt"`), e o cleanGitPath só desfaz escapes de 1 char -> a chave voltaria
      // ilegível ("caf303251.txt") e nunca casaria com o path real. Com `false`, o git devolve o
      // path em UTF-8 cru (só ainda envolve em aspas nomes com espaço, que o cleanGitPath resolve).
      const result = await execFileAsync('git', [
        '-c',
        'core.quotePath=false',
        '-C',
        dir,
        'status',
        '--porcelain'
      ])
      stdout = result.stdout
    } catch {
      return { prefix: '', entries: {} }
    }

    // Prefixo do `dir` dentro do repo (relativo ao toplevel): '' no toplevel, 'sub/' num subdir.
    // Best-effort — na dúvida (falha do rev-parse) assume '', que degrada para o comportamento
    // pré-fix (só casa no toplevel) em vez de quebrar.
    let prefix = ''
    try {
      const pref = await execFileAsync('git', ['-C', dir, 'rev-parse', '--show-prefix'])
      prefix = pref.stdout.trim()
    } catch {
      prefix = ''
    }

    const entries: Record<string, string> = {}
    for (const rawLine of stdout.split('\n')) {
      const line = rawLine.replace(/\r$/, '')
      if (line.length < 3) continue // curta demais p/ ter "XY " + path; ignora sem quebrar
      const status = line.slice(0, 2)
      let rest = line.slice(3)
      // Renames/copies vêm como "old -> new"; ficamos com o path NOVO (chave do resultado).
      const arrowIdx = rest.indexOf(' -> ')
      if (arrowIdx !== -1) rest = rest.slice(arrowIdx + 4)
      const path = cleanGitPath(rest)
      if (!path) continue
      entries[path] = status.trim()
    }
    return { prefix, entries }
  }
}
