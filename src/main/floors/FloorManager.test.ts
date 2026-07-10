import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FloorManager } from './FloorManager'

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orkestra-repo-'))
  const g = (args: string[]): void => { execFileSync('git', args, { cwd: dir }) }
  g(['init', '-q', '-b', 'main'])
  g(['config', 'user.email', 't@t.dev']); g(['config', 'user.name', 'T'])
  writeFileSync(join(dir, 'README.md'), '# base\n')
  g(['add', '.']); g(['commit', '-qm', 'init'])
  return dir
}

describe('FloorManager', () => {
  let repo: string, floorsDir: string, mgr: FloorManager
  beforeEach(() => {
    repo = makeRepo()
    floorsDir = mkdtempSync(join(tmpdir(), 'orkestra-floors-'))
    mgr = new FloorManager(floorsDir)
  })
  afterEach(() => {
    for (const f of mgr.list()) { try { execFileSync('git', ['worktree', 'remove', '--force', f.worktreePath], { cwd: f.repoPath }) } catch { /* ignore */ } }
    rmSync(repo, { recursive: true, force: true }); rmSync(floorsDir, { recursive: true, force: true })
  })

  it('create adiciona um worktree isolado numa branch dedicada', async () => {
    const f = await mgr.create(repo, 'Feature X')
    expect(f.branch).toBe('orkestra/floor-feature-x')
    expect(existsSync(f.worktreePath)).toBe(true)
    expect(existsSync(join(f.worktreePath, 'README.md'))).toBe(true) // conteúdo do repo base
    expect(mgr.list()).toHaveLength(1)
  })

  it('create rejeita um diretório que não é repo git', async () => {
    const notRepo = mkdtempSync(join(tmpdir(), 'orkestra-notrepo-'))
    await expect(mgr.create(notRepo, 'x')).rejects.toBeTruthy()
    rmSync(notRepo, { recursive: true, force: true })
  })

  it('land faz merge da branch do floor de volta ao repo base', async () => {
    const f = await mgr.create(repo, 'work')
    writeFileSync(join(f.worktreePath, 'novo.txt'), 'do floor\n')
    execFileSync('git', ['add', '.'], { cwd: f.worktreePath })
    execFileSync('git', ['commit', '-qm', 'add novo'], { cwd: f.worktreePath })
    const r = await mgr.land(f.id)
    expect(r.ok).toBe(true)
    expect(existsSync(join(repo, 'novo.txt'))).toBe(true) // aterrissou no base
  })

  it('remove tira o worktree e some da lista', async () => {
    const f = await mgr.create(repo, 'temp')
    await mgr.remove(f.id)
    expect(existsSync(f.worktreePath)).toBe(false)
    expect(mgr.list()).toHaveLength(0)
  })
})
