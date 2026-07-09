# Orkestra — Fases 0–1 (Fundação + Terminal real) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um app Electron que builda, empacota e roda um agente/shell num terminal real dentro de uma janela React.

**Architecture:** Electron com três camadas (main Node/TS, preload com contextBridge, renderer React/TS via electron-vite). O `PtyManager` (main) gerencia processos PTY com um *spawner* injetável (testável sem binário nativo); a UI fala com ele por IPC tipado; o `TerminalNode` (renderer) usa xterm.js.

**Tech Stack:** Electron, electron-vite, React 18, TypeScript, @xterm/xterm + addon-fit, node-pty, Vitest, electron-builder, @electron/rebuild.

## Global Constraints

- Plataforma de dev: **Intel x86_64, macOS 12.7.6, Node v24, sem Rust**. Toolchain 100% Node/TS.
- Distribuição alvo: **cross-platform** (empacotar Intel/x64 primeiro).
- Segurança do renderer: **`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`**. Toda ponte via `preload`.
- **node-pty roda apenas no main process** (nunca no renderer/preload).
- **BYO-CLI:** os agentes (Claude Code etc.) já estão instalados pelo usuário; o terminal padrão abre o shell do usuário.
- Nomenclatura: **não** usar marcas do Maestri (Maestri/Ombro/Batuta/Floors). Codinome do projeto: "Orkestra" (provisório).
- Versões-piso: Electron ^33, electron-vite ^2.3, react ^18.3, typescript ^5.6, @xterm/xterm ^5.5, node-pty ^1.0, vitest ^2.1, electron-builder ^25, @electron/rebuild ^3.7.

---

### Task 1: Scaffold Electron + electron-vite + React + TypeScript

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `.gitignore`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/env.d.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: um app Electron executável via `npm run dev`; script `dev`/`build` no `package.json`; janela que carrega o React.

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "orkestra",
  "version": "0.0.0",
  "description": "Canvas de orquestração de agentes de código de IA",
  "author": "Felipe",
  "license": "MIT",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "rebuild": "electron-rebuild -f -w node-pty",
    "package": "electron-vite build && electron-builder --dir"
  }
}
```

- [ ] **Step 2: Instalar dependências**

Run:
```bash
cd /Users/felipeabreu/Documents/Apps/orkestra
npm install --save-dev electron@^33 electron-vite@^2.3 vite@^5 @vitejs/plugin-react@^4 typescript@^5.6 @types/node@^22 @types/react@^18.3 @types/react-dom@^18.3
npm install react@^18.3 react-dom@^18.3
```
Expected: `node_modules/` criado, sem erros de resolução.

- [ ] **Step 3: Criar os tsconfig**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }]
}
```
`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/main/**/*", "src/preload/**/*", "electron.vite.config.ts"]
}
```
`tsconfig.web.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/renderer/src/**/*", "src/preload/index.ts"]
}
```

- [ ] **Step 4: Criar `electron.vite.config.ts`**

```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
```
Nota: `externalizeDepsPlugin()` mantém `node-pty` fora do bundle (obrigatório para módulo nativo).

- [ ] **Step 5: Criar `.gitignore`**

```
node_modules
out
dist
*.log
.DS_Store
```

- [ ] **Step 6: Criar os arquivos de entrada**

`src/main/index.ts`:
```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  win.on('ready-to-show', () => win.show())
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/index.ts`:
```ts
import { contextBridge } from 'electron'

const api = {}

contextBridge.exposeInMainWorld('orkestra', api)

export type OrkestraApi = typeof api
```

`src/renderer/index.html`:
```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Orkestra</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

`src/renderer/src/App.tsx`:
```tsx
export function App(): JSX.Element {
  return <h1 style={{ fontFamily: 'system-ui', padding: 24 }}>Orkestra</h1>
}
```

`src/renderer/src/env.d.ts`:
```ts
/// <reference types="vite/client" />
```

- [ ] **Step 7: Rodar o app (smoke test)**

Run: `npm run dev`
Expected: uma janela abre exibindo o título "Orkestra". Feche a janela.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Electron + electron-vite + React + TS (Fase 0)"
```

