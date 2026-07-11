import { writeFileSync, readFileSync, renameSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { CanvasSnapshot } from '../../shared/canvasSnapshot'
import type { Project, ProjectIndex } from '../../shared/project'

function emptyCanvas(): CanvasSnapshot {
  return { version: 2, nodes: [], edges: [] }
}

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

  // Escrita atômica (tmp + rename), mesmo padrão do CanvasPersistence — nunca lança; falhas só
  // são logadas (o chamador não tem uma ação de recuperação melhor que "tentar de novo depois").
  private writeJson(path: string, data: unknown): void {
    const tmp = `${path}.tmp`
    try {
      writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
      renameSync(tmp, path)
    } catch (err) {
      console.error('[ProjectManager] write failed:', path, err)
      try {
        if (existsSync(tmp)) rmSync(tmp)
      } catch {
        /* ignore cleanup failure */
      }
    }
  }

  private readIndex(): ProjectIndex | null {
    try {
      if (!existsSync(this.indexPath)) return null
      const raw = readFileSync(this.indexPath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray((parsed as ProjectIndex).projects) ||
        typeof (parsed as ProjectIndex).activeId !== 'string'
      ) {
        return null
      }
      return parsed as ProjectIndex
    } catch {
      return null
    }
  }

  private writeIndex(idx: ProjectIndex): void {
    this.writeJson(this.indexPath, idx)
  }

  private readCanvas(path: string): CanvasSnapshot | null {
    try {
      if (!existsSync(path)) return null
      const raw = readFileSync(path, 'utf-8')
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as CanvasSnapshot).nodes)) {
        return null
      }
      return parsed as CanvasSnapshot
    } catch {
      return null
    }
  }

  private writeCanvas(id: string, snapshot: CanvasSnapshot): void {
    this.writeJson(this.canvasPath(id), snapshot)
  }

  // Idempotente: se o índice já existe, não faz nada (permite chamar em todo boot do app).
  bootstrap(): void {
    if (existsSync(this.indexPath)) return
    mkdirSync(this.projectsDir, { recursive: true })
    const project: Project = { id: randomUUID(), name: 'Projeto 1' }
    const legacy = this.readCanvas(this.legacyCanvasPath)
    this.writeCanvas(project.id, legacy ?? emptyCanvas())
    this.writeIndex({ projects: [project], activeId: project.id })
  }

  list(): ProjectIndex {
    return this.readIndex() ?? { projects: [], activeId: '' }
  }

  create(name: string): Project {
    const project: Project = { id: randomUUID(), name }
    this.writeCanvas(project.id, emptyCanvas())
    const idx = this.list()
    idx.projects.push(project)
    this.writeIndex(idx) // create() nunca troca o ativo — só o usuário troca via switch()
    return project
  }

  switch(id: string): CanvasSnapshot | null {
    const idx = this.list()
    if (!idx.projects.some((p) => p.id === id)) return null
    idx.activeId = id
    this.writeIndex(idx)
    return this.loadActiveCanvas()
  }

  rename(id: string, name: string): void {
    const idx = this.list()
    const project = idx.projects.find((p) => p.id === id)
    if (!project) return
    project.name = name
    this.writeIndex(idx)
  }

  remove(id: string): { activeId: string; snapshot: CanvasSnapshot | null } {
    const idx = this.list()
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
    return { activeId: idx.activeId, snapshot: this.loadActiveCanvas() }
  }

  loadActiveCanvas(): CanvasSnapshot | null {
    const idx = this.list()
    if (!idx.activeId) return null
    return this.readCanvas(this.canvasPath(idx.activeId))
  }

  saveActiveCanvas(snapshot: CanvasSnapshot): void {
    const idx = this.list()
    if (!idx.activeId) return
    this.writeCanvas(idx.activeId, snapshot)
  }

  // Fase 15 (Task 3): grava o canvas de um projeto por id EXPLÍCITO, independente de qual projeto
  // está ativo. Existe para o flush da troca de projeto (ProjectsSidebar.switchTo): o renderer
  // precisa salvar o canvas do projeto que está SAINDO por id, sem depender da ordem entre esse
  // flush e a mudança do ativo — diferente de saveActiveCanvas, que sempre mira o ativo do
  // momento em que roda.
  saveCanvas(id: string, snapshot: CanvasSnapshot): void {
    this.writeCanvas(id, snapshot)
  }
}
