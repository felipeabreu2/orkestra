# Orkestra — Fase 15 (Projetos + limpeza de UI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Suportar **múltiplos projetos** — cada um com seu próprio canvas (terminais/notas/portais) — e trocar rápido entre eles por um **menu na lateral esquerda**. (Task 1, já concluída: remover os painéis de Rotinas e Floors da UI.)

**Architecture:** Um `ProjectManager` (main) guarda um índice de projetos (`userData/projects.json`: `{ projects:[{id,name}], activeId }`) e o canvas de cada projeto num arquivo próprio (`userData/projects/<id>.json`). A persistência do canvas (`persistence:load/save`, já existente) passa a operar sobre o **projeto ativo**. O renderer ganha um `ProjectsSidebar` (esquerda) e, ao trocar de projeto: faz flush do canvas atual, pede o canvas do novo projeto e re-hidrata o store — os nós do projeto anterior desmontam (PTYs morrem, recriados ao voltar, como num reload). Migração: no primeiro boot, o `canvas.json` legado vira o "Projeto 1".

**Tech Stack:** sem deps novas. Vitest (ProjectManager testável com tmpdir real).

## Global Constraints

- Renderer não importa `fs`/`http`/`node-pty`/`child_process`. Toda persistência no main.
- Trocar de projeto = trocar todo o estado do canvas; os PTYs do projeto anterior morrem (consistente com o comportamento de reload — PTYs nunca foram persistidos).
- Escrita de arquivos atômica (tmp+rename), como o `CanvasPersistence`.
- Sempre existe ≥1 projeto (remover o último recria um default). Nomenclatura sem marcas do Maestri.

---

### Task 2: `ProjectManager` (main) + IPC + persistência por projeto (TDD)

**Files:**
- Create: `src/main/projects/ProjectManager.ts` (+ `.test.ts`), `src/main/projects/registerProjectIpc.ts` (+ `.test.ts`), `src/shared/project.ts` (tipos)
- Modify: `src/main/persistence/registerPersistenceIpc.ts`, `src/main/index.ts`, `src/preload/index.ts`

**Interfaces:**
- Produces:
  - `interface Project { id: string; name: string }`; `interface ProjectIndex { projects: Project[]; activeId: string }` (em `src/shared/project.ts`).
  - `class ProjectManager { constructor(baseDir: string); bootstrap(): void; list(): ProjectIndex; create(name: string): Project; switch(id: string): CanvasSnapshot | null; rename(id: string, name: string): void; remove(id: string): { activeId: string; snapshot: CanvasSnapshot | null }; loadActiveCanvas(): CanvasSnapshot | null; saveActiveCanvas(snapshot: CanvasSnapshot): void }`
  - IPC: `projects:list`, `projects:create`, `projects:switch`, `projects:rename`, `projects:remove` → `window.orkestra.projects.*`.

- [ ] **Step 1: `ProjectManager` test (falha primeiro, tmpdir real)**

`ProjectManager.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProjectManager } from './ProjectManager'

describe('ProjectManager', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'orkestra-proj-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('bootstrap cria um projeto default e migra o canvas.json legado', () => {
    writeFileSync(join(dir, 'canvas.json'), JSON.stringify({ version: 2, nodes: [{ id: 'n1' }], edges: [] }))
    const pm = new ProjectManager(dir); pm.bootstrap()
    const idx = pm.list()
    expect(idx.projects).toHaveLength(1)
    expect(idx.activeId).toBe(idx.projects[0].id)
    expect(pm.loadActiveCanvas()?.nodes).toHaveLength(1) // migrado
  })

  it('create adiciona um projeto (canvas vazio) sem trocar o ativo', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const first = pm.list().activeId
    const p = pm.create('Backend')
    expect(pm.list().projects.some((x) => x.id === p.id)).toBe(true)
    expect(pm.list().activeId).toBe(first) // create não troca
  })

  it('switch troca o ativo e devolve o canvas do novo projeto', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const p = pm.create('B')
    pm.saveActiveCanvas({ version: 2, nodes: [{ id: 'a' } as never], edges: [] }) // salva no projeto ATIVO (o default)
    const snap = pm.switch(p.id)
    expect(pm.list().activeId).toBe(p.id)
    expect(snap?.nodes ?? []).toHaveLength(0) // projeto B começa vazio
  })

  it('rename e remove funcionam; remover o ativo troca p/ outro', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const a = pm.list().activeId
    const b = pm.create('B')
    pm.rename(b.id, 'B2'); expect(pm.list().projects.find((x) => x.id === b.id)?.name).toBe('B2')
    const r = pm.remove(a) // remove o ativo
    expect(pm.list().projects.some((x) => x.id === a)).toBe(false)
    expect(r.activeId).toBe(b.id)
  })
})
```