---

### Task 2: Ferramental de qualidade — Vitest, ESLint e CI

**Files:**
- Create: `vitest.config.ts`, `eslint.config.js`, `src/main/smoke.test.ts`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `package.json` scripts da Task 1.
- Produces: `npm test` e `npm run lint` verdes; pipeline de CI.

- [ ] **Step 1: Instalar ferramentas de teste/lint**

Run:
```bash
npm install --save-dev vitest@^2.1 eslint@^9 @typescript-eslint/parser@^8 @typescript-eslint/eslint-plugin@^8
```

- [ ] **Step 2: Criar `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false
  }
})
```

- [ ] **Step 3: Criar `eslint.config.js`**

```js
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  { ignores: ['out', 'dist', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tsparser, parserOptions: { ecmaVersion: 2022, sourceType: 'module' } },
    plugins: { '@typescript-eslint': tseslint },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] }
  }
]
```

- [ ] **Step 4: Escrever um teste smoke que falha primeiro**

`src/main/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test`
Expected: PASS (1 teste). Confirma que o Vitest está fiado.

- [ ] **Step 6: Rodar o lint**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 7: Criar CI `.github/workflows/ci.yml`**

```yaml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: vitest + eslint + CI (Fase 0)"
```

---

### Task 3: `PtyManager` com spawner injetável (TDD)

**Files:**
- Create: `src/main/pty/PtyManager.ts`, `src/main/pty/PtyManager.test.ts`

**Interfaces:**
- Consumes: Vitest (Task 2).
- Produces:
  - `interface IPtyLike { onData(cb:(d:string)=>void):void; onExit(cb:(e:{exitCode:number})=>void):void; write(d:string):void; resize(c:number,r:number):void; kill():void }`
  - `type PtySpawner = (file:string, args:string[], opts:{cwd:string; env:NodeJS.ProcessEnv; cols:number; rows:number}) => IPtyLike`
  - `class PtyManager { constructor(spawner: PtySpawner); spawn(opts:{file?:string;cwd?:string;cols?:number;rows?:number}): string; onData(id,cb): void; write(id,data): void; resize(id,cols,rows): void; kill(id): void; has(id): boolean }`

- [ ] **Step 1: Escrever os testes que falham**

`src/main/pty/PtyManager.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { PtyManager, type IPtyLike, type PtySpawner } from './PtyManager'

function makeFakePty() {
  let dataCb: (d: string) => void = () => {}
  const pty: IPtyLike = {
    onData: (cb) => { dataCb = cb },
    onExit: () => {},
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn()
  }
  return { pty, emit: (d: string) => dataCb(d) }
}

describe('PtyManager', () => {
  it('gera ids únicos por spawn', () => {
    const spawner: PtySpawner = () => makeFakePty().pty
    const mgr = new PtyManager(spawner)
    const a = mgr.spawn({})
    const b = mgr.spawn({})
    expect(a).not.toBe(b)
    expect(mgr.has(a)).toBe(true)
  })

  it('encaminha data do pty para o assinante', () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const id = mgr.spawn({})
    const got: string[] = []
    mgr.onData(id, (d) => got.push(d))
    fake.emit('olá')
    expect(got).toEqual(['olá'])
  })

  it('escreve input no pty', () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const id = mgr.spawn({})
    mgr.write(id, 'ls\n')
    expect(fake.pty.write).toHaveBeenCalledWith('ls\n')
  })

  it('mata e esquece o pty', () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const id = mgr.spawn({})
    mgr.kill(id)
    expect(fake.pty.kill).toHaveBeenCalled()
    expect(mgr.has(id)).toBe(false)
  })

  it('passa file/cwd/cols/rows ao spawner com defaults', () => {
    const spawner = vi.fn(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    mgr.spawn({ cols: 100, rows: 30 })
    const call = spawner.mock.calls[0]
    expect(call[2].cols).toBe(100)
    expect(call[2].rows).toBe(30)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/main/pty/PtyManager.test.ts`
Expected: FAIL — `Cannot find module './PtyManager'`.

- [ ] **Step 3: Implementar `PtyManager.ts`**

