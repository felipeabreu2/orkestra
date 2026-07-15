import {
  readFileSync,
  renameSync,
  existsSync,
  rmSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, dirname } from 'node:path'
import type { CanvasSnapshot } from '../../shared/canvasSnapshot'
import type { Project, ProjectIndex } from '../../shared/project'

function emptyCanvas(): CanvasSnapshot {
  return { version: 2, nodes: [], edges: [] }
}

// INT-8 (auditoria 2026-07-14): ids de projeto são UUIDs (randomUUID) — nunca contêm separadores de
// caminho nem '..'. Validar antes de compor o caminho do arquivo impede que um renderer comprometido
// passe id='../projects' (via projects:saveCanvas) e escreva FORA da pasta projects/ (ex.: por cima
// do próprio projects.json). Defesa em profundidade — o caminho normal (id do índice) sempre passa.
function isValidProjectId(id: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(id)
}

// Resultado de uma leitura de arquivo JSON, distinguindo as quatro situações que exigem respostas
// DIFERENTES (auditoria 2026-07-14, INT-1/INT-2): 'missing' (arquivo não existe — legítimo), 'ok'
// (lido e válido), 'corrupt' (lido mas JSON inválido/shape errado — dado provavelmente perdido) e
// 'ioerror' (readFileSync lançou — EACCES/EMFILE/EISDIR, tipicamente TRANSITÓRIO). A distinção
// crítica é corrupt-vs-ioerror: só em 'corrupt' faz sentido persistir uma cura por cima; em
// 'ioerror' NÃO se pode reescrever o arquivo (ele pode estar íntegro, só temporariamente ilegível).
type ReadResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'missing' }
  | { status: 'ioerror' }
  | { status: 'corrupt' }

// Fase 15 (Task 2): persistência multi-projeto. Layout sob `baseDir` (userData):
//   projects.json        -> índice { projects: Project[], activeId }
//   projects/<id>.json   -> canvas de cada projeto (mesmo shape/validação do CanvasPersistence)
// `persistence:load/save` (registerPersistenceIpc) delega a loadActiveCanvas/saveActiveCanvas,
// que sempre operam sobre o projeto atualmente ativo — a UI não sabe qual id é o ativo, só
// troca de projeto via `switch()`.
export class ProjectManager {
  private readonly indexPath: string
  private readonly projectsDir: string
  private readonly legacyCanvasPath: string

  constructor(private readonly baseDir: string) {
    this.indexPath = join(baseDir, 'projects.json')
    this.projectsDir = join(baseDir, 'projects')
    this.legacyCanvasPath = join(baseDir, 'canvas.json')
  }

  private canvasPath(id: string): string {
    return join(this.projectsDir, `${id}.json`)
  }