- [ ] **Step 2: Implementar `ProjectManager.ts`**

Estrutura: `projects.json` (índice) e `projects/<id>.json` (canvas) sob `baseDir`. Escrita atômica (writeFileSync tmp + renameSync). `bootstrap()`: se `projects.json` não existe → cria `projects/` dir, gera um `Project` default `{ id: randomUUID(), name: 'Projeto 1' }`, e se `baseDir/canvas.json` (legado) existe, copia seu conteúdo para `projects/<id>.json` (senão canvas vazio), escreve o índice `{ projects:[default], activeId: default.id }`. `list()` lê o índice (com guardas). `create(name)` gera um projeto, escreve seu canvas vazio (`{version:2,nodes:[],edges:[]}`), adiciona ao índice, persiste, retorna. `switch(id)` valida id, seta `activeId`, persiste índice, retorna `loadActiveCanvas()`. `rename` altera o name. `remove(id)` remove do índice + apaga `projects/<id>.json`; se era o ativo, seta activeId p/ o primeiro restante; se ficou vazio, recria um default; retorna `{activeId, snapshot: loadActiveCanvas()}`. `loadActiveCanvas`/`saveActiveCanvas` operam sobre `projects/<activeId>.json` (mesma validação/atomicidade do `CanvasPersistence`).

- [ ] **Step 3: `registerProjectIpc` (TDD) + persistência por projeto**

`registerProjectIpc(ipcMain, pm)`: `projects:list`→`pm.list()`, `projects:create`→`pm.create(name)`, `projects:switch`→`pm.switch(id)`, `projects:rename`→`pm.rename(id,name)`, `projects:remove`→`pm.remove(id)`. Testar com `ipcMain` fake. **`registerPersistenceIpc`**: mudar para receber o `ProjectManager` (ou um `{load,save}` que delega a `pm.loadActiveCanvas`/`saveActiveCanvas`) em vez do `CanvasPersistence` fixo — `persistence:load`→`pm.loadActiveCanvas()`, `persistence:save`→`pm.saveActiveCanvas(snap)`. Manter a assinatura retrocompatível se fácil (aceitar um objeto com `load`/`save`).

- [ ] **Step 4: Fiar `main/index.ts` + preload**

`const projectManager = new ProjectManager(app.getPath('userData')); projectManager.bootstrap();` — substituir o `new CanvasPersistence(userData/canvas.json)` + `registerPersistenceIpc(ipcMain, persistence)` por `registerPersistenceIpc(ipcMain, projectManager)` (delegando ao ativo) e `registerProjectIpc(ipcMain, projectManager)`. Preload: adicionar `projects: { list, create, switch, rename, remove }` via `ipcRenderer.invoke`.

- [ ] **Step 5: Testes + typecheck + build** — verdes.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: ProjectManager (multi-projeto) + IPC + persistencia por projeto (Fase 15)"`

---

### Task 3: `ProjectsSidebar` (esquerda) + troca de projeto + layout + checkpoint

**Files:**
- Create: `src/renderer/src/components/ProjectsSidebar.tsx`, `src/renderer/src/components/ProjectsSidebar.css`
- Modify: `src/renderer/src/App.tsx` (layout flex: sidebar + canvas), `src/renderer/src/components/Canvas.tsx` (mover o wordmark p/ a sidebar; opcional), `src/renderer/src/env.d.ts` (tipos da API projects)

