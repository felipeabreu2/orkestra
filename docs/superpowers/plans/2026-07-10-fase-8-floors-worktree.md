# Orkestra — Fase 8 (Floors via git worktree) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** "Floors" = ambientes de trabalho **isolados** por `git worktree`. O usuário aponta um repo git; cria um floor (worktree numa branch dedicada); atribui terminais/agentes ao floor (rodam com `cwd` = o worktree); trabalha isolado; **aterrissa** (`land` = merge da branch do floor de volta) e **remove** o floor.

**Architecture:** Um **`FloorManager`** (main) encapsula todas as operações git via `execFile('git', [...])` (nunca shell — sem injeção). Cada floor vive sob `~/.orkestra/floors/<id>` numa branch `orkestra/floor-<slug>`. Os floors são expostos ao renderer por IPC (`floor:create/list/land/remove`, com o diálogo de diretório do Electron para escolher o repo). Um terminal ganha `data.floorId`; no spawn, o main resolve `floorId → worktreePath` e usa como `cwd` do PTY. Floors persistem em `~/.orkestra/floors.json`.

**Segurança das operações git (invariantes):**
- Todo caminho de worktree é **sempre** `~/.orkestra/floors/<id>` — nunca um caminho arbitrário vindo do renderer.
- Toda branch de floor tem prefixo `orkestra/floor-`.
- `create` usa `git worktree add` (não-destrutivo: cria diretório novo).
- `land` usa `git merge <branch>` **sem** `--force`/`-X`; em conflito, **reporta e não resolve** (o usuário resolve manualmente). Nunca faz reset/rebase/push.
- `remove` usa `git worktree remove` (remove só o worktree; a branch permanece a menos que explicitamente pedido).
- Antes de qualquer operação, valida que `repoPath` é um repo git (`git rev-parse --git-dir`).

**Tech Stack:** `node:child_process` (execFile), `node:fs/promises`, `node:path`, `node:os`. Sem deps novas. Vitest (com repos git temporários reais nos testes).

## Global Constraints

- Renderer NÃO importa `fs`/`http`/`node-pty`/`child_process`. Toda git/FS fica no main.
- Segurança do servidor de orquestração inalterada (127.0.0.1 + token).
- `git` invocado só via `execFile('git', argsArray, {cwd})` — nunca `exec`/shell.
- Nomenclatura: **não** usar marcas do Maestri.
- Operações destrutivas seguem os invariantes acima (paths confinados, sem `--force` no merge).

---

### Task 1: `FloorManager` — create/list/land/remove via git worktree (TDD)

**Files:**
- Create: `src/main/floors/FloorManager.ts`, `src/main/floors/FloorManager.test.ts`
- Create: `src/shared/floors.ts` (tipo `Floor` compartilhado)

**Interfaces:**
- Produces:
  - `interface Floor { id: string; name: string; repoPath: string; worktreePath: string; branch: string }` (em `src/shared/floors.ts`).
  - `class FloorManager { constructor(floorsDir: string); create(repoPath: string, name: string): Promise<Floor>; list(): Floor[]; get(id: string): Floor | undefined; land(id: string): Promise<{ ok: boolean; output: string }>; remove(id: string): Promise<void>; loadPersisted(): Promise<void>; }`
  - A helper `slugifyFloorName(name: string): string` (lowercase, espaços→`-`, remove chars não `[a-z0-9-]`).

- [ ] **Step 1: Test setup — repo git temporário (falha primeiro)**

`FloorManager.test.ts` — helper que cria um repo git real num tmpdir (para testes reais, não mocks):
```ts
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
```

- [ ] **Step 2: Rodar (falha — sem FloorManager), implementar `src/shared/floors.ts`**

```ts
export interface Floor {
  id: string
  name: string
  repoPath: string
  worktreePath: string
  branch: string
}
```

- [ ] **Step 3: Implementar `FloorManager.ts`**

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Floor } from '../../shared/floors'

const exec = promisify(execFile)

