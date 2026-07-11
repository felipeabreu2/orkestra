# Orkestra — Fase 17 (Projeto vinculado a uma pasta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cada projeto pode ser vinculado a uma **pasta** (diretório). Ao criar um projeto, o usuário escolhe a pasta; a partir daí, todo **terminal aberto naquele projeto abre já nessa pasta** (o `cwd` do shell). Projetos sem pasta abrem no HOME (comportamento atual).

**Architecture:** O tipo `Project` ganha um `cwd?: string`. O `ProjectManager` guarda/edita o `cwd` por projeto e expõe o projeto ativo. O handler `pty:spawn` resolve o `cwd` **do projeto ativo** (via um resolver late-bound), então um terminal spawnado depois de trocar de projeto usa a pasta do projeto certo. A escolha da pasta usa o diálogo nativo do Electron (`dialog.showOpenDialog({properties:['openDirectory']})`), exposto por IPC.

**Tech Stack:** sem deps novas. Vitest (ProjectManager testável com tmpdir).

## Global Constraints

- Renderer não importa `fs`/`http`/`node-pty`/`child_process`; o diálogo roda no main.
- `cwd` resolvido no momento do spawn (late-bound) — trocar de projeto muda a pasta dos próximos terminais.
- Projeto sem `cwd` → terminal no HOME (o `PtyManager.spawn` já tem `?? process.env.HOME` de fallback).
- Escrita atômica do índice (já existente). Nomenclatura sem marcas do Maestri.

---

### Task 1: `cwd` no projeto + spawn na pasta do projeto ativo (TDD)

**Files:**
- Modify: `src/shared/project.ts`, `src/main/projects/ProjectManager.ts` (+ `.test.ts`), `src/main/projects/registerProjectIpc.ts` (+ `.test.ts`), `src/main/pty/registerPtyIpc.ts` (+ `.test.ts`), `src/main/index.ts`, `src/preload/index.ts`

**Interfaces:**
- Produces:
  - `Project { id: string; name: string; cwd?: string }` (`src/shared/project.ts`).
  - `ProjectManager.create(name: string, cwd?: string): Project`; `ProjectManager.setCwd(id: string, cwd: string): void`; `ProjectManager.getActive(): Project | undefined` (retorna o projeto ativo, com `cwd`).
  - IPC: `projects:create` (agora `(name, cwd?)`), `projects:setCwd` `(id, cwd)`, `projects:pickDirectory` (abre o diálogo → `string | null`).
  - `registerPtyIpc(...)` ganha um resolver `getProjectCwd?: () => string | undefined`; no spawn: `const cwd = o.cwd ?? getProjectCwd?.()` (o fallback HOME segue no `PtyManager.spawn`).

- [ ] **Step 1: `ProjectManager` cwd (TDD)**

Em `ProjectManager.test.ts`, adicionar:
```ts
  it('create aceita um cwd e getActive/switch o expõem; setCwd atualiza', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const p = pm.create('Web', '/Users/x/Documents/Apps')
    expect(pm.list().projects.find((x) => x.id === p.id)?.cwd).toBe('/Users/x/Documents/Apps')
    pm.switch(p.id)
    expect(pm.getActive()?.cwd).toBe('/Users/x/Documents/Apps')
    pm.setCwd(p.id, '/Users/x/outro')
    expect(pm.getActive()?.cwd).toBe('/Users/x/outro')
  })
```
Implementar: `Project.cwd` opcional; `create(name, cwd?)` grava `cwd` no índice; `setCwd(id, cwd)` atualiza + persiste; `getActive()` lê o índice e retorna o `Project` com `activeId` (ou undefined). Manter tudo o mais igual.

- [ ] **Step 2: `registerProjectIpc` — create(name,cwd) + setCwd + pickDirectory (TDD)**

`registerProjectIpc(ipcMain, pm, pickDirectory?)` — `pickDirectory` injetável (produção: `dialog.showOpenDialog`; teste: fake retornando um path). Handlers: `projects:create` → `pm.create(name, cwd)`; `projects:setCwd` → `pm.setCwd(id, cwd)`; `projects:pickDirectory` → `await pickDirectory()` (retorna `string | null`). Testar com `ipcMain` fake que os handlers chamam `pm`/`pickDirectory` corretamente.

- [ ] **Step 3: `registerPtyIpc` — cwd do projeto ativo (TDD)**

