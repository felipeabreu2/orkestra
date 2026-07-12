# Orkestra — Fase 19 (Árvore de Arquivos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Um **nó explorador de arquivos** no canvas: mostra a estrutura de pastas de um diretório (por padrão a pasta do projeto ativo), permite navegar (expandir/colapsar), vê o **status git** de cada arquivo, e faz **preview** do conteúdo ao clicar. Um explorador de arquivos padrão (como o de qualquer IDE), com nossa própria implementação.

**Architecture:** Um serviço no **main** lê o FS e o git via IPC (`filetree:list/read/gitStatus`) — usando `node:fs/promises` e `execFile('git', …)` (nunca shell). No **renderer**, um `FileTreeNode` (novo tipo de nó) renderiza a árvore **lazy** (só lê um diretório quando expandido), sobrepõe badges de status git, e mostra o conteúdo de um arquivo num painel de preview. O root default é o `cwd` do projeto ativo (Fase 17); persiste em `data.rootPath`.

**Tech Stack:** `node:fs/promises`, `node:child_process` (execFile, só main). Vitest (serviço FS/git testável com tmpdir real).

## Global Constraints

- Renderer/preload NÃO importam `fs`/`http`/`node-pty`/`child_process` — toda leitura de FS/git no main via IPC.
- `git` só via `execFile('git', argsArray, {cwd})` (sem shell). Leitura apenas (nenhuma escrita/mutação de arquivos ou git nesta fase).
- Preview de arquivo com **cap de tamanho** (ex.: 256 KB) e detecção de binário (não despejar bytes crus).
- Zero regressão a terminais/notas/portais/projetos/grupos/palette. Nomenclatura sem marcas de terceiros.

---

### Task 1: Serviço de arquivos no main + IPC (TDD)

**Files:**
- Create: `src/main/filetree/FileTreeService.ts` (+ `.test.ts`), `src/main/filetree/registerFileTreeIpc.ts` (+ `.test.ts`), `src/shared/filetree.ts` (tipos)
- Modify: `src/main/index.ts`, `src/preload/index.ts`

**Interfaces:**
- Produces:
  - `interface FileEntry { name: string; path: string; isDir: boolean }` (em `src/shared/filetree.ts`).
  - `class FileTreeService { list(dir: string): Promise<FileEntry[]>; read(path: string): Promise<{ content: string; truncated: boolean; binary: boolean }>; gitStatus(dir: string): Promise<Record<string, string>> }`.
  - IPC `filetree:list` / `filetree:read` / `filetree:gitStatus` → `window.orkestra.filetree.*`.

- [ ] **Step 1: `FileTreeService` test (falha primeiro, tmpdir real)**

`FileTreeService.test.ts` — cria um tmpdir com subpastas/arquivos e (num teste) um repo git:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'; import { join } from 'node:path'
import { FileTreeService } from './FileTreeService'

describe('FileTreeService', () => {
  let dir: string; const svc = new FileTreeService()
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ork-ft-'))
    mkdirSync(join(dir, 'src')); writeFileSync(join(dir, 'README.md'), '# hi\n'); writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1\n')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('list devolve pastas antes de arquivos, ordenado, com isDir', async () => {
    const e = await svc.list(dir)
    expect(e[0]).toMatchObject({ name: 'src', isDir: true })
    expect(e.some((x) => x.name === 'README.md' && !x.isDir)).toBe(true)
  })
  it('read devolve o conteúdo de um arquivo de texto', async () => {
    const r = await svc.read(join(dir, 'README.md'))
    expect(r.content).toContain('# hi'); expect(r.binary).toBe(false)
  })
  it('read marca truncated quando excede o cap', async () => {
    writeFileSync(join(dir, 'big.txt'), 'x'.repeat(300 * 1024))
    const r = await svc.read(join(dir, 'big.txt'))
    expect(r.truncated).toBe(true); expect(r.content.length).toBeLessThanOrEqual(256 * 1024)
  })
  it('gitStatus vazio p/ dir sem git; reporta modificados num repo', async () => {
    expect(await svc.gitStatus(dir)).toEqual({})
    const g = (a: string[]) => execFileSync('git', a, { cwd: dir })
    g(['init', '-q']); g(['config', 'user.email', 't@t']); g(['config', 'user.name', 't']); g(['add', '.']); g(['commit', '-qm', 'i'])
    writeFileSync(join(dir, 'README.md'), '# changed\n')
    const st = await svc.gitStatus(dir)
    expect(st['README.md']).toBeTruthy() // 'M'
  })
})
```

- [ ] **Step 2: Implementar `FileTreeService.ts`**

`list(dir)`: `readdir(dir, {withFileTypes:true})` → mapear `{name, path: join(dir,name), isDir: dirent.isDirectory()}`; ordenar (dirs primeiro, depois alfabético case-insensitive). `read(path)`: `stat` p/ tamanho; ler até `MAX=256*1024` bytes; detectar binário (presença de byte NUL nos primeiros ~8KB) → `binary:true`, `content:''`; `truncated = size > MAX`. `gitStatus(dir)`: `execFile('git', ['-C', dir, 'status', '--porcelain'])`; se falhar (não é repo) → `{}`; senão parsear cada linha `XY path` → `{ [path]: status.trim() }` (o `git status --porcelain` dá o path relativo ao repo). Usar `promisify(execFile)`.

- [ ] **Step 3: `registerFileTreeIpc` (TDD) + preload**

`registerFileTreeIpc(ipcMain, svc)`: `filetree:list`→`svc.list(dir)`, `filetree:read`→`svc.read(path)`, `filetree:gitStatus`→`svc.gitStatus(dir)`. Testar com `ipcMain` fake. Em `main/index.ts`: `const fileTreeService = new FileTreeService(); registerFileTreeIpc(ipcMain, fileTreeService)`. Preload: `filetree: { list, read, gitStatus }` via `ipcRenderer.invoke`.

- [ ] **Step 4: Testes + typecheck + build** — verdes.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: servico de arvore de arquivos no main (list/read/gitStatus) + IPC (Fase 19)"`