export function slugifyFloorName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-') || 'floor'
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
    const branch = `orkestra/floor-${slugifyFloorName(name)}`
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
    await this.git(f.repoPath, ['worktree', 'remove', '--force', f.worktreePath])
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
```

- [ ] **Step 4: Rodar testes + typecheck** — `npm test && npm run typecheck` verdes. (Os testes de git levam ~1-2s cada — aceitável.)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: FloorManager (git worktree create/list/land/remove) (Fase 8)"`

---

### Task 2: IPC de floors + `cwd` do PTY por floor + persistência no boot (TDD onde aplicável)

**Files:**
- Create: `src/main/floors/registerFloorIpc.ts` (+ `.test.ts`)
- Modify: `src/main/index.ts`, `src/main/pty/registerPtyIpc.ts`, `src/preload/index.ts`, `src/main/pty/PtyManager.ts` (só se `cwd` ainda não fluir — provavelmente já flui)

**Interfaces:**
- Consumes: `FloorManager` (Task 1).
- Produces:
  - IPC handlers: `floor:create` (abre `dialog.showOpenDialog` p/ escolher o repo, depois `mgr.create`), `floor:list`, `floor:land`, `floor:remove`; expostos no preload como `window.orkestra.floors.{create,list,land,remove}`.
  - `pty:spawn` opts aceita `floorId?: string`; no handler do main, se `floorId`, resolve `cwd = floorManager.get(floorId)?.worktreePath` e passa ao `ptyManager.spawn({ ..., cwd })`.

- [ ] **Step 1: `registerFloorIpc` test (falha primeiro)**

Em `registerFloorIpc.test.ts`: um `ipcMain` fake (registra handlers num mapa) + um `FloorManager` fake/real; verificar que `floor:list` chama `mgr.list()`, `floor:land` chama `mgr.land(id)`, `floor:remove` chama `mgr.remove(id)`. (O `floor:create` que abre diálogo pode ser testado injetando um `pickRepo` fake que retorna um path — ver Step 2.)

- [ ] **Step 2: Implementar `registerFloorIpc.ts`**

```ts
import type { IpcMain } from 'electron'
import type { FloorManager } from './FloorManager'

// pickRepo injetável p/ testes; em produção usa dialog.showOpenDialog
export function registerFloorIpc(
  ipcMain: IpcMain,
  mgr: FloorManager,
  pickRepo: () => Promise<string | null>
): void {
  ipcMain.handle('floor:create', async (_e, name: string) => {
    const repoPath = await pickRepo()
    if (!repoPath) return null
    return mgr.create(repoPath, name)
  })
  ipcMain.handle('floor:list', async () => mgr.list())
  ipcMain.handle('floor:land', async (_e, id: string) => mgr.land(id))
  ipcMain.handle('floor:remove', async (_e, id: string) => { await mgr.remove(id); return true })
}
```

- [ ] **Step 3: Fiar no `main/index.ts`**

Instanciar `const floorManager = new FloorManager(join(app.getPath('home'), '.orkestra', 'floors'))`; `await floorManager.loadPersisted()` no `whenReady`; `registerFloorIpc(ipcMain, floorManager, async () => { const r = await dialog.showOpenDialog({ properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0] })`. Passar ao `registerPtyIpc` um resolvedor de cwd por floor: no handler `pty:spawn`, se `opts.floorId`, `cwd = floorManager.get(opts.floorId)?.worktreePath ?? opts.cwd`.

- [ ] **Step 4: `pty:spawn` aceita `floorId` (renderer→main)**

`registerPtyIpc.ts`: estender `SpawnOpts` com `floorId?: string`; resolver o cwd via um callback `resolveCwd?(floorId): string | undefined` injetado (ou uma referência ao FloorManager). `preload/index.ts`: adicionar `floorId?` ao tipo do `pty.spawn` e expor `floors` API. Confirmar que `PtyManager.spawn` já repassa `cwd` ao spawner (Fase 1) — se sim, nada a mudar nele.

- [ ] **Step 5: Testes + typecheck** — verdes.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: IPC de floors + cwd do PTY por floor (Fase 8)"`

---

