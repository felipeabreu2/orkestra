# Orkestra — Fase 5 (CLI de orquestração — MVP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Um agente rodando num terminal do Orkestra consegue **ler e mutar o canvas por linha de comando** via o CLI `orq`: `orq list` (ver os nós) e `orq note write "<conteúdo>"` (escrever numa nota). É a base da orquestração.

**Architecture:** `OrchestrationServer` (main) — servidor HTTP em `127.0.0.1` numa porta efêmera, autenticado por um token de sessão. Mantém um **espelho** leve do canvas que o renderer envia por IPC (`orchestration:sync`) sempre que o canvas muda. `GET /list` responde o espelho; `POST /note` emite um comando que o main repassa ao renderer (`orchestration:command`), que aplica no `canvasStore`. O CLI `orq` (script Node) é instalado em `~/.orkestra/bin/orq`; o `PtyManager` injeta no ambiente dos terminais `ORKESTRA_PORT`, `ORKESTRA_TOKEN` e um `PATH` prefixado com `~/.orkestra/bin`.

**Tech Stack:** Node `http` (built-in, sem deps novas). Vitest.

## Global Constraints

- Segurança: o servidor faz bind **apenas em `127.0.0.1`**; todo request exige o header `x-orkestra-token` igual ao token de sessão (senão `401`). Sem token → sem acesso.
- Renderer NÃO importa `fs`/`http`/`node-pty`; só o main. O renderer fala com o servidor de orquestração apenas indiretamente (o `orq` é que chama o servidor).
- Sem dependências novas (usar `http`/`fs` do Node).
- Nomenclatura: **não** usar marcas do Maestri.
- Escopo MVP: só `list` + `note`. `ask`/`check` (comunicação com agentes) = Fase 6.

---

### Task 1: `OrchestrationServer` + tipos compartilhados (TDD)

**Files:**
- Create: `src/shared/orchestration.ts`, `src/main/orchestration/OrchestrationServer.ts`, `src/main/orchestration/OrchestrationServer.test.ts`

**Interfaces:**
- Produces:
  - `interface MirrorNode { id: string; type: string; name: string; content?: string }`
  - `interface CanvasMirror { nodes: MirrorNode[] }`
  - `type OrchestrationCommand = { type: 'updateNote'; target: string; content: string }`
  - `class OrchestrationServer { constructor(opts: { getMirror: () => CanvasMirror; onCommand: (cmd: OrchestrationCommand) => void }); start(): Promise<{ port: number; token: string }>; stop(): Promise<void> }`

- [ ] **Step 1: Criar `src/shared/orchestration.ts`**

```ts
export interface MirrorNode {
  id: string
  type: string
  name: string
  content?: string
}

export interface CanvasMirror {
  nodes: MirrorNode[]
}

export type OrchestrationCommand = { type: 'updateNote'; target: string; content: string }
```

- [ ] **Step 2: Escrever o teste que falha**

`src/main/orchestration/OrchestrationServer.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { OrchestrationServer } from './OrchestrationServer'
import type { CanvasMirror, OrchestrationCommand } from '../../shared/orchestration'

let server: OrchestrationServer | undefined
afterEach(async () => { await server?.stop(); server = undefined })

function makeServer(mirror: CanvasMirror, commands: OrchestrationCommand[]) {
  server = new OrchestrationServer({
    getMirror: () => mirror,
    onCommand: (c) => commands.push(c)
  })
  return server
}

describe('OrchestrationServer', () => {
  it('GET /list com token retorna o espelho', async () => {
    const mirror: CanvasMirror = { nodes: [{ id: 'n1', type: 'note', name: 'Nota' }] }
    const s = makeServer(mirror, [])
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/list`, { headers: { 'x-orkestra-token': token } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(mirror)
  })

  it('sem token retorna 401', async () => {
    const s = makeServer({ nodes: [] }, [])
    const { port } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/list`)
    expect(res.status).toBe(401)
  })

  it('POST /note emite um comando updateNote', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/note`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'Nota', content: 'olá' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'updateNote', target: 'Nota', content: 'olá' }])
  })
})
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run src/main/orchestration/OrchestrationServer.test.ts` → FAIL (módulo ausente).

- [ ] **Step 4: Implementar `OrchestrationServer.ts`**

```ts
import { createServer, type Server } from 'http'
import { randomBytes } from 'crypto'
import type { CanvasMirror, OrchestrationCommand } from '../../shared/orchestration'

interface Opts {
  getMirror: () => CanvasMirror
  onCommand: (cmd: OrchestrationCommand) => void
}

