# Orkestra — Fase 3 (Persistência do canvas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O layout do canvas **sobrevive a fechar/reabrir** o app: autosave ao mudar (debounced), load ao abrir. Os terminais são recriados no layout salvo com shells novos (o processo não é serializável — só o layout).

**Architecture:** Um tipo compartilhado `CanvasSnapshot` (`src/shared/`) descreve o estado persistível (nós: id/type/position/width/height/data). O `canvasStore` ganha `serialize()`/`hydrate()`. O **main** grava/lê um JSON (`userData/canvas.json`) via `CanvasPersistence` (fs, com escrita atômica e load resiliente); o renderer fala com ele por IPC (`window.orkestra.persistence`), NUNCA tocando o filesystem direto. Um hook `useCanvasPersistence` carrega no mount e faz autosave debounced. Dimensões do nó passam a viver em `width`/`height` top-level (fonte única — resolve a pendência do review da Fase 2).

**Tech Stack:** sem dependências novas (fs do Node no main; IPC; React). Vitest.

## Global Constraints

- Plataforma: Electron/Node/TS, Intel/macOS 12.
- Renderer **NÃO** toca filesystem nem importa `fs`/`node-pty`; persistência só via `window.orkestra.persistence` (IPC). Segurança do main inalterada (`contextIsolation`/`sandbox`/`nodeIntegration:false`).
- **Terminais/ptys NÃO são serializados** — só o layout (posição/tamanho/metadata). Ao carregar, nós de terminal são recriados (shells novos).
- Nomenclatura: **não** usar marcas do Maestri.
- Escrita de arquivo **atômica** (tmp + rename); load **resiliente** (arquivo ausente ou JSON inválido → `null`, nunca crash).
- Dimensão do nó: **fonte única em `width`/`height` top-level** (não `style`).

---

### Task 1: Tipo `CanvasSnapshot` + `serialize`/`hydrate` no store + dimensões unificadas (TDD)

**Files:**
- Create: `src/shared/canvasSnapshot.ts`
- Modify: `tsconfig.node.json`, `tsconfig.web.json` (incluir `src/shared`), `src/renderer/src/store/canvasStore.ts`, `src/renderer/src/store/canvasStore.test.ts`

**Interfaces:**
- Produces:
  - `interface PersistedNode { id: string; type: string; position: { x: number; y: number }; width: number; height: number; data: Record<string, unknown> }`
  - `interface CanvasSnapshot { version: 1; nodes: PersistedNode[] }`
  - store gains `serialize(): CanvasSnapshot` and `hydrate(snapshot: CanvasSnapshot): void`; `addTerminalNode` now seeds `width: 480, height: 320` (top-level, no `style`).

- [ ] **Step 1: Criar os tipos compartilhados `src/shared/canvasSnapshot.ts`**

```ts
export interface PersistedNode {
  id: string
  type: string
  position: { x: number; y: number }
  width: number
  height: number
  data: Record<string, unknown>
}

export interface CanvasSnapshot {
  version: 1
  nodes: PersistedNode[]
}
```

- [ ] **Step 2: Incluir `src/shared` nos dois tsconfig**

Em `tsconfig.node.json`, mudar o `include` para:
```json
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "electron.vite.config.ts"]
```
Em `tsconfig.web.json`, mudar o `include` para:
```json
  "include": ["src/renderer/src/**/*", "src/preload/index.ts", "src/shared/**/*"]
```

- [ ] **Step 3: Escrever os testes que falham (store serialize/hydrate + dimensões)**