```ts
export interface IPtyLike {
  onData(cb: (d: string) => void): void
  onExit(cb: (e: { exitCode: number }) => void): void
  write(d: string): void
  resize(c: number, r: number): void
  kill(): void
}

export type PtySpawner = (
  file: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; cols: number; rows: number }
) => IPtyLike

export class PtyManager {
  private ptys = new Map<string, IPtyLike>()
  private nextId = 1

  constructor(private spawner: PtySpawner) {}

  spawn(opts: { file?: string; cwd?: string; cols?: number; rows?: number }): string {
    const id = String(this.nextId++)
    const file = opts.file ?? process.env.SHELL ?? '/bin/bash'
    const pty = this.spawner(file, [], {
      cwd: opts.cwd ?? process.env.HOME ?? process.cwd(),
      env: process.env,
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24
    })
    this.ptys.set(id, pty)
    return id
  }

  onData(id: string, cb: (d: string) => void): void {
    this.ptys.get(id)?.onData(cb)
  }
  write(id: string, data: string): void {
    this.ptys.get(id)?.write(data)
  }
  resize(id: string, cols: number, rows: number): void {
    this.ptys.get(id)?.resize(cols, rows)
  }
  kill(id: string): void {
    const p = this.ptys.get(id)
    if (p) {
      p.kill()
      this.ptys.delete(id)
    }
  }
  has(id: string): boolean {
    return this.ptys.has(id)
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/main/pty/PtyManager.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: PtyManager com spawner injetável, testado (Fase 1)"
```

---

### Task 4: node-pty real + ponte IPC (registrar handlers)

**Files:**
- Create: `src/main/pty/nodePtySpawner.ts`, `src/main/pty/registerPtyIpc.ts`, `src/main/pty/registerPtyIpc.test.ts`
- Modify: `src/main/index.ts` (instanciar PtyManager + registrar IPC), `src/preload/index.ts` (expor API), `src/renderer/src/env.d.ts` (tipar `window.orkestra`)

**Interfaces:**
- Consumes: `PtyManager`, `PtySpawner`, `IPtyLike` (Task 3).
- Produces:
  - `nodePtySpawner: PtySpawner` (adapta `node-pty` para `IPtyLike`).
  - `registerPtyIpc(ipcMain, ptyManager, getSender: () => WebContents | null): void` com canais `pty:spawn` (invoke→string id), `pty:write`, `pty:resize`, `pty:kill` (send), e evento `pty:data` (main→renderer: `(id, data)`).
  - `window.orkestra.pty`: `{ spawn(opts): Promise<string>; write(id,data): void; resize(id,cols,rows): void; kill(id): void; onData(id, cb): () => void }`

- [ ] **Step 1: Instalar node-pty e o rebuild**

Run:
```bash
npm install node-pty@^1.0
npm install --save-dev @electron/rebuild@^3.7
npx electron-rebuild -f -w node-pty
```
Expected: node-pty compilado para a ABI do Electron (sem erro de `gyp`). Se falhar, verificar Xcode Command Line Tools (`xcode-select --install`).

- [ ] **Step 2: Escrever o teste do IPC (falha primeiro)**

`src/main/pty/registerPtyIpc.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { registerPtyIpc } from './registerPtyIpc'
import { PtyManager, type IPtyLike } from './PtyManager'

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

function makeFakePty(): { pty: IPtyLike; emit: (d: string) => void } {
  let dataCb: (d: string) => void = () => {}
  return {
    pty: { onData: (cb) => { dataCb = cb }, onExit: () => {}, write: vi.fn(), resize: vi.fn(), kill: vi.fn() },
    emit: (d) => dataCb(d)
  }
}

describe('registerPtyIpc', () => {
  it('pty:spawn cria pty e encaminha data ao sender', async () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const sender = { send: vi.fn() }
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => sender as any)

    const id = await ipc.handlers.get('pty:spawn')!({}, { cols: 80, rows: 24 })
    expect(typeof id).toBe('string')
    fake.emit('data-x')
    expect(sender.send).toHaveBeenCalledWith('pty:data', id, 'data-x')
  })

  it('pty:write encaminha ao PtyManager', async () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)
    const id = await ipc.handlers.get('pty:spawn')!({}, {})
    ipc.listeners.get('pty:write')!({}, id, 'echo hi\n')
    expect(fake.pty.write).toHaveBeenCalledWith('echo hi\n')
  })
})
```

