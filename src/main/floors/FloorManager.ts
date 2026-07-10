import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Floor } from '../../shared/floors'

const exec = promisify(execFile)

export function slugifyFloorName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'floor'
}

export class FloorManager {
  private floors = new Map<string, Floor>()
  constructor(private floorsDir: string) {}

  private async git(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await exec('git', args, { cwd })
    return stdout.trim()
  }

  async create(repoPath: string, name: string): Promise<Floor> {
    await this.git(repoPath, ['rev-parse', '--git-dir']) // valida repo; lança se não for
    const id = randomUUID()
    const worktreePath = join(this.floorsDir, id)
    const branch = `orkestra/floor-${slugifyFloorName(name)}-${id.slice(0, 8)}`
    await mkdir(this.floorsDir, { recursive: true })
    await this.git(repoPath, ['worktree', 'add', '-b', branch, worktreePath])
    const floor: Floor = { id, name, repoPath, worktreePath, branch }
    this.floors.set(id, floor)
    await this.persist()
    return floor
  }

  list(): Floor[] { return [...this.floors.values()] }
  get(id: string): Floor | undefined { return this.floors.get(id) }

  async land(id: string): Promise<{ ok: boolean; output: string }> {
    const f = this.floors.get(id)
    if (!f) throw new Error('floor not found')
    try {
      const out = await this.git(f.repoPath, ['merge', '--no-edit', f.branch])
      return { ok: true, output: out }
    } catch (e) {
      // conflito/erro: NÃO resolve nem força; reporta para o usuário resolver
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, output: msg }
    }
  }

  async remove(id: string): Promise<void> {
    const f = this.floors.get(id)
    if (!f) return
    try {
      await this.git(f.repoPath, ['worktree', 'remove', '--force', f.worktreePath])
    } catch {
      // worktree pode já ter sido apagado manualmente fora do app; segue e limpa o estado mesmo assim
      // (evita floor "zumbi" que não pode mais ser removido)
    }
    this.floors.delete(id)
    await this.persist()
  }

  private async persist(): Promise<void> {
    await mkdir(this.floorsDir, { recursive: true })
    await writeFile(join(this.floorsDir, 'floors.json'), JSON.stringify([...this.floors.values()], null, 2))
  }

  async loadPersisted(): Promise<void> {
    try {
      const raw = await readFile(join(this.floorsDir, 'floors.json'), 'utf8')
      const arr = JSON.parse(raw) as Floor[]
      if (Array.isArray(arr)) for (const f of arr) if (f && typeof f.id === 'string') this.floors.set(f.id, f)
    } catch { /* sem persistência ainda */ }
  }
}
