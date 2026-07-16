import { readdir, stat, open, rename, unlink, mkdir, lstat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import type { ContentMatch, ContentSearchResult, FileEntry } from '../../shared/filetree'
import { IGNORED_DIR_NAMES } from './watchFilters'
import { isInsideRoot, assertMutableTarget } from './pathGuard'

// O guard lexical nasceu aqui (Onda 2 · T4) e MUDOU-SE para ./pathGuard na T13, quando ganhou a
// camada que resolve symlinks (assertMutableTarget). Re-exportado para os consumidores existentes.
export { isInsideRoot }

const execFileAsync = promisify(execFile)

const MAX_READ_BYTES = 256 * 1024
const BINARY_SNIFF_BYTES = 8 * 1024

// Onda 3 · T8 — teto do modo Diff. 2000 linhas ≈ um diff de revisão humana inteiro (a maioria dos
// diffs de trabalho tem dezenas/centenas de linhas); acima disso ninguém LÊ o diff no nó, e cada
// linha vira um elemento no DOM do renderer — um `git diff` de refactor grande (dezenas de milhares
// de linhas) travaria o canvas. Cortamos no MAIN (não no renderer) para o texto sequer atravessar
// o IPC. `truncated:true` avisa a UI, que manda o usuário ao terminal/editor de verdade.
export const MAX_DIFF_LINES = 2000
// maxBuffer do execFile p/ o diff: o default do Node é 1MB e, estourado, o child é MORTO e o
// execFile rejeita — ou seja, um diff grande cairia no catch e viraria '' ("sem alterações"), que é
// uma MENTIRA pior que truncar. Com 64MB o git termina e nós é que decidimos onde cortar.
const DIFF_MAX_BUFFER = 64 * 1024 * 1024

// Onda 3 · T10 — tetos da busca por conteúdo. 200 resultados é mais do que alguém LÊ num nó do
// canvas (quem precisa de mais refina a query); parar cedo também limita o custo da varredura num
// projeto grande. O trecho por linha é capado para uma linha minificada (bundle de 1MB numa linha
// só) não atravessar o IPC inteira — o que a UI mostra é "onde está", não o conteúdo.
export const MAX_SEARCH_RESULTS = 200
const MAX_SEARCH_SNIPPET = 200

function compareEntries(a: FileEntry, b: FileEntry): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

// ── Onda 3 · T11: defesa contra OPTION INJECTION nos comandos git de escrita ────────────────────
// `execFile` com array de args NÃO protege disto: quem faz getopt são os PRÓPRIOS binários, sobre o
// argv que recebem. Um nome de branch `-D` viraria `git branch -D <alvo>` = DELETAR a branch do
// usuário; `-f`/`--force`/`--discard-changes` num checkout descartariam trabalho não salvo. É o
// mesmo vetor real já corrigido em `buildScpDrop` (um localPath com `-` inicial virava
// `-oProxyCommand=...` e executava comando LOCAL) — e a defesa aqui é a mesma, em duas camadas:
//   1. esta validação, que barra o `-` inicial ANTES de qualquer arg chegar ao git;
//   2. `--` antes de todo posicional nos comandos (cinto-e-suspensório: mesmo que esta regra
//      afrouxe um dia, o getopt do git já terminou e nada volta a ser lido como opção).
//
// A regra é deliberadamente RIGOROSA e só cobre o que é claramente hostil ou ilegível; a
// autoridade final sobre "este nome é legal p/ o git?" é o próprio git (`check-ref-format --branch`,
// chamado no serviço). NB: `check-ref-format` NÃO aceita `--` (vira erro de uso), então ele não pode
// ser a primeira barreira do `-` inicial — esta função é que é.
export function isSafeBranchName(name: string): boolean {
  if (typeof name !== 'string') return false
  if (name.length === 0 || name.length > 255) return false
  // `-` inicial = option injection. O caso central desta defesa.
  if (name.startsWith('-')) return false
  // espaço nas pontas: o git recusaria, mas recusamos antes p/ um erro legível (e p/ que ' -D'
  // nunca vire '-D' depois de algum trim acidental)
  if (name !== name.trim()) return false
  // Espaco e controle em QUALQUER posicao. `\n` quebraria qualquer log/erro; espaco/controle o
  // git recusa em refname de todo jeito. Acentos e demais UTF-8 passam DE PROPOSITO: num projeto
  // em portugues `feat/acentuacao` e o caso comum, e o git aceita.
  if (/[\u0000-\u0020\u007f]/.test(name)) return false
  return true
}

// Texto LEGÍVEL de um erro de execFile do git. Junta stderr E stdout de propósito: o git manda
// `nothing to commit, working tree clean` para o STDOUT com exit≠0 — um handler que só olhasse
// stderr devolveria "falhou" mudo, exatamente a falha silenciosa que estes comandos não podem ter.
function gitErrorText(err: unknown): string {
  const e = err as { stderr?: unknown; stdout?: unknown; message?: unknown }
  const parts = [e?.stderr, e?.stdout]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0)
  if (parts.length > 0) return parts.join('\n')
  return typeof e?.message === 'string' && e.message ? e.message : 'erro desconhecido do git'
}