Substituir o teste `'addTerminalNode adiciona um nó de terminal na posição dada'` para asserir `width`/`height` (não `style`) e adicionar testes de serialize/hydrate. Em `src/renderer/src/store/canvasStore.test.ts`, ajustar/adicionar:
```ts
  it('addTerminalNode usa width/height top-level (fonte única)', () => {
    useCanvasStore.getState().addTerminalNode({ x: 10, y: 20 })
    const { nodes } = useCanvasStore.getState()
    expect(nodes[0].type).toBe('terminal')
    expect(nodes[0].position).toEqual({ x: 10, y: 20 })
    expect(nodes[0].width).toBe(480)
    expect(nodes[0].height).toBe(320)
    expect(nodes[0].data).toEqual({})
  })

  it('serialize captura id/type/position/width/height/data de cada nó', () => {
    useCanvasStore.getState().addTerminalNode({ x: 5, y: 6 })
    const snap = useCanvasStore.getState().serialize()
    expect(snap.version).toBe(1)
    expect(snap.nodes).toHaveLength(1)
    const n = snap.nodes[0]
    expect(n.type).toBe('terminal')
    expect(n.position).toEqual({ x: 5, y: 6 })
    expect(n.width).toBe(480)
    expect(n.height).toBe(320)
    expect(n.data).toEqual({})
    expect(typeof n.id).toBe('string')
  })

  it('hydrate substitui os nós a partir de um snapshot', () => {
    useCanvasStore.getState().addTerminalNode()
    useCanvasStore.getState().hydrate({
      version: 1,
      nodes: [
        { id: 'terminal-x', type: 'terminal', position: { x: 1, y: 2 }, width: 300, height: 200, data: {} }
      ]
    })
    const { nodes } = useCanvasStore.getState()
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('terminal-x')
    expect(nodes[0].position).toEqual({ x: 1, y: 2 })
    expect(nodes[0].width).toBe(300)
    expect(nodes[0].height).toBe(200)
  })

  it('round-trip serialize→hydrate preserva o layout', () => {
    useCanvasStore.getState().addTerminalNode({ x: 7, y: 8 })
    const snap = useCanvasStore.getState().serialize()
    useCanvasStore.getState().hydrate({ version: 1, nodes: [] })
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
    useCanvasStore.getState().hydrate(snap)
    const n = useCanvasStore.getState().nodes[0]
    expect(n.position).toEqual({ x: 7, y: 8 })
    expect(n.width).toBe(480)
    expect(n.height).toBe(320)
  })
```
(Manter os testes existentes de ids únicos, removeNode selectivity e onNodesChange.)

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run src/renderer/src/store/canvasStore.test.ts`
Expected: FAIL (`serialize`/`hydrate` não existem; `nodes[0].width` é `undefined` pois ainda usa `style`).

- [ ] **Step 5: Implementar no `canvasStore.ts`**

```ts
import { create } from 'zustand'
import { applyNodeChanges, type Node, type NodeChange } from '@xyflow/react'
import type { CanvasSnapshot } from '../../../shared/canvasSnapshot'

interface CanvasState {
  nodes: Node[]
  addTerminalNode: (position?: { x: number; y: number }) => void
  removeNode: (id: string) => void
  onNodesChange: (changes: NodeChange[]) => void
  serialize: () => CanvasSnapshot
  hydrate: (snapshot: CanvasSnapshot) => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  addTerminalNode: (position = { x: 80, y: 80 }): void =>
    set((state) => ({
      nodes: [
        ...state.nodes,
        {
          id: `terminal-${crypto.randomUUID()}`,
          type: 'terminal',
          position,
          data: {},
          width: 480,
          height: 320
        }
      ]
    })),
  removeNode: (id): void =>
    set((state) => ({ nodes: state.nodes.filter((n) => n.id !== id) })),
  onNodesChange: (changes): void =>
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),
  serialize: (): CanvasSnapshot => ({
    version: 1,
    nodes: get().nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'terminal',
      position: n.position,
      width: n.width ?? 480,
      height: n.height ?? 320,
      data: (n.data ?? {}) as Record<string, unknown>
    }))
  }),
  hydrate: (snapshot): void =>
    set({
      nodes: snapshot.nodes.map((p) => ({
        id: p.id,
        type: p.type,
        position: p.position,
        data: p.data,
        width: p.width,
        height: p.height
      }))
    })
}))
```
Nota: com `width`/`height` top-level, o `NodeResizer` (que grava nesses campos) e o seed passam a usar a mesma fonte — o serializer lê um só lugar.

- [ ] **Step 6: Rodar e ver passar + suíte + typecheck**

Run: `npx vitest run src/renderer/src/store/canvasStore.test.ts && npm test && npm run typecheck`
Expected: testes do store verdes; suíte completa verde; typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: CanvasSnapshot + serialize/hydrate no store + dimensões top-level (Fase 3)"
```

---

### Task 2: `CanvasPersistence` (main, fs) + IPC + preload

**Files:**
- Create: `src/main/persistence/CanvasPersistence.ts`, `src/main/persistence/CanvasPersistence.test.ts`, `src/main/persistence/registerPersistenceIpc.ts`, `src/main/persistence/registerPersistenceIpc.test.ts`
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/env.d.ts`

**Interfaces:**
- Consumes: `CanvasSnapshot` (Task 1).
- Produces:
  - `class CanvasPersistence { constructor(filePath: string); load(): CanvasSnapshot | null; save(snapshot: CanvasSnapshot): void }`
  - `registerPersistenceIpc(ipcMain, persistence)` — channels `persistence:load` (invoke → `CanvasSnapshot | null`), `persistence:save` (on, snapshot)
  - `window.orkestra.persistence` = `{ load(): Promise<CanvasSnapshot | null>; save(snapshot: CanvasSnapshot): void }`

- [ ] **Step 1: Escrever o teste do `CanvasPersistence` (falha primeiro)**

`src/main/persistence/CanvasPersistence.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { CanvasPersistence } from './CanvasPersistence'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let dir: string
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })
function tmpFile(): string {
  dir = mkdtempSync(join(tmpdir(), 'orkestra-'))
  return join(dir, 'canvas.json')
}