export class OrchestrationServer {
  private server?: Server
  private token = ''

  constructor(private opts: Opts) {}

  start(): Promise<{ port: number; token: string }> {
    this.token = randomBytes(24).toString('hex')
    this.server = createServer((req, res) => this.handle(req, res))
    return new Promise((resolve) => {
      this.server!.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        resolve({ port, token: this.token })
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
      this.server = undefined
    })
  }

  private handle(req: import('http').IncomingMessage, res: import('http').ServerResponse): void {
    if (req.headers['x-orkestra-token'] !== this.token) {
      res.writeHead(401).end('unauthorized')
      return
    }
    if (req.method === 'GET' && req.url === '/list') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(this.opts.getMirror()))
      return
    }
    if (req.method === 'POST' && req.url === '/note') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { target?: unknown; content?: unknown }
          if (typeof parsed.target !== 'string' || typeof parsed.content !== 'string') {
            res.writeHead(400).end('bad request')
            return
          }
          this.opts.onCommand({ type: 'updateNote', target: parsed.target, content: parsed.content })
          res.writeHead(200).end('ok')
        } catch {
          res.writeHead(400).end('bad json')
        }
      })
      return
    }
    res.writeHead(404).end('not found')
  }
}
```

- [ ] **Step 5: Rodar e ver passar + suíte + typecheck** — `npx vitest run src/main/orchestration/OrchestrationServer.test.ts && npm test && npm run typecheck` → verdes.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: OrchestrationServer (HTTP local + token) (Fase 5)"`

---

### Task 2: CLI `orq` + injeção de ambiente no `PtyManager` (TDD)

**Files:**
- Create: `src/orq/orq.ts`, `src/orq/orq.test.ts`
- Modify: `src/main/pty/PtyManager.ts`, `src/main/pty/PtyManager.test.ts`

**Interfaces:**
- Produces:
  - `orq`: `export async function runOrq(argv: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }>` — implementa `list` e `note write "<content>"` chamando o servidor via `ORKESTRA_PORT`/`ORKESTRA_TOKEN`.
  - `PtyManager.spawn` ganha `env?: Record<string, string>` (mesclado sobre `process.env`).

- [ ] **Step 1: Estender `PtyManager.spawn` para aceitar env extra (TDD)**

Em `PtyManager.test.ts`, adicionar:
```ts
  it('mescla env extra sobre process.env no spawn', () => {
    const spawner = vi.fn(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    mgr.spawn({ env: { ORKESTRA_PORT: '1234' } })
    const call = spawner.mock.calls[0]
    expect(call[2].env.ORKESTRA_PORT).toBe('1234')
    expect(call[2].env.PATH).toBe(process.env.PATH) // preserva o resto
  })
```
Em `PtyManager.ts`, mudar a assinatura e o env:
```ts
  spawn(opts: { file?: string; cwd?: string; cols?: number; rows?: number; env?: Record<string, string> }): string {
    const id = String(this.nextId++)
    const file = opts.file ?? process.env.SHELL ?? '/bin/bash'
    const pty = this.spawner(file, [], {
      cwd: opts.cwd ?? process.env.HOME ?? process.cwd(),
      env: { ...process.env, ...opts.env },
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24
    })
    this.ptys.set(id, pty)
    pty.onExit(() => { this.ptys.delete(id) })
    return id
  }
```

- [ ] **Step 2: Escrever o teste do `orq` (falha primeiro)**

`src/orq/orq.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { runOrq } from './orq'
import { OrchestrationServer } from '../main/orchestration/OrchestrationServer'
import type { CanvasMirror, OrchestrationCommand } from '../shared/orchestration'

let server: OrchestrationServer | undefined
afterEach(async () => { await server?.stop(); server = undefined })

async function startServer(mirror: CanvasMirror, commands: OrchestrationCommand[]) {
  server = new OrchestrationServer({ getMirror: () => mirror, onCommand: (c) => commands.push(c) })
  const { port, token } = await server.start()
  return { ORKESTRA_PORT: String(port), ORKESTRA_TOKEN: token } as NodeJS.ProcessEnv
}

describe('runOrq', () => {
  it('list imprime os nós do espelho', async () => {
    const env = await startServer({ nodes: [{ id: 'n1', type: 'note', name: 'Spec' }] }, [])
    const { code, out } = await runOrq(['list'], env)
    expect(code).toBe(0)
    expect(out).toContain('Spec')
  })

  it('note write envia o conteúdo ao servidor', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['note', 'write', 'conteúdo x'], env)
    expect(code).toBe(0)
    expect(commands[0]).toMatchObject({ type: 'updateNote', content: 'conteúdo x' })
  })

  it('sem env de servidor retorna código != 0', async () => {
    const { code } = await runOrq(['list'], {})
    expect(code).not.toBe(0)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run src/orq/orq.test.ts` → FAIL.

