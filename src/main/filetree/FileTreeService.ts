import { readdir, stat, open } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import type { FileEntry } from '../../shared/filetree'

const execFileAsync = promisify(execFile)

const MAX_READ_BYTES = 256 * 1024
const BINARY_SNIFF_BYTES = 8 * 1024

function compareEntries(a: FileEntry, b: FileEntry): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
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

// Fase 19 (Task 1): leitura pura de filesystem + git status para o nó de árvore de arquivos do
// canvas (renderer, Task 2). READ-ONLY por design — nenhum método aqui escreve em disco ou muta o
// repo git; cobre só o que um file-explorer de IDE padrão precisa (listar, ler conteúdo, ver
// status de git). Erros de fs (dir/arquivo inexistente, sem permissão) propagam como rejeição da
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

  // `git status --porcelain` -> { path: 'M' | 'A' | '??' | ... }. `path` é relativo à raiz do
  // repo, como o próprio git devolve (quem consome — Task 2 — casa por sufixo/join com o cwd do
  // projeto). Fora de um repo git (ou git ausente do PATH), execFile rejeita -> {}: do ponto de
  // vista do file-explorer isso não é um erro, só significa "sem status para mostrar".
  async gitStatus(dir: string): Promise<Record<string, string>> {
    let stdout: string
    try {
      const result = await execFileAsync('git', ['-C', dir, 'status', '--porcelain'])
      stdout = result.stdout
    } catch {
      return {}
    }

    const out: Record<string, string> = {}
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
      out[path] = status.trim()
    }
    return out
  }
}