- [ ] **Step 2b: Rodar e ver falhar**

Run: `npx vitest run src/main/pty/registerPtyIpc.test.ts`
Expected: FAIL — `Cannot find module './registerPtyIpc'`.

- [ ] **Step 3: Implementar `registerPtyIpc.ts`**

```ts
import type { IpcMain, WebContents } from 'electron'
import type { PtyManager } from './PtyManager'

export function registerPtyIpc(
  ipcMain: IpcMain,
  ptyManager: PtyManager,
  getSender: () => WebContents | null
): void {
  ipcMain.handle('pty:spawn', (_e, opts: { cwd?: string; cols?: number; rows?: number }) => {
    const id = ptyManager.spawn(opts ?? {})
    ptyManager.onData(id, (data) => getSender()?.send('pty:data', id, data))
    return id
  })
  ipcMain.on('pty:write', (_e, id: string, data: string) => ptyManager.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => ptyManager.resize(id, cols, rows))
  ipcMain.on('pty:kill', (_e, id: string) => ptyManager.kill(id))
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/main/pty/registerPtyIpc.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Implementar `nodePtySpawner.ts`**

```ts
import * as pty from 'node-pty'
import type { PtySpawner } from './PtyManager'

export const nodePtySpawner: PtySpawner = (file, args, opts) => {
  const p = pty.spawn(file, args, {
    name: 'xterm-color',
    cwd: opts.cwd,
    env: opts.env as { [key: string]: string },
    cols: opts.cols,
    rows: opts.rows
  })
  return {
    onData: (cb) => { p.onData(cb) },
    onExit: (cb) => { p.onExit(({ exitCode }) => cb({ exitCode })) },
    write: (d) => p.write(d),
    resize: (c, r) => p.resize(c, r),
    kill: () => p.kill()
  }
}
```

- [ ] **Step 6: Fiar no `src/main/index.ts`**

Substituir o conteúdo por:
```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { PtyManager } from './pty/PtyManager'
import { nodePtySpawner } from './pty/nodePtySpawner'
import { registerPtyIpc } from './pty/registerPtyIpc'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const ptyManager = new PtyManager(nodePtySpawner)
  registerPtyIpc(ipcMain, ptyManager, () => mainWindow?.webContents ?? null)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 7: Expor a API no `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  pty: {
    spawn: (opts: { cwd?: string; cols?: number; rows?: number }): Promise<string> =>
      ipcRenderer.invoke('pty:spawn', opts),
    write: (id: string, data: string): void => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id: string): void => ipcRenderer.send('pty:kill', id),
    onData: (id: string, cb: (data: string) => void): (() => void) => {
      const listener = (_e: unknown, incomingId: string, data: string): void => {
        if (incomingId === id) cb(data)
      }
      ipcRenderer.on('pty:data', listener)
      return () => ipcRenderer.removeListener('pty:data', listener)
    }
  }
}

contextBridge.exposeInMainWorld('orkestra', api)

export type OrkestraApi = typeof api
```

- [ ] **Step 8: Tipar `window.orkestra` em `src/renderer/src/env.d.ts`**

```ts
/// <reference types="vite/client" />
import type { OrkestraApi } from '../../preload'

declare global {
  interface Window {
    orkestra: OrkestraApi
  }
}
```

- [ ] **Step 9: Rodar typecheck + testes**

Run: `npm run typecheck && npm test`
Expected: PASS (typecheck sem erros; 7 testes verdes).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: node-pty real + ponte IPC main<->renderer (Fase 1)"
```

---

### Task 5: `TerminalNode` (xterm.js) rodando um shell real

**Files:**
- Create: `src/renderer/src/components/TerminalNode.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `window.orkestra.pty` (Task 4).
- Produces: componente React `<TerminalNode />` que abre um shell interativo e o renderiza com xterm.js.