  // Escrita atômica (tmp + rename) endurecida (auditoria 2026-07-14):
  //  - INT-3: garante a pasta destino (mkdir recursivo) — se `projects/` for removida com o app
  //    aberto, escrever deixava de ser silenciosamente perdido; agora recria e grava.
  //  - INT-5: fsync do arquivo (e best-effort do diretório) ANTES/DEPOIS do rename — sem isso, numa
  //    queda de energia o rename (metadado) pode persistir antes do conteúdo, deixando o arquivo
  //    zerado/truncado (que no boot vira "corrupto" e dispara o self-heal). fsync fecha essa janela.
  //  - Retorna boolean em vez de void: o chamador (saveCanvas/IPC) pode saber se a gravação de fato
  //    aconteceu, em vez de "sucesso de mentira". Continua NUNCA lançando.
  private writeJson(path: string, data: unknown): boolean {
    const tmp = `${path}.tmp`
    try {
      mkdirSync(dirname(path), { recursive: true })
      const json = JSON.stringify(data, null, 2)
      const fd = openSync(tmp, 'w')
      try {
        writeSync(fd, json, null, 'utf-8')
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      renameSync(tmp, path)
      // fsync do diretório persiste a entrada do rename. Nem todo SO/FS suporta abrir um diretório
      // para fsync (ex.: Windows) — best-effort, a falha aqui não invalida a gravação.
      try {
        const dfd = openSync(dirname(path), 'r')
        try {
          fsyncSync(dfd)
        } finally {
          closeSync(dfd)
        }
      } catch {
        /* fsync de diretório indisponível neste SO/FS — segue */
      }
      return true
    } catch (err) {
      console.error('[ProjectManager] write failed:', path, err)
      try {
        if (existsSync(tmp)) rmSync(tmp)
      } catch {
        /* ignore cleanup failure */
      }
      return false
    }
  }

  // Preserva os bytes de um arquivo prestes a ser degradado/sobrescrito, para recuperação manual.
  // Best-effort e nunca lança — se o próprio backup falhar, seguimos (abortar a operação inteira só
  // por não conseguir o backup seria pior). Sufixo com timestamp (o main process pode usar Date).
  private backup(path: string): void {
    try {
      if (existsSync(path)) copyFileSync(path, `${path}.corrupt-${Date.now()}`)
    } catch (err) {
      console.error('[ProjectManager] backup failed:', path, err)
    }
  }

  // Leitura tipada com as quatro situações (ver ReadResult). Genérica sobre a validação do shape.
  private readJson<T>(path: string, valid: (parsed: unknown) => parsed is T): ReadResult<T> {
    if (!existsSync(path)) return { status: 'missing' }
    let raw: string
    try {
      raw = readFileSync(path, 'utf-8')
    } catch {
      return { status: 'ioerror' } // I/O (EACCES/EMFILE/EISDIR…) — tipicamente transitório; NÃO destruir
    }
    try {
      const parsed = JSON.parse(raw)
      return valid(parsed) ? { status: 'ok', value: parsed } : { status: 'corrupt' }
    } catch {
      return { status: 'corrupt' }
    }
  }

  private readIndexResult(): ReadResult<ProjectIndex> {
    return this.readJson(this.indexPath, (p): p is ProjectIndex =>
      !!p &&
      typeof p === 'object' &&
      Array.isArray((p as ProjectIndex).projects) &&
      typeof (p as ProjectIndex).activeId === 'string'
    )
  }

  private readCanvasResult(path: string): ReadResult<CanvasSnapshot> {
    return this.readJson(path, (p): p is CanvasSnapshot =>
      !!p && typeof p === 'object' && Array.isArray((p as CanvasSnapshot).nodes)
    )
  }

  private readCanvas(path: string): CanvasSnapshot | null {
    const r = this.readCanvasResult(path)
    return r.status === 'ok' ? r.value : null
  }

  private writeCanvas(id: string, snapshot: CanvasSnapshot): boolean {
    return this.writeJson(this.canvasPath(id), snapshot)
  }

  private writeIndex(idx: ProjectIndex): boolean {
    return this.writeJson(this.indexPath, idx)
  }

  // Re-adota os canvases órfãos em projects/<id>.json quando o índice sumiu/corrompeu — em vez de
  // NUKAR tudo para um "Projeto 1" único (INT-1). Nome/cwd/ícone viviam só no índice e se perdem,
  // mas o CANVAS (o dado que de fato importa) é preservado e volta a ser alcançável. Ignora .tmp e
  // os backups .corrupt-*; só re-adota arquivos cujo canvas é legível e válido.
  private reconstructFromDir(): Project[] {
    let files: string[]
    try {
      files = readdirSync(this.projectsDir)
    } catch {
      return []
    }
    const projects: Project[] = []
    for (const f of files) {
      if (!f.endsWith('.json') || f.endsWith('.tmp')) continue
      const id = f.slice(0, -'.json'.length)
      if (this.readCanvasResult(join(this.projectsDir, f)).status !== 'ok') continue
      projects.push({ id, name: `Projeto recuperado ${id.slice(0, 8)}` })
    }
    return projects
  }

  // Escrita atômica de um projeto default fresco (primeiro boot / dados realmente vazios), migrando
  // o canvas.json legado (single-projeto) se existir. Compartilhado por bootstrap() e pelo self-heal.
  private createDefaultIndex(): ProjectIndex {
    const project: Project = { id: randomUUID(), name: 'Projeto 1' }
    const legacy = this.readCanvas(this.legacyCanvasPath)
    this.writeCanvas(project.id, legacy ?? emptyCanvas())
    const idx: ProjectIndex = { projects: [project], activeId: project.id }
    this.writeIndex(idx)
    return idx
  }

  // INT-7 (auditoria 2026-07-14): remove os .tmp órfãos deixados por um crash entre writeFileSync e
  // renameSync (a limpeza no catch só cobre o mesmo processo). Restrito a projects/*.tmp e aos dois
  // tmp específicos nossos em baseDir — NUNCA um sweep de *.tmp no baseDir (userData é compartilhado
  // com Cache/Chromium do Electron). Best-effort, nunca lança. Não toca nos backups .corrupt-*.
  private cleanupTmp(): void {
    try {
      if (existsSync(this.projectsDir)) {
        for (const f of readdirSync(this.projectsDir)) {
          if (f.endsWith('.tmp')) {
            try {
              rmSync(join(this.projectsDir, f))
            } catch {
              /* ignore */
            }
          }
        }
      }
      for (const p of [`${this.indexPath}.tmp`, `${this.legacyCanvasPath}.tmp`]) {
        if (existsSync(p)) {
          try {
            rmSync(p)
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* best-effort */
    }
  }

  // Idempotente: se o índice já existe (mesmo corrompido), não recria — a cura de índice
  // corrompido/ilegível é responsabilidade do list() (self-heal robusto). Só cria no primeiro boot.
  // Sempre limpa .tmp órfãos (INT-7), inclusive quando o índice já existe.
  bootstrap(): void {
    this.cleanupTmp()
    if (existsSync(this.indexPath)) return
    mkdirSync(this.projectsDir, { recursive: true })
    this.createDefaultIndex()
  }

  list(): ProjectIndex {
    const res = this.readIndexResult()
    if (res.status === 'ok' && res.value.projects.length > 0) {
      const idx = res.value
      // Garante que activeId aponta para um projeto existente (índice antigo podia ter órfão).
      if (!idx.projects.some((p) => p.id === idx.activeId)) {
        idx.activeId = idx.projects[0].id
        this.writeIndex(idx)
      }
      return idx
    }

    // INT-1: erro de I/O TRANSITÓRIO não pode reescrever o índice (o arquivo pode estar íntegro, só
    // temporariamente ilegível). Devolve uma reconstrução EM MEMÓRIA (sem gravar) para os hot paths
    // (getActive() a cada spawn) — quando o I/O recuperar, a próxima leitura devolve o índice real.
    if (res.status === 'ioerror') {
      const recovered = this.reconstructFromDir()
      if (recovered.length > 0) return { projects: recovered, activeId: recovered[0].id }
      const ghost: Project = { id: randomUUID(), name: 'Projeto 1' }
      return { projects: [ghost], activeId: ghost.id } // mínimo em memória, SEM gravar por cima
    }

    // 'missing' (primeiro boot) ou 'corrupt' (dado provavelmente perdido): aqui SIM persistimos a
    // cura. Em 'corrupt', preserva os bytes antigos antes de sobrescrever (nunca destrói em silêncio).
    if (res.status === 'corrupt') this.backup(this.indexPath)

    // Reconstrói dos canvases órfãos (se houver) antes de cair no default fresco — preserva o dado.
    const recovered = this.reconstructFromDir()
    if (recovered.length > 0) {
      const idx: ProjectIndex = { projects: recovered, activeId: recovered[0].id }
      this.writeIndex(idx)
      return idx
    }
    return this.createDefaultIndex()
  }

  // Fase 17 (Task 1): projeto ATIVO (com seu `cwd`, se houver) — usado pelo resolver late-bound
  // de registerPtyIpc (getProjectCwd), chamado a cada pty:spawn, não guardado em cache aqui.
  getActive(): Project | undefined {
    const idx = this.list()
    return idx.projects.find((p) => p.id === idx.activeId)
  }

  // Fase 17 (Task 1): `cwd` opcional — a pasta vinculada ao projeto, usada depois para resolver
  // o cwd do próximo terminal spawnado (ver registerPtyIpc/getProjectCwd). Sem cwd, o projeto
  // segue com o fallback de HOME já existente em PtyManager.spawn.
  create(name: string, cwd?: string): Project {
    const project: Project = cwd === undefined ? { id: randomUUID(), name } : { id: randomUUID(), name, cwd }
    this.writeCanvas(project.id, emptyCanvas())
    const idx = this.list()
    idx.projects.push(project)
    this.writeIndex(idx) // create() nunca troca o ativo — só o usuário troca via switch()
    return project
  }

  // Transacional (fix 07/14) + INT-2 (auditoria 07/14): null SÓ quando o id não existe (sem
  // efeitos colaterais). Arquivo AUSENTE → canvas vazio (projeto novo, correto). Arquivo
  // ILEGÍVEL/CORROMPIDO → também degrada para vazio para permitir a troca, MAS faz backup dos bytes
  // antes: senão o autosave seguinte (que grava o canvas em memória, agora vazio) apagaria o dado
  // original para sempre. Com o backup, o dado sobrevive à degradação mesmo que o autosave grave vazio.
  switch(id: string): CanvasSnapshot | null {
    const idx = this.list()
    if (!idx.projects.some((p) => p.id === id)) return null
    const res = this.readCanvasResult(this.canvasPath(id))
    if (res.status === 'corrupt' || res.status === 'ioerror') this.backup(this.canvasPath(id))
    const snapshot = res.status === 'ok' ? res.value : emptyCanvas()
    idx.activeId = id
    this.writeIndex(idx)
    return snapshot
  }

  rename(id: string, name: string): void {
    const idx = this.list()
    const project = idx.projects.find((p) => p.id === id)
    if (!project) return
    project.name = name
    this.writeIndex(idx)
  }

  // Fase 17 (Task 1): troca a pasta vinculada a um projeto já existente (ex.: botão "pasta" na
  // sidebar). Mesmo formato de rename() — no-op silencioso se o id não existir.
  setCwd(id: string, cwd: string): void {
    const idx = this.list()
    const project = idx.projects.find((p) => p.id === id)
    if (!project) return
    project.cwd = cwd
    this.writeIndex(idx)
  }

  // Fase 18 (Task 4): ícone (emoji) escolhido no seletor da sidebar. Mesmo formato read-modify-
  // write de rename()/setCwd() — no-op silencioso se o id não existir (nenhuma ação de
  // recuperação melhor no chamador do que simplesmente ignorar).
  setIcon(id: string, icon: string): void {
    const idx = this.list()
    const project = idx.projects.find((p) => p.id === id)
    if (!project) return
    project.icon = icon
    this.writeIndex(idx)
  }

  remove(id: string): { activeId: string; snapshot: CanvasSnapshot | null; removedNodeIds: string[] } {
    const idx = this.list()
    // PTY-1 (auditoria 2026-07-14): coleta os nodeIds dos terminais do projeto ANTES de apagar o
    // arquivo — o caller (main) mata os ptys correspondentes, senão os agentes do projeto removido
    // seguem vivos (CPU/RAM/tokens) e inalcançáveis até o quit.
    const removed = this.readCanvas(this.canvasPath(id))
    const removedNodeIds = (removed?.nodes ?? []).filter((n) => n.type === 'terminal').map((n) => n.id)
    idx.projects = idx.projects.filter((p) => p.id !== id)
    try {
      if (existsSync(this.canvasPath(id))) rmSync(this.canvasPath(id))
    } catch {
      /* ignore: estado do índice já reflete a remoção mesmo se o arquivo não sumir */
    }

    if (idx.projects.length === 0) {
      // Invariante: sempre >=1 projeto — recria um default em vez de deixar a app sem canvas.
      const fallback: Project = { id: randomUUID(), name: 'Projeto 1' }
      this.writeCanvas(fallback.id, emptyCanvas())
      idx.projects.push(fallback)
      idx.activeId = fallback.id
    } else if (idx.activeId === id) {
      idx.activeId = idx.projects[0].id
    }
    this.writeIndex(idx)
    return { activeId: idx.activeId, snapshot: this.loadActiveCanvas(), removedNodeIds }
  }

  loadActiveCanvas(): CanvasSnapshot | null {
    const idx = this.list()
    if (!idx.activeId) return null
    return this.readCanvas(this.canvasPath(idx.activeId))
  }

  saveActiveCanvas(snapshot: CanvasSnapshot): boolean {
    const idx = this.list()
    if (!idx.activeId) return false
    return this.writeCanvas(idx.activeId, snapshot)
  }

  // Fase 15 (Task 3): grava o canvas de um projeto por id EXPLÍCITO, independente de qual projeto
  // está ativo. Existe para o flush da troca de projeto (ProjectsSidebar.switchTo): o renderer
  // precisa salvar o canvas do projeto que está SAINDO por id, sem depender da ordem entre esse
  // flush e a mudança do ativo — diferente de saveActiveCanvas, que sempre mira o ativo do
  // momento em que roda. Retorna se a gravação de fato aconteceu (INT-3).
  // Badge da sidebar (2026-07-14): nº de terminais por projeto. Lê cada canvas e conta os nós
  // type==='terminal'. Best-effort — projeto sem arquivo/ilegível conta 0. Para o projeto ATIVO,
  // o renderer sobrepõe com a contagem ao vivo do canvasStore (aqui é o valor em disco).
  terminalCounts(): Record<string, number> {
    const idx = this.list()
    const counts: Record<string, number> = {}
    for (const p of idx.projects) {
      const snap = this.readCanvas(this.canvasPath(p.id))
      counts[p.id] = (snap?.nodes ?? []).filter((n) => n.type === 'terminal').length
    }
    return counts
  }

  saveCanvas(id: string, snapshot: CanvasSnapshot): boolean {
    // INT-8: rejeita id que não seja UUID-like (path traversal via id='../projects') — nunca
    // compõe um caminho fora de projects/ a partir de entrada do renderer.
    if (!isValidProjectId(id)) {
      console.error('[ProjectManager] saveCanvas: id inválido recusado:', id)
      return false
    }
    return this.writeCanvas(id, snapshot)
  }
}