---

### Task 2: `FileTreeNode` no canvas + preview + criar via toolbar (+ checkpoint)

**Files:**
- Create: `src/renderer/src/components/FileTreeNode.tsx` (+ `.css`)
- Modify: `src/renderer/src/store/canvasStore.ts` (+ `.test.ts`), `src/renderer/src/components/Canvas.tsx` (nodeTypes + botão), `src/renderer/src/env.d.ts` (se preciso)

**Interfaces:**
- Consumes: `window.orkestra.filetree.*` (Task 1); `window.orkestra.projects.list()` (p/ o cwd default).
- Produces: store `addFileTreeNode(position?, opts?: { rootPath?: string })` (nó `type:'filetree'`, `data:{ rootPath }`); `updateFileTreeRoot(id, rootPath)`.

- [ ] **Step 1: Store `addFileTreeNode` (TDD)** — espelhar `addPortalNode`: `addFileTreeNode(position?, opts?)` cria `{ id:'filetree-<uuid>', type:'filetree', position, width:300, height:360, data:{ name:'Arquivos', rootPath: opts?.rootPath } }`; `updateFileTreeRoot(id, rootPath)`. Teste: cria nó `filetree` com o rootPath.

- [ ] **Step 2: `FileTreeNode.tsx`** — o nó (React Flow custom node, header + corpo, `nodrag nowheel` na área de scroll):
  - No mount: se `data.rootPath` ausente, buscar o cwd do projeto ativo (`projects.list()` → o projeto `activeId` → `cwd`) e usá-lo (ou mostrar "escolher pasta" chamando `projects.pickDirectory()` reutilizado, OU um botão). Guardar em estado local a árvore.
  - Renderizar a árvore **lazy**: raiz = `filetree:list(root)`; cada pasta com um triângulo expand/collapse (ao expandir, `filetree:list(subdir)` e cachear os filhos em estado); indentação por profundidade. Arquivos como linhas clicáveis.
  - **Git status**: no mount + um botão "atualizar", `filetree:gitStatus(root)`; para cada arquivo cujo caminho relativo bate, mostrar uma marca/cor (M=amarelo `--warn`, A/?=verde `--ok`, D=vermelho `--err`).
  - **Preview**: clicar num arquivo chama `filetree:read(path)`; mostrar o conteúdo num painel (dentro do nó ou expandindo) em `--font-mono`, `nowheel` p/ rolar; se `binary`, mostrar "arquivo binário"; se `truncated`, um aviso "(truncado)". Um botão "copiar caminho" (clipboard).
  - Header: o `rootPath` (basename) + um botão p/ trocar a pasta (`projects.pickDirectory()` → `updateFileTreeRoot`). `NodeResizer` como os outros nós.
- [ ] **Step 3: Registrar no `Canvas.tsx`** — `nodeTypes.filetree = FileTreeNode`; um botão "+ Arquivos" na toolbar → `addFileTreeNode()`.

- [ ] **Step 4: env.d.ts + testes + typecheck + build** — verdes; persistência do `data.rootPath` (serialize genérico — confirmar).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: FileTreeNode (arvore de arquivos no canvas) + preview + git status (Fase 19)"`

- [ ] **Step 6: CHECKPOINT VISUAL (humano)** — `npm run dev`. "+ Arquivos" cria o nó; ele lista a pasta do projeto ativo; expandir pastas; arquivos modificados marcados (num repo git); clicar num arquivo mostra o preview; trocar a pasta pelo header. Fechar/reabrir mantém o nó e sua pasta.

---

## Notas de risco
- **Diretórios enormes** (ex.: `node_modules`): a listagem é lazy (só ao expandir), então não trava; mas expandir `node_modules` lista milhares — aceitável no MVP (um filtro/ignore pode vir depois).
- **Preview de binário/gigante:** cap de 256 KB + detecção de NUL evita despejar bytes; um viewer de imagem/PDF é refinamento futuro (o mapa cita, mas fora do MVP).
- **gitStatus paths:** `git status --porcelain` dá paths relativos ao root do repo, não ao `dir` passado se `dir` for um subdiretório — no MVP o root do FileTree é o cwd do projeto (tipicamente a raiz do repo); documentar a limitação p/ subdirs.
- **Segurança:** só leitura; paths vêm da UI 1st-party (o usuário navegando a partir do root que escolheu). `execFile` (sem shell). Sem escrita nesta fase.
- **Drag arquivo→terminal** (dar contexto ao agente) e **editor embutido** são refinamentos de ondas futuras — este MVP entrega navegar + git status + preview.