- [ ] **Step 4: Implementar `src/orq/orq.ts`**

```ts
export async function runOrq(argv: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }> {
  const port = env.ORKESTRA_PORT
  const token = env.ORKESTRA_TOKEN
  if (!port || !token) {
    return { code: 1, out: 'orq: não está rodando dentro de um terminal do Orkestra (faltam ORKESTRA_PORT/ORKESTRA_TOKEN)' }
  }
  const base = `http://127.0.0.1:${port}`
  const headers = { 'x-orkestra-token': token, 'content-type': 'application/json' }

  const [cmd, sub, ...rest] = argv
  try {
    if (cmd === 'list') {
      const res = await fetch(`${base}/list`, { headers })
      const mirror = (await res.json()) as { nodes: { id: string; type: string; name: string }[] }
      const out = mirror.nodes.map((n) => `${n.type}\t${n.name}\t${n.id}`).join('\n')
      return { code: 0, out }
    }
    if (cmd === 'note' && sub === 'write') {
      const content = rest.join(' ')
      const res = await fetch(`${base}/note`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ target: '', content })
      })
      return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : `orq: erro ${res.status}` }
    }
    return { code: 2, out: `orq: comando desconhecido. Uso: orq list | orq note write "<conteúdo>"` }
  } catch (err) {
    return { code: 1, out: `orq: falha de conexão: ${String(err)}` }
  }
}
```
E um wrapper executável `src/orq/bin.ts` (ponto de entrada CLI):
```ts
#!/usr/bin/env node
import { runOrq } from './orq'

runOrq(process.argv.slice(2), process.env).then(({ code, out }) => {
  if (out) process.stdout.write(out + '\n')
  process.exit(code)
})
```

- [ ] **Step 5: Rodar e ver passar + suíte + typecheck** — `npm test && npm run typecheck` → verdes.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: CLI orq (list/note) + env extra no PtyManager (Fase 5)"`

---

### Task 3: Fiação — sync do espelho, instalação do orq e injeção de PATH/env (+ checkpoint)

**Files:**
- Create: `src/renderer/src/hooks/useOrchestrationSync.ts`, `src/main/orchestration/installOrq.ts`
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/env.d.ts`, `src/renderer/src/components/Canvas.tsx`, `electron.vite.config.ts` (adicionar o entry do `orq/bin.ts` ao build do main)

**Interfaces:**
- Consumes: `OrchestrationServer` (Task 1), `orq` build (Task 2), store (`nodes`, `updateNoteContent`).
- Produces: o app inicia o servidor, instala o `orq`, injeta env nos PTYs, e mantém o espelho sincronizado.

- [ ] **Step 1: Hook `useOrchestrationSync.ts`** (envia o espelho quando o canvas muda; aplica comandos)

```ts
import { useEffect } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import type { CanvasMirror, OrchestrationCommand } from '../../../shared/orchestration'