- [ ] **Step 1: Instalar xterm**

Run:
```bash
npm install @xterm/xterm@^5.5 @xterm/addon-fit@^0.10
```

- [ ] **Step 2: Criar `TerminalNode.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function TerminalNode(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const term = new XTerm({ cursorBlink: true, fontSize: 13, fontFamily: 'Menlo, monospace' })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()

    let disposeData = (): void => {}
    let ptyId = ''
    let disposed = false

    window.orkestra.pty.spawn({ cols: term.cols, rows: term.rows }).then((id) => {
      if (disposed) {
        window.orkestra.pty.kill(id)
        return
      }
      ptyId = id
      disposeData = window.orkestra.pty.onData(id, (data) => term.write(data))
      term.onData((data) => window.orkestra.pty.write(id, data))
      term.onResize(({ cols, rows }) => window.orkestra.pty.resize(id, cols, rows))
    })

    const onResize = (): void => fit.fit()
    window.addEventListener('resize', onResize)

    return () => {
      disposed = true
      window.removeEventListener('resize', onResize)
      disposeData()
      if (ptyId) window.orkestra.pty.kill(ptyId)
      term.dispose()
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
```

- [ ] **Step 3: Montar no `App.tsx`**

```tsx
import { TerminalNode } from './components/TerminalNode'

export function App(): JSX.Element {
  return (
    <div style={{ height: '100vh', background: '#1e1e1e', padding: 8, boxSizing: 'border-box' }}>
      <TerminalNode />
    </div>
  )
}
```

- [ ] **Step 4: Rodar o app e validar o shell real**

Run: `npm run dev`
Expected: um terminal aparece; digitar `echo orkestra` e Enter imprime `orkestra`; digitar `claude --version` (se instalado) roda o CLI. Fechar a janela.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: sem erros.
```bash
git add -A
git commit -m "feat: TerminalNode com xterm.js rodando shell real (Fase 1)"
```

---

### Task 6: Empacotamento com electron-builder (binário Intel)

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json` (garantir script `package`)

**Interfaces:**
- Consumes: build do electron-vite (`out/`).
- Produces: um app empacotado em `dist/` que roda o terminal (valida o rebuild nativo no pacote).

- [ ] **Step 1: Instalar electron-builder**

Run: `npm install --save-dev electron-builder@^25`

- [ ] **Step 2: Criar `electron-builder.yml`**

```yaml
appId: com.felipe.orkestra
productName: Orkestra
directories:
  output: dist
  buildResources: build
files:
  - out/**/*
  - package.json
npmRebuild: true
mac:
  target:
    - target: dir
      arch: x64
  category: public.app-category.developer-tools
```
Nota: `target: dir` gera o `.app` sem dmg/notarização (suficiente para validar a Fase 1). DMG e assinatura ficam para a Fase 12.

- [ ] **Step 3: Empacotar**

Run: `npm run package`
Expected: `dist/mac/Orkestra.app` criado sem erros de rebuild de node-pty.

- [ ] **Step 4: Abrir o app empacotado e validar o terminal**

Run: `open dist/mac/Orkestra.app`
Expected: o app abre; o terminal funciona (digitar `echo ok` imprime `ok`). Isso confirma o node-pty recompilado dentro do pacote. Fechar.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "build: empacotamento electron-builder (dir, x64) (Fase 0-1)"
```

---

## Notas de risco (ler antes de executar)
- **node-pty + Electron (Task 4/6):** módulo nativo; exige recompilar para a ABI do Electron (`electron-rebuild`) e novamente no empacotamento (`npmRebuild: true`). É o ponto mais provável de fricção no Intel/macOS 12 — se `gyp` falhar, confirmar Xcode Command Line Tools e Python 3.
- **sandbox: true + preload:** o preload usa apenas `ipcRenderer`/`contextBridge` (permitidos em preloads sandboxed). node-pty nunca é importado no preload/renderer.
- **Testes vs. binário nativo:** a lógica é testada com um *spawner fake* (sem ABI nativa), então `npm test` roda em Node puro sem depender do rebuild.