describe('CanvasPersistence', () => {
  it('load retorna null quando o arquivo não existe', () => {
    const p = new CanvasPersistence(tmpFile())
    expect(p.load()).toBeNull()
  })

  it('save depois load faz round-trip do snapshot', () => {
    const p = new CanvasPersistence(tmpFile())
    const snap = { version: 1 as const, nodes: [{ id: 'a', type: 'terminal', position: { x: 1, y: 2 }, width: 300, height: 200, data: {} }] }
    p.save(snap)
    expect(p.load()).toEqual(snap)
  })

  it('load retorna null (sem crash) quando o JSON é inválido', () => {
    const file = tmpFile()
    const p = new CanvasPersistence(file)
    writeFileSync(file, '{ not valid json')
    expect(p.load()).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/main/persistence/CanvasPersistence.test.ts`
Expected: FAIL — `Cannot find module './CanvasPersistence'`.

- [ ] **Step 3: Implementar `CanvasPersistence.ts`**

```ts
import { writeFileSync, readFileSync, renameSync, existsSync } from 'fs'
import type { CanvasSnapshot } from '../../shared/canvasSnapshot'

export class CanvasPersistence {
  constructor(private filePath: string) {}

  load(): CanvasSnapshot | null {
    try {
      if (!existsSync(this.filePath)) return null
      const raw = readFileSync(this.filePath, 'utf-8')
      return JSON.parse(raw) as CanvasSnapshot
    } catch {
      return null
    }
  }

  save(snapshot: CanvasSnapshot): void {
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf-8')
    renameSync(tmp, this.filePath)
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/main/persistence/CanvasPersistence.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Teste do IPC (falha primeiro)**

`src/main/persistence/registerPersistenceIpc.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { registerPersistenceIpc } from './registerPersistenceIpc'

function fakeIpcMain() {
  const handlers = new Map<string, (...a: any[]) => any>()
  const listeners = new Map<string, (...a: any[]) => void>()
  return {
    handle: (ch: string, fn: (...a: any[]) => any) => handlers.set(ch, fn),
    on: (ch: string, fn: (...a: any[]) => void) => listeners.set(ch, fn),
    handlers,
    listeners
  }
}

describe('registerPersistenceIpc', () => {
  it('persistence:load chama persistence.load', async () => {
    const persistence = { load: vi.fn(() => null), save: vi.fn() }
    const ipc = fakeIpcMain()
    registerPersistenceIpc(ipc as any, persistence as any)
    const result = await ipc.handlers.get('persistence:load')!({})
    expect(persistence.load).toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('persistence:save encaminha o snapshot a persistence.save', () => {
    const persistence = { load: vi.fn(), save: vi.fn() }
    const ipc = fakeIpcMain()
    registerPersistenceIpc(ipc as any, persistence as any)
    const snap = { version: 1, nodes: [] }
    ipc.listeners.get('persistence:save')!({}, snap)
    expect(persistence.save).toHaveBeenCalledWith(snap)
  })
})
```

- [ ] **Step 6: Rodar e ver falhar, depois implementar `registerPersistenceIpc.ts`**

Run: `npx vitest run src/main/persistence/registerPersistenceIpc.test.ts` → FAIL (módulo ausente).

```ts
import type { IpcMain } from 'electron'
import type { CanvasPersistence } from './CanvasPersistence'
import type { CanvasSnapshot } from '../../shared/canvasSnapshot'

export function registerPersistenceIpc(ipcMain: IpcMain, persistence: CanvasPersistence): void {
  ipcMain.handle('persistence:load', () => persistence.load())
  ipcMain.on('persistence:save', (_e, snapshot: CanvasSnapshot) => persistence.save(snapshot))
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run src/main/persistence/registerPersistenceIpc.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 8: Fiar no `src/main/index.ts`**

Adicionar os imports e, dentro de `app.whenReady().then(...)`, registrar a persistência (o `app.getPath('userData')` só é válido após ready):
```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { PtyManager } from './pty/PtyManager'
import { nodePtySpawner } from './pty/nodePtySpawner'
import { registerPtyIpc } from './pty/registerPtyIpc'
import { CanvasPersistence } from './persistence/CanvasPersistence'
import { registerPersistenceIpc } from './persistence/registerPersistenceIpc'
```
E dentro do `whenReady` (após `registerPtyIpc(...)`):
```ts
  const persistence = new CanvasPersistence(join(app.getPath('userData'), 'canvas.json'))
  registerPersistenceIpc(ipcMain, persistence)
```
(Manter todo o resto de `index.ts` — `disableHardwareAcceleration`, `killAll`, webPreferences — idêntico.)

- [ ] **Step 9: Expor no preload + tipar**

Em `src/preload/index.ts`, adicionar ao objeto `api` (ao lado de `pty`), e importar o tipo:
```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { CanvasSnapshot } from '../shared/canvasSnapshot'
```
```ts
  persistence: {
    load: (): Promise<CanvasSnapshot | null> => ipcRenderer.invoke('persistence:load'),
    save: (snapshot: CanvasSnapshot): void => ipcRenderer.send('persistence:save', snapshot)
  }
```
(Adicionar essa chave ao objeto `api` existente; `OrkestraApi = typeof api` continua correto. `window.orkestra` já é tipado via `env.d.ts` — nenhuma mudança extra necessária ali, mas confirme que `env.d.ts` importa `OrkestraApi` do preload.)

- [ ] **Step 10: Typecheck + testes + commit**

Run: `npm run typecheck && npm test`
Expected: typecheck limpo; suíte verde (store + persistence + ipc + pty).
```bash
git add -A
git commit -m "feat: CanvasPersistence (fs atômico) + IPC + preload (Fase 3)"
```

---

### Task 3: Load ao iniciar + autosave debounced (renderer)

**Files:**
- Create: `src/renderer/src/hooks/useCanvasPersistence.ts`
- Modify: `src/renderer/src/components/Canvas.tsx`

**Interfaces:**
- Consumes: `window.orkestra.persistence`, `useCanvasStore` (`serialize`, `hydrate`, `nodes`).
- Produces: `useCanvasPersistence()` — carrega o snapshot no mount e faz autosave debounced quando os nós mudam.

- [ ] **Step 1: Criar `useCanvasPersistence.ts`**

```ts
import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/canvasStore'

export function useCanvasPersistence(): void {
  const hydrate = useCanvasStore((s) => s.hydrate)
  const nodes = useCanvasStore((s) => s.nodes)
  const loaded = useRef(false)

  // Carrega o layout salvo uma vez, no mount.
  useEffect(() => {
    let cancelled = false
    window.orkestra.persistence.load().then((snap) => {
      if (cancelled) return
      if (snap) hydrate(snap)
      loaded.current = true
    })
    return () => {
      cancelled = true
    }
  }, [hydrate])

  // Autosave debounced quando os nós mudam (só depois do load inicial).
  useEffect(() => {
    if (!loaded.current) return
    const t = setTimeout(() => {
      window.orkestra.persistence.save(useCanvasStore.getState().serialize())
    }, 500)
    return () => clearTimeout(t)
  }, [nodes])
}
```

- [ ] **Step 2: Chamar o hook no `Canvas.tsx`**

Adicionar `import { useCanvasPersistence } from '../hooks/useCanvasPersistence'` e, na primeira linha do corpo do componente `Canvas`, chamar `useCanvasPersistence()`. Nada mais muda no `Canvas.tsx`.

- [ ] **Step 3: Typecheck + build + testes**

Run: `npm run typecheck && npm run build && npm test`
Expected: typecheck limpo, build OK, suíte verde (nenhuma regressão).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: load no mount + autosave debounced do canvas (Fase 3)"
```

- [ ] **Step 5: CHECKPOINT VISUAL (humano)**

`npm run dev`. Criar 2-3 terminais, movê-los/redimensioná-los para posições distintas. **Fechar o app (Cmd+Q)** e **rodar `npm run dev` de novo**: os terminais devem reaparecer **nas mesmas posições e tamanhos** (com shells novos — é esperado que o conteúdo anterior do shell não volte, só o layout). Remover um nó, fechar e reabrir → ele não volta. *(Validado pelo humano; o implementador para no build/typecheck e sinaliza pendência.)*

---

## Notas de risco
- **ptys não persistem:** ao recarregar, cada nó de terminal cria um shell novo (via o `useEffect` do `TerminalNode`). É o comportamento correto — só o layout é restaurado.
- **Autosave não deve rodar antes do load:** o `loaded` ref evita salvar um canvas vazio por cima do salvo antes do `load()` async terminar.
- **Escrita atômica:** `save` grava em `.tmp` e faz `rename` — um crash no meio não corrompe o `canvas.json`.
- **`app.getPath('userData')`** só é válido após `app.whenReady()` — por isso a persistência é instanciada dentro do `whenReady`.