### Task 3: UI de floors + atribuir terminal a floor + checkpoint

**Files:**
- Create: `src/renderer/src/components/FloorsPanel.tsx`
- Modify: `src/renderer/src/components/Canvas.tsx`, `src/renderer/src/components/TerminalNode.tsx`/`TerminalFlowNode.tsx`, `src/renderer/src/store/canvasStore.ts` (+ `.test.ts` se novo método), `src/renderer/src/env.d.ts` (tipos da API `floors`)

**Interfaces:**
- Consumes: `window.orkestra.floors.{create,list,land,remove}` (Task 2); `pty.spawn({floorId})`.
- Produces: um painel que lista floors com botões **Criar** (pede nome, chama `floors.create`), **Land** e **Remover**; um seletor no terminal p/ atribuir `data.floorId`; `TerminalNode` passa `floorId` no spawn.

- [ ] **Step 1: Store — floorId no terminal**

`canvasStore.ts`: `addTerminalNode` aceita `opts.floorId`; adicionar `updateTerminalFloor(id, floorId)`. (TDD mínimo: um teste que `updateTerminalFloor` seta `data.floorId`.)

- [ ] **Step 2: `FloorsPanel.tsx`**

Um painel (canto do canvas) que no mount chama `window.orkestra.floors.list()` e renderiza os floors; botão "Criar floor" (pede um nome via `prompt`/input e chama `floors.create(name)`, re-lista); por floor, botões "Land" (`floors.land(id)`, mostra o resultado ok/conflito) e "Remover" (`floors.remove(id)`, re-lista). Design mínimo (polish é Fase 13).

- [ ] **Step 3: Atribuir terminal a floor + spawn com floorId**

No `TerminalFlowNode` header, um pequeno `<select>` (`nogr`/`nodrag`) com os floors disponíveis (via `floors.list`) + "sem floor", ligado a `updateTerminalFloor`. `TerminalNode`: passar `data.floorId` no `pty.spawn({..., floorId })`. (Um terminal já spawnado não muda de cwd; a atribuição vale para o próximo spawn — documentar.)

- [ ] **Step 4: env.d.ts + typecheck + build**

Adicionar os tipos da API `floors` ao `OrkestraApi`/`env.d.ts`. `npm test && npm run typecheck && npm run build` verdes.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: UI de floors + atribuir terminal a floor (Fase 8)"`

- [ ] **Step 6: CHECKPOINT VISUAL (humano — CRÍTICO, usar um repo git de teste, não um importante)** — `npm run dev`. (a) No painel de floors, "Criar floor" → escolher um **repo git de teste** → um floor aparece (um worktree é criado em `~/.orkestra/floors/<id>`). (b) Criar um terminal, atribuí-lo ao floor; no terminal, `pwd` mostra o caminho do worktree; criar um arquivo + `git add/commit`. (c) "Land" no painel → o commit aterrissa no repo base (verificar com `git log` no repo base). (d) "Remover" → o worktree some (`git worktree list` no repo base não o mostra). *(Humano; o implementer para no build. ATENÇÃO: operações git reais — validar com um repo descartável.)*

---

## Notas de risco
- **`land` com conflito:** retorna `{ok:false, output}` sem resolver; o worktree e a branch permanecem intactos p/ o usuário resolver manualmente (`git -C <repo> merge --abort` se quiser desistir). Nunca forçamos.
- **`git worktree` e artefatos não-versionados** (node_modules): não são clonados pelo worktree (é uma checkout da árvore versionada) — comportamento esperado do git; documentar que o floor precisa de `npm install` próprio se aplicável (spec §12).
- **Persistência de floors após restart:** `loadPersisted` recarrega o `floors.json`; se um worktree foi removido fora do app, `land`/`remove` desse floor falharão graciosamente (git retorna erro capturado).
- **`cwd` só no spawn:** atribuir um floor a um terminal já rodando não muda o cwd dele; vale para o próximo terminal criado com aquele floor (MVP).
- **Não tocamos `push`/`reset`/`rebase`/`--force`-merge** — só `worktree add/remove` e `merge` simples.