**Interfaces:**
- Consumes: `window.orkestra.projects.*` (Task 2); `window.orkestra.persistence.save` + `useCanvasStore.hydrate/serialize`.

- [ ] **Step 1: `ProjectsSidebar.tsx`**

Uma barra vertical fixa à esquerda (~200px, full height, `background:var(--bg-1)`, borda direita). No topo: o `<Logo/>` + "Orkestra" (wordmark movido p/ cá). Abaixo: a lista de projetos (`projects.list()` no mount → estado local `{projects, activeId}`), cada linha clicável (ativo destacado com `--accent-weak` + barra de acento). No rodapé: botão "+ Novo projeto" (pede um nome via input inline ou `window.prompt`, `projects.create`, re-lista e troca p/ ele). Cada projeto: duplo-clique renomeia (input inline → `projects.rename`), um botão de remover (com o confirm inline de 2 cliques, como o antigo FloorsPanel) que chama `projects.remove` e aplica o `{activeId,snapshot}` retornado. Erros em try/catch.
- **Trocar de projeto** (função compartilhada): `window.orkestra.persistence.save(useCanvasStore.getState().serialize())` (flush do atual) → `const snap = await window.orkestra.projects.switch(id)` → `useCanvasStore.getState().hydrate(snap ?? { version: 2, nodes: [], edges: [] })` → atualizar `activeId` local. (O `hydrate` desmonta os nós antigos e monta os novos.)

- [ ] **Step 2: Layout em `App.tsx`**

Envolver num container `display:flex`: `<ProjectsSidebar/>` (largura fixa) + um wrapper `flex:1; position:relative` com `<Canvas/>`. Garantir que o `ReactFlowProvider` (se está no App) continua envolvendo o `Canvas` (o CommandPalette usa `useReactFlow`). O `Canvas` usa `width:100%`/`height:100%` do wrapper em vez de `100vw/100vh` (ajustar o `<div>` raiz do Canvas para preencher o wrapper, não a viewport toda — senão a sidebar é coberta).

- [ ] **Step 3: Wordmark**

Remover o `.ork-wordmark` do canto do canvas (`Canvas.tsx`) — a marca agora vive no topo da sidebar. (Isso também resolve a antiga sobreposição wordmark/Controls.)

- [ ] **Step 4: env.d.ts + typecheck + build** — tipos da API `projects` fluem via `OrkestraApi`; `npm test` + `npm run typecheck` + `npm run build` verdes.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: ProjectsSidebar (menu esquerdo) + troca de projeto + layout (Fase 15)"`

- [ ] **Step 6: CHECKPOINT VISUAL (humano)** — `npm run dev`. À esquerda, o menu de projetos com "Projeto 1" (migrado do canvas atual). Criar terminais/notas; clicar "+ Novo projeto" → um canvas vazio; criar coisas nele; alternar entre os projetos pelo menu → cada um mantém seu próprio canvas. Renomear e remover projetos. Fechar/reabrir o app → o projeto ativo e todos persistem.

---

## Notas de risco
- **Troca de projeto mata os PTYs do projeto anterior:** intencional (PTYs nunca foram persistidos; recriados shells novos ao voltar, layout restaurado). Um "manter terminais vivos em background por projeto" seria uma melhoria futura.
- **Migração única:** o `canvas.json` legado é migrado só no primeiro `bootstrap` (quando não há `projects.json`). Depois, ele fica órfão (inofensivo) — pode ser removido num passo futuro.
- **Autosave e projeto ativo:** o `useCanvasPersistence` salva no ativo (via `persistence:save`→`saveActiveCanvas`); a troca faz flush antes de trocar, então nada se perde.
- **Sidebar cobrindo o canvas:** garantir que o `Canvas` preenche o wrapper flex (não `100vw`), senão a sidebar fica sob o canvas.
- **Backend de Rotinas/Floors** segue dormente (removido só da UI na Task 1); pode ser removido por completo num passo futuro se o usuário confirmar.