export function useOrchestrationSync(): void {
  const nodes = useCanvasStore((s) => s.nodes)
  const updateNoteContent = useCanvasStore((s) => s.updateNoteContent)

  // Envia um espelho leve do canvas ao main sempre que os nós mudam.
  useEffect(() => {
    const mirror: CanvasMirror = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type ?? 'terminal',
        name: ((n.data?.name as string) ?? (n.data?.content as string) ?? n.type ?? 'nó').slice(0, 40),
        content: n.data?.content as string | undefined
      }))
    }
    window.orkestra.orchestration.sync(mirror)
  }, [nodes])

  // Aplica comandos vindos do orq (via main).
  useEffect(() => {
    const dispose = window.orkestra.orchestration.onCommand((cmd: OrchestrationCommand) => {
      if (cmd.type === 'updateNote') {
        const notes = useCanvasStore.getState().nodes.filter((n) => n.type === 'note')
        const target = cmd.target
          ? notes.find((n) => n.id === cmd.target || ((n.data?.name as string) === cmd.target))
          : notes[0]
        if (target) updateNoteContent(target.id, cmd.content)
      }
    })
    return dispose
  }, [updateNoteContent])
}
```

- [ ] **Step 2: `installOrq.ts`** (copia o `orq` compilado para `~/.orkestra/bin/orq`, executável)

```ts
import { mkdirSync, copyFileSync, chmodSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Copia o orq compilado (out/orq/bin.js) para ~/.orkestra/bin/orq e o torna executável.
// Retorna o diretório bin para prefixar no PATH dos terminais.
export function installOrq(compiledBinPath: string): string {
  const binDir = join(homedir(), '.orkestra', 'bin')
  mkdirSync(binDir, { recursive: true })
  const dest = join(binDir, 'orq')
  copyFileSync(compiledBinPath, dest)
  chmodSync(dest, 0o755)
  return binDir
}
```
Nota: o `orq` compilado precisa de um shebang `#!/usr/bin/env node` (já em `bin.ts`) e rodar como script Node standalone. O electron-vite deve empacotar `src/orq/bin.ts` como um bundle CJS separado em `out/orq/bin.js` — configurar no `electron.vite.config.ts` (`main.build.rollupOptions.input` incluindo `orq: 'src/orq/bin.ts'`), preservando o shebang.

- [ ] **Step 3: Fiar no `main/index.ts`** (dentro de `whenReady`, após o PtyManager)

Adicionar: manter `let mirror: CanvasMirror = { nodes: [] }`; instanciar `const orchestration = new OrchestrationServer({ getMirror: () => mirror, onCommand: (cmd) => mainWindow?.webContents.send('orchestration:command', cmd) })`; `const { port, token } = await orchestration.start()`; `const binDir = installOrq(join(__dirname, '../orq/bin.js'))`; guardar `orchestrationEnv = { ORKESTRA_PORT: String(port), ORKESTRA_TOKEN: token, PATH: \`${binDir}:${process.env.PATH ?? ''}\` }`; registrar `ipcMain.on('orchestration:sync', (_e, m) => { mirror = m })`. E no handler `pty:spawn` (em `registerPtyIpc` — passar o env): o `pty:spawn` deve incluir `env: orchestrationEnv` ao chamar `ptyManager.spawn`. Ajustar `registerPtyIpc` para receber e repassar esse env (assinatura `registerPtyIpc(ipcMain, ptyManager, getSender, extraEnv)`), ou setar via um setter. Manter `killAll`/`disableHardwareAcceleration`/webPreferences intactos; `stop()` o servidor em `before-quit`.

- [ ] **Step 4: Preload + env.d.ts** — adicionar ao `api`:
```ts
  orchestration: {
    sync: (mirror: unknown): void => ipcRenderer.send('orchestration:sync', mirror),
    onCommand: (cb: (cmd: unknown) => void): (() => void) => {
      const l = (_e: unknown, cmd: unknown): void => cb(cmd)
      ipcRenderer.on('orchestration:command', l)
      return () => ipcRenderer.removeListener('orchestration:command', l)
    }
  }
```

- [ ] **Step 5: Chamar `useOrchestrationSync()` no `Canvas.tsx`** (uma linha, ao lado de `useCanvasPersistence()`).

- [ ] **Step 6: Typecheck + build + testes** — `npm run typecheck && npm run build && npm test` → verdes; confirmar que `out/orq/bin.js` é gerado.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: fiação da orquestração (sync + instalação do orq + env nos PTYs) (Fase 5)"`

- [ ] **Step 8: CHECKPOINT VISUAL (humano)** — `npm run dev`. Criar uma nota e um terminal. No terminal, rodar `orq list` (deve listar os nós, incluindo a nota) e `orq note write "escrito pelo agente"` (o texto deve aparecer na nota no canvas). *(Validado pelo humano; o implementador para no build/typecheck.)*

---

## Notas de risco
- **Empacotar o `orq`:** é um segundo entry do processo main (Node puro, sem Electron). O `electron.vite.config.ts` precisa gerá-lo como bundle CJS com o shebang preservado. Se o electron-vite não preservar o shebang, adicionar um banner no rollup (`output.banner = '#!/usr/bin/env node'`).
- **PATH no shell:** injetar `~/.orkestra/bin` no `PATH` do env do PTY faz o shell encontrar `orq`. Alguns shells reescrevem o PATH no rc; se `orq` não for encontrado, o fallback é chamar `node ~/.orkestra/bin/orq` — documentar no checkpoint.
- **Segurança:** bind só em 127.0.0.1 + token por sessão. O token vive no env do terminal (o agente que roda ali já é confiável pelo usuário).
- **`ask`/`check` (comunicação com agentes)** ficam para a Fase 6 (precisam de detecção de quando o agente terminou).