Adicionar o parâmetro opcional `getProjectCwd?: () => string | undefined` (após os hooks existentes, retrocompatível). No handler `pty:spawn`: `const cwd = o.cwd ?? getProjectCwd?.()` (em vez de só `o.cwd`). Testar: com `getProjectCwd` retornando `/tmp/proj`, um spawn sem `o.cwd` chama `ptyManager.spawn` com `cwd:'/tmp/proj'`; com `o.cwd` presente, `o.cwd` vence; sem nada, `undefined` (o PtyManager aplica o HOME fallback).

- [ ] **Step 4: Fiar `main/index.ts` (reordenar) + preload + dialog**

Mover a criação do `projectManager` (`new ProjectManager(...); bootstrap()`) para **antes** da chamada `registerPtyIpc(...)`. Passar `getProjectCwd: () => projectManager.getActive()?.cwd` ao `registerPtyIpc`. `registerProjectIpc(ipcMain, projectManager, async () => { const r = await dialog.showOpenDialog({ properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0] })`. Preload: `projects.create(name, cwd?)`, `projects.setCwd(id, cwd)`, `projects.pickDirectory()`.

- [ ] **Step 5: Testes + typecheck + build** — verdes; `out/orq/bin.js` emitido.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: projeto vinculado a uma pasta (cwd) + terminal abre na pasta do projeto ativo (Fase 17)"`

---

### Task 2: UI — escolher/exibir a pasta do projeto + checkpoint

**Files:**
- Modify: `src/renderer/src/components/ProjectsSidebar.tsx` (+ `.css`), `src/renderer/src/env.d.ts` (se preciso)

**Interfaces:**
- Consumes: `window.orkestra.projects.{create(name,cwd?), setCwd(id,cwd), pickDirectory()}` (Task 1).

- [ ] **Step 1: Criar projeto com pasta**

No "+ Novo projeto" do `ProjectsSidebar`: após pedir o nome, chamar `const cwd = await window.orkestra.projects.pickDirectory()` (abre o diálogo nativo); depois `await window.orkestra.projects.create(name, cwd ?? undefined)` e trocar para ele. Se o usuário cancelar o diálogo, criar o projeto **sem** pasta (cwd undefined → terminais no HOME) — não abortar a criação. try/catch com mensagem amigável.

- [ ] **Step 2: Definir/trocar a pasta de um projeto existente**

Por linha de projeto, um pequeno botão "pasta" (ícone 📁 ou "pasta") que faz `const cwd = await pickDirectory(); if (cwd) await projects.setCwd(id, cwd)` e re-lista. Exibir a pasta atual do projeto de forma discreta (o **basename** do path, ex.: "Apps") como subtítulo/tooltip da linha; sem pasta → nada ou "sem pasta".

- [ ] **Step 3: env.d.ts + typecheck + build** — verdes.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: UI p/ escolher e exibir a pasta do projeto na sidebar (Fase 17)"`

- [ ] **Step 5: CHECKPOINT VISUAL (humano)** — `npm run dev`. "+ Novo projeto" → digitar nome → o diálogo de pasta abre → escolher `~/Documents/Apps` (por ex.). No projeto, abrir um terminal → o shell já está em `~/Documents/Apps` (`pwd` confirma). Trocar de projeto → terminais novos abrem na pasta do projeto ativo. Botão "pasta" numa linha muda a pasta. O "Projeto 1" (sem pasta) abre no HOME.

---

## Notas de risco
- **Projetos existentes sem `cwd`:** abrem no HOME (fallback) — o usuário pode definir a pasta pelo botão. Sem migração forçada.
- **Terminais já abertos não mudam de cwd** ao trocar a pasta do projeto — só os próximos spawns (o cwd é fixado no spawn). Consistente com o comportamento de shell.
- **Pasta inexistente/sem permissão:** se o `cwd` do projeto apontar para uma pasta que não existe mais, o `node-pty` falha ao spawnar; o `PtyManager` já lida com o erro do spawn. Um passo futuro pode validar o path e cair no HOME. Documentar.
- **Reordenar `index.ts`:** garantir que mover o `projectManager` para antes do `registerPtyIpc` não quebra outras dependências de ordem (o `registerPersistenceIpc`/`registerProjectIpc` continuam depois; o `getProjectCwd` é late-bound, então só precisa do `projectManager` existir).