// ── Argumentos dos comandos git de ESCRITA (Onda 3 · T11), como funções PURAS ─────────────────
// Extraídos do serviço para que a segunda camada da defesa de option injection — o `--` antes de
// todo posicional — seja verificável por teste SOZINHA. Sem isso ela é código não exercitado: a
// primeira camada (isSafeBranchName) barra o vetor hostil antes, então remover o `--` não quebraria
// teste nenhum (medido por mutação) e a defesa apodreceria em silêncio. O serviço chama estas
// funções — elas não são helper decorativo.
export function gitCommitArgs(dir: string, message: string): string[] {
  // `-m <msg>`: o parse-options do git consome o PRÓXIMO argv como valor, então mensagem começando
  // com `-` é mensagem. `--` final encerra o getopt (não passamos pathspec — o `-a` é o escopo).
  return ['-c', 'core.quotePath=false', '-C', dir, 'commit', '-a', '-m', message, '--']
}

export function gitCreateBranchArgs(dir: string, name: string): string[] {
  // `--` antes do nome: sem ele, `-D` seria a FLAG de deletar branch, não um nome.
  return ['-C', dir, 'branch', '--', name]
}

export function gitSwitchArgs(dir: string, branch: string): string[] {
  // `switch` (não `checkout`): ver a decisão no gitCheckout. `--` encerra o getopt (`-f`, etc.).
  return ['-C', dir, 'switch', '--', branch]
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
// Dependências injetáveis do serviço (Onda 3 · T13). `trash` envia um caminho para a LIXEIRA do
// sistema — em produção é o shell.trashItem do Electron (ver src/main/index.ts); nos testes, um
// spy. Injetada porque o serviço roda em teste node puro (sem Electron) E porque a decisão de
// design é visível no tipo: exclusão definitiva NÃO existe aqui — sem dep de lixeira, remove()
// falha legível em vez de degradar para um rm.
export interface FileTreeServiceDeps {
  trash?: (path: string) => Promise<void>
}

export class FileTreeService {
  constructor(private readonly deps: FileTreeServiceDeps = {}) {}

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

  // ── Onda 3 · T13: mutação de ARQUIVOS (o menu de contexto da árvore) ──────────────────────────
  // Todas passam por assertMutableTarget (pathGuard): alvo sob a raiz com SYMLINKS RESOLVIDOS no
  // caminho até o pai, pai existente, e a própria raiz imutável. Regras comuns:
  //  · nada aqui sobrescreve nem apaga definitivo — criar em alvo existente falha, renomear para
  //    destino existente falha, excluir vai para a LIXEIRA (recuperável);
  //  · erro é rejeição legível (o renderer mostra), nunca silêncio.

  // Cria arquivo VAZIO ou pasta. `wx`/mkdir não-recursivo: alvo existente e pai inexistente são
  // erros do fs, não sobrescrita — o conteúdo que já estava lá nunca é tocado.
  async create(path: string, root: string, kind: 'file' | 'dir'): Promise<void> {
    await assertMutableTarget(root, path)
    if (kind === 'dir') {
      await mkdir(path)
      return
    }
    const handle = await open(path, 'wx')
    await handle.close()
  }

  // Renomear e MOVER são o mesmo syscall (rename) — o menu expõe os dois gestos, o serviço tem um
  // caminho só. O guard roda na ORIGEM e no DESTINO (mover para fora da raiz é tão escape quanto
  // criar fora). A checagem de destino existente é obrigatória: o rename POSIX sobrescreve em
  // SILÊNCIO, e "renomeei a.txt para b.txt" não pode significar "destruí o b.txt que existia".
  // (Checagem-então-rename tem janela TOCTOU teórica; para um gesto de UI num explorador local, o
  // erro legível vale mais que a corrida improvável.)
  async rename(from: string, to: string, root: string): Promise<void> {
    await assertMutableTarget(root, from)
    await assertMutableTarget(root, to)
    let destinoExiste = true
    try {
      await lstat(to)
    } catch {
      destinoExiste = false
    }
    if (destinoExiste) {
      throw new Error(`Operação recusada: o destino já existe (${to})`)
    }
    await rename(from, to)
  }

  // Exclui = envia para a LIXEIRA do sistema (dep injetada; produção usa shell.trashItem). Não há
  // caminho de exclusão definitiva neste serviço de propósito: a confirmação da UI é a primeira
  // barreira, a lixeira é a segunda — um clique errado continua recuperável. Sem a dep, falha
  // legível (nunca degrada para rm).
  async remove(path: string, root: string): Promise<void> {
    await assertMutableTarget(root, path)
    if (!this.deps.trash) {
      throw new Error('Exclusão indisponível: sem acesso à lixeira do sistema neste ambiente.')
    }
    await this.deps.trash(path)
  }

  // Onda 3 · T10 — busca por CONTEÚDO (o modo `>` do campo de busca da árvore). Varredura
  // recursiva LIMITADA por construção, não por fé:
  //  · pula `.git`/`node_modules` (o mesmo IGNORED_DIR_NAMES do watch — a razão é a mesma: são os
  //    dois cantos gigantes que ninguém quer nos resultados);
  //  · cada arquivo passa pelo `read` de sempre — binário (byte NUL) é pulado e só os primeiros
  //    MAX_READ_BYTES são olhados (buscar além do que o preview consegue MOSTRAR só produziria um
  //    resultado que não abre);
  //  · para no teto de resultados (MAX_SEARCH_RESULTS) com `truncated:true` — a varredura inteira
  //    é interrompida, não só o append.
  // Match por substring case-insensitive (sem regex: query do usuário não vira pattern — `.` numa
  // busca por "config.ts" deve casar "config.ts", não "configXts"). Erros de leitura no MEIO da
  // varredura (arquivo sumiu, sem permissão) pulam a entrada — best-effort, como o refresh do
  // watch; só a RAIZ inexistente rejeita, mesmo contrato do `list`. Symlinks de diretório não são
  // seguidos (dirent.isDirectory() é false para symlink), então ciclo não trava a varredura.
  async searchContent(dir: string, query: string): Promise<ContentSearchResult> {
    const q = query.trim().toLowerCase()
    if (!q) return { matches: [], truncated: false }
    const matches: ContentMatch[] = []
    let truncated = false

    const walk = async (d: string, isRoot: boolean): Promise<void> => {
      let entries: FileEntry[]
      try {
        entries = await this.list(d)
      } catch (err) {
        if (isRoot) throw err
        return
      }
      for (const entry of entries) {
        if (truncated) return
        if (entry.isDir) {
          if (IGNORED_DIR_NAMES.has(entry.name)) continue
          await walk(entry.path, false)
          continue
        }
        let file: { content: string; binary: boolean }
        try {
          file = await this.read(entry.path)
        } catch {
          continue
        }
        if (file.binary) continue
        const lines = file.content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].toLowerCase().includes(q)) continue
          if (matches.length >= MAX_SEARCH_RESULTS) {
            truncated = true
            return
          }
          matches.push({ path: entry.path, line: i + 1, text: lines[i].trim().slice(0, MAX_SEARCH_SNIPPET) })
        }
      }
    }

    await walk(dir, true)
    return { matches, truncated }
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

  // Onda 3 · T8: nome da branch atual do repo que contém `dir` — só o header da árvore. LEITURA
  // PURA (nenhum comando aqui muta o repo; commit/checkout são T11). `branch --show-current` (e não
  // `rev-parse --abbrev-ref HEAD`) de propósito: em HEAD destacado o `--abbrev-ref` devolve a
  // string literal 'HEAD', que apareceria no header como se fosse o nome de uma branch; o
  // `--show-current` devolve '' — o mesmo que fora de repo, e o header simplesmente não mostra
  // nada (honesto: não estamos em branch nenhuma). Repo recém-`init` sem commit já responde o nome
  // da branch inicial. Fora de repo (ou git ausente do PATH) execFile rejeita -> '': para um
  // file-explorer isso não é erro, é "sem git".
  async gitBranch(dir: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', dir, 'branch', '--show-current'])
      return stdout.trim()
    } catch {
      return ''
    }
  }

  // Onda 3 · T8: diff das alterações NÃO COMMITADAS do repo que contém `dir`, opcionalmente
  // limitado a `path` (absoluto — o git resolve pathspec absoluto dentro do repo). LEITURA PURA.
  //
  // `diff HEAD` (e não `diff` puro) porque "não commitado" inclui o que já está em STAGE: com
  // `git diff` puro, dar `git add` num arquivo o faria SUMIR do modo Diff, como se a mudança
  // tivesse evaporado. Em repo sem nenhum commit (HEAD inexistente) o `diff HEAD` falha -> caímos
  // no `diff` simples. Untracked não aparece em nenhum dos dois (é o overlay '??' da árvore que
  // sinaliza arquivo novo).
  //
  // `core.quotePath=false` pelo mesmo motivo do gitStatus: sem isso os cabeçalhos `a/café.txt`
  // voltariam C-escapados em octal ("caf\303\251.txt") e o diff ficaria ilegível — num projeto em
  // português nomes acentuados são o caso comum.
  //
  // Truncagem em MAX_DIFF_LINES: ver a constante. `truncated` é o único sinal — a UI que decida o
  // que dizer.
  async gitDiff(dir: string, path?: string): Promise<{ text: string; truncated: boolean }> {
    const base = ['-c', 'core.quotePath=false', '-C', dir, 'diff']
    const pathspec = path ? ['--', path] : []
    let stdout: string
    try {
      const r = await execFileAsync('git', [...base, 'HEAD', ...pathspec], {
        maxBuffer: DIFF_MAX_BUFFER
      })
      stdout = r.stdout
    } catch {
      try {
        const r = await execFileAsync('git', [...base, ...pathspec], { maxBuffer: DIFF_MAX_BUFFER })
        stdout = r.stdout
      } catch {
        return { text: '', truncated: false }
      }
    }
    const lines = stdout.split('\n')
    if (lines.length <= MAX_DIFF_LINES) return { text: stdout, truncated: false }
    return { text: lines.slice(0, MAX_DIFF_LINES).join('\n'), truncated: true }
  }

  // ── Onda 3 · T11: git de ESCRITA ────────────────────────────────────────────────────────────
  // Primeiros métodos que mutam o REPOSITÓRIO do usuário (todo o resto — status/branch/diff — é
  // leitura pura). Regras que valem para os três:
  //  · NADA destrutivo: sem --force/-f, sem reset --hard, sem clean, sem branch -D. Nenhum caminho
  //    aqui descarta trabalho do usuário — no pior caso a operação FALHA e o erro sobe legível.
  //  · Erro é REPORTADO (rejeição da Promise), nunca engolido devolvendo vazio como o read-only
  //    faz: "sem git" não é erro para exibir uma árvore, mas é erro para pedir um commit.
  //  · `--` antes de todo posicional + isSafeBranchName (ver a nota de option injection acima).
  //  · push/pull/fetch ficam FORA (rede/credenciais).

  // Nome de branch legal? Duas camadas: a nossa regra (barra o `-` inicial — o `check-ref-format`
  // NÃO aceita `--`, então ele não pode ser a primeira barreira) e depois o PRÓPRIO git decidindo
  // (`check-ref-format --branch` recusa 'com espaço', 'x..y', 'x.lock', 'HEAD', 'x~1'…). Lança com
  // mensagem legível; não muta nada.
  private async assertBranchName(name: string): Promise<void> {
    if (!isSafeBranchName(name)) {
      throw new Error(`Nome de branch inválido: ${JSON.stringify(name)}`)
    }
    try {
      await execFileAsync('git', ['check-ref-format', '--branch', name])
    } catch {
      throw new Error(`Nome de branch inválido para o git: ${JSON.stringify(name)}`)
    }
  }

  // Commit do que está no repo que contém `dir`. Devolve o SHA do novo HEAD (a UI confirma com um
  // fato do repo, não com um "ok" de fé).
  //
  // DECISÃO — `commit -a` (stage do TRACKED modificado/removido + commit) e NÃO `add -A`:
  // `add -A` inclui UNTRACKED, e um botão que faz isso cego varre para dentro do histórico do
  // usuário um `.env` que ele esqueceu de ignorar, um dump, um artefato de build — e histórico
  // publicado não se desfaz sem reescrever. `-a` só toca no que o usuário JÁ decidiu versionar.
  // O que ele quiser adicionar de novo, adiciona explicitamente (`git add`) — e o `-a` respeita:
  // o index existente entra no commit junto, inclusive untracked que ele mesmo deu `add`. A UI
  // mostra essa lista ANTES de confirmar (ver commitPreview no renderer).
  // NB: o escopo é o REPO inteiro, não só `dir` — é a semântica do `-a`, e a lista da confirmação
  // vem do mesmo `gitStatus` (que já é do repo), então o que a UI promete é o que acontece.
  //
  // A mensagem vai por `-m <msg>` como argumento do array: o parse-options do git consome o
  // PRÓXIMO argv como valor de `-m`, então uma mensagem começando com `-` é mensagem, não flag
  // (testado). Nada é injetado nela — sem Co-Authored-By, sem trailer; o autor é a config do
  // usuário. O commit é dele, não nosso.
  async gitCommit(dir: string, message: string): Promise<{ head: string }> {
    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new Error('Commit recusado: a mensagem não pode ser vazia.')
    }
    try {
      await execFileAsync('git', gitCommitArgs(dir, message))
    } catch (err) {
      // Inclui o caso "nothing to commit" (nada staged), que o git manda em STDOUT com exit≠0.
      throw new Error(`Commit falhou: ${gitErrorText(err)}`)
    }
    const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', 'HEAD'])
    return { head: stdout.trim() }
  }

  // Cria a branch `name` apontando para o HEAD atual, SEM trocar para ela (quem troca é o
  // gitCheckout — separar as duas deixa a UI confirmar cada uma). `git branch -- <name>` nunca
  // sobrescreve uma branch existente (isso exigiria `-f`, que não usamos): se já existe, falha.
  async gitCreateBranch(dir: string, name: string): Promise<void> {
    await this.assertBranchName(name)
    try {
      await execFileAsync('git', gitCreateBranchArgs(dir, name))
    } catch (err) {
      throw new Error(`Criação de branch falhou: ${gitErrorText(err)}`)
    }
  }

  // Troca para a branch `branch`.
  //
  // DECISÃO — `git switch` e NÃO `git checkout`: o `checkout` é sobrecarregado e a forma
  // "segura contra option injection" dele é uma ARMADILHA — `git checkout -- <x>` não troca de
  // branch, RESTAURA o arquivo `<x>` do index, descartando o trabalho não salvo. Ou seja: o `--`
  // que nos protege do `-f` transformaria a operação na única coisa destrutiva desta tarefa. O
  // `switch` só troca de branch (não conhece pathspec), então `switch -- <name>` é o que parece
  // ser. Sem fallback para `checkout` em git antigo (<2.23): falhar visível é melhor que cair
  // silenciosamente no comando com a semântica perigosa.
  //
  // Working tree SUJO: o git RECUSA a troca quando ela sobrescreveria alteração não commitada.
  // Isso é o comportamento CERTO e não é contornado (nada de -f/--discard-changes/stash por baixo
  // dos panos) — o erro do git sobe legível e o usuário decide (commitar, ou resolver no terminal).
  async gitCheckout(dir: string, branch: string): Promise<void> {
    await this.assertBranchName(branch)
    try {
      await execFileAsync('git', gitSwitchArgs(dir, branch))
    } catch (err) {
      throw new Error(`Troca de branch falhou: ${gitErrorText(err)}`)
    }
  }
}
