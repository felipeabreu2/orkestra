# Orkestra — Fase 6 (Comunicação agente↔agente — MVP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Um agente num terminal consegue **enviar um prompt para outro terminal** e **ler a saída** de qualquer terminal, endereçando-os por **nome**: `orq ask "<nome>" "<prompt>"` (escreve no terminal alvo) e `orq check "<nome>"` (retorna o buffer de saída daquele terminal). Terminais ganham nomes editáveis.

**Architecture:** Cada terminal ganha um **nome** editável (`node.data.name`, default "Terminal N"), sincronizado no espelho (mirror) que o renderer já envia ao main. O `PtyManager` ganha um mapa `node.id → ptyId` (o `TerminalNode` passa seu `node.id` no spawn). Um **AgentBus** (main) mantém um **buffer de saída por pty** (observando `onData`) e expõe `write(ptyId, text)` e `read(ptyId)`. O `OrchestrationServer` ganha `POST /ask` e `GET /check` que o main resolve: nome → node.id (via mirror) → ptyId (via `PtyManager`) → AgentBus. O `orq` ganha `ask`/`check`.

**Nota de escopo (registrada):** `ask` é **fire-and-forget** neste MVP (envia e retorna). O `ask` *bloqueante* do Maestri (espera o agente terminar via detecção de ociosidade) é um refinamento futuro — a heurística de "agente terminou" precisa de validação com agentes reais e fica para uma fase posterior, sobre esta base.

**Tech Stack:** sem deps novas. Vitest.

## Global Constraints

- Renderer NÃO importa `fs`/`http`/`node-pty`. Segurança do servidor inalterada (127.0.0.1 + token).
- `ask` é fire-and-forget (MVP); sem detecção de ociosidade nesta fase.
- Buffer de saída por pty é **limitado** (últimos ~8000 chars) para não crescer sem limite.
- Nomenclatura: **não** usar marcas do Maestri.

---

### Task 1: Nomes de terminais + mapa `nodeId → ptyId` (TDD)

**Files:**
- Modify: `src/renderer/src/store/canvasStore.ts` (+ `.test.ts`), `src/renderer/src/components/TerminalFlowNode.tsx`, `src/renderer/src/components/TerminalNode.tsx`, `src/main/pty/PtyManager.ts` (+ `.test.ts`), `src/main/pty/registerPtyIpc.ts`, `src/renderer/src/hooks/useOrchestrationSync.ts`

**Interfaces:**
- Produces: store `updateTerminalName(id, name)`; `addTerminalNode` seeds `data: { name: 'Terminal <n>' }`; `PtyManager.spawn` accepts `nodeId?` and records `nodeId→ptyId`, with `ptyIdForNode(nodeId): string | undefined`; the mirror's `name` uses `data.name`.

- [ ] **Step 1: Store — nome do terminal (TDD)**

Em `canvasStore.test.ts` adicionar:
```ts
  it('addTerminalNode nomeia sequencialmente e updateTerminalName renomeia', () => {
    useCanvasStore.getState().addTerminalNode()
    const id = useCanvasStore.getState().nodes[0].id
    expect((useCanvasStore.getState().nodes[0].data as { name?: string }).name).toMatch(/Terminal/)
    useCanvasStore.getState().updateTerminalName(id, 'Dev')
    expect((useCanvasStore.getState().nodes[0].data as { name?: string }).name).toBe('Dev')
  })
```
Em `canvasStore.ts`: adicionar um contador de terminais (`let terminalSeq = 1`), `addTerminalNode` semeia `data: { name: \`Terminal ${terminalSeq++}\` }`; adicionar `updateTerminalName: (id, name) => set((s) => ({ nodes: s.nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, name } } : n) }))` (à interface `CanvasState` e à implementação).

- [ ] **Step 2: PtyManager — mapa nodeId→ptyId (TDD)**

Em `PtyManager.test.ts`:
```ts
  it('registra nodeId->ptyId e resolve com ptyIdForNode', () => {
    const mgr = new PtyManager(() => makeFakePty().pty)
    const id = mgr.spawn({ nodeId: 'node-A' })
    expect(mgr.ptyIdForNode('node-A')).toBe(id)
  })
```
Em `PtyManager.ts`: `spawn` aceita `nodeId?: string`; manter `private ptyByNode = new Map<string,string>()`; no spawn, se `opts.nodeId`, `this.ptyByNode.set(opts.nodeId, id)`; no `kill`/onExit cleanup, remover a entrada correspondente; adicionar `ptyIdForNode(nodeId: string): string | undefined { return this.ptyByNode.get(nodeId) }`.

- [ ] **Step 3: Renderer — passar node.id ao spawn + header editável**

`TerminalFlowNode.tsx`: passar `id` e o `data.name` para `<TerminalNode nodeId={id} />`; trocar o `<span>Terminal</span>` do header por um input editável ligado a `updateTerminalName` (className `nodrag`), mostrando `data.name`.
`TerminalNode.tsx`: aceitar prop `nodeId?: string` e incluí-la na chamada `window.orkestra.pty.spawn({ cols, rows, nodeId })`.
`registerPtyIpc.ts`: repassar `opts.nodeId` (já repassa `opts`) — confirmar que `spawn(opts)` inclui `nodeId`.
`useOrchestrationSync.ts`: o mirror `name` já lê `data.name` (confirmar; ajustar o fallback para `data.name` primeiro).

- [ ] **Step 4: Rodar testes + typecheck** — `npm test && npm run typecheck` → verdes (store + PtyManager novos passam).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: nomes de terminais + mapa nodeId->ptyId (Fase 6)"`

---

### Task 2: `AgentBus` (buffer/ask/check) + endpoints `/ask` `/check` (TDD)

**Files:**
- Create: `src/main/orchestration/AgentBus.ts`, `src/main/orchestration/AgentBus.test.ts`
- Modify: `src/main/orchestration/OrchestrationServer.ts` (+ `.test.ts`)

**Interfaces:**
- Produces:
  - `class AgentBus { constructor(pty: PtyManager); track(ptyId): void; ask(ptyId, prompt): void; read(ptyId): string; untrack(ptyId): void }`
  - `OrchestrationServer` opts gain `ask?: (name: string, prompt: string) => { ok: boolean; error?: string }` and `check?: (name: string) => { output: string } | null`; routes `POST /ask` (body `{name, prompt}`) and `GET /check?name=<name>`.

- [ ] **Step 1: `AgentBus` test (falha primeiro)**

`AgentBus.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { AgentBus } from './AgentBus'
import { PtyManager, type IPtyLike } from '../pty/PtyManager'

function fakePty(): { pty: IPtyLike; emit: (d: string) => void } {
  let cb: (d: string) => void = () => {}
  return { pty: { onData: (c) => { cb = c }, onExit: () => {}, write: vi.fn(), resize: vi.fn(), kill: vi.fn() }, emit: (d) => cb(d) }
}

describe('AgentBus', () => {
  it('acumula a saída do pty no buffer e read() a retorna', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.track(id)
    f.emit('linha 1\n'); f.emit('linha 2\n')
    expect(bus.read(id)).toContain('linha 1')
    expect(bus.read(id)).toContain('linha 2')
  })
  it('ask escreve o prompt (com newline) no pty', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.ask(id, 'olá agente')
    expect(f.pty.write).toHaveBeenCalledWith('olá agente\n')
  })
  it('read limita o buffer aos últimos ~8000 chars', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.track(id)
    f.emit('x'.repeat(10000))
    expect(bus.read(id).length).toBeLessThanOrEqual(8000)
  })
})
```

- [ ] **Step 2: Rodar/falhar, implementar `AgentBus.ts`**

```ts
import type { PtyManager } from '../pty/PtyManager'

const MAX = 8000

export class AgentBus {
  private buffers = new Map<string, string>()
  constructor(private pty: PtyManager) {}

  track(ptyId: string): void {
    this.pty.onData(ptyId, (data) => {
      const cur = (this.buffers.get(ptyId) ?? '') + data
      this.buffers.set(ptyId, cur.length > MAX ? cur.slice(-MAX) : cur)
    })
  }
  ask(ptyId: string, prompt: string): void {
    this.pty.write(ptyId, prompt + '\n')
  }
  read(ptyId: string): string {
    return this.buffers.get(ptyId) ?? ''
  }
  untrack(ptyId: string): void {
    this.buffers.delete(ptyId)
  }
}
```

- [ ] **Step 3: Endpoints `/ask` `/check` no `OrchestrationServer` (TDD)**

Em `OrchestrationServer.test.ts` adicionar 2 testes: `POST /ask` com `{name, prompt}` chama `opts.ask(name, prompt)` e responde 200 (ou 404 se `ask` retorna `{ok:false}`); `GET /check?name=X` chama `opts.check('X')` e responde o `{output}` (404 se null). Em `OrchestrationServer.ts`: estender `Opts` com `ask?`/`check?`; no `handle`, após o token gate, adicionar as rotas `POST /ask` (parse body `{name, prompt}` strings → `opts.ask?.(...)` → 200/`404`) e `GET /check` (ler `name` da query via `new URL(req.url, 'http://x')` → `opts.check?.(name)` → JSON `{output}` ou 404). Manter `/list` e `/note` intactos.

- [ ] **Step 4: Testes + typecheck** — verdes.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: AgentBus (buffer/ask/read) + endpoints /ask /check (Fase 6)"`

---

### Task 3: `orq ask`/`check` + fiação no main (+ checkpoint)

**Files:**
- Modify: `src/orq/orq.ts` (+ `.test.ts`), `src/main/index.ts`

**Interfaces:**
- Consumes: AgentBus (Task 2), server `/ask` `/check` (Task 2), `PtyManager.ptyIdForNode` + mirror (Task 1).

- [ ] **Step 1: `orq` ask/check (TDD)**

Em `orq.test.ts`, com um `OrchestrationServer` real cujos `ask`/`check` gravam/retornam: `runOrq(['ask','Dev','oi'], env)` → chama o servidor `/ask` (code 0); `runOrq(['check','Dev'], env)` → imprime o output retornado por `/check`. Em `orq.ts`: adicionar `if (cmd === 'ask') { POST /ask {name: sub, prompt: rest.join(' ')} }` e `if (cmd === 'check') { GET /check?name=<sub>; imprime output }`, com o mesmo tratamento de erro/res.ok já usado.

- [ ] **Step 2: Fiar no `main/index.ts`**

Instanciar `const agentBus = new AgentBus(ptyManager)`; após cada `pty:spawn` (no handler, via `registerPtyIpc` — repassar um callback `onSpawn(ptyId)` OU chamar `agentBus.track(id)` dentro do handler) fazer `agentBus.track(id)`; passar ao `OrchestrationServer` os `ask`/`check` que resolvem nome→node→pty: 
```ts
function resolvePtyByName(name: string): string | undefined {
  const node = mirror.nodes.find((n) => n.type === 'terminal' && n.name === name)
  return node ? ptyManager.ptyIdForNode(node.id) : undefined
}
```
`ask: (name, prompt) => { const p = resolvePtyByName(name); if (!p) return { ok: false, error: 'not found' }; agentBus.ask(p, prompt); return { ok: true } }`; `check: (name) => { const p = resolvePtyByName(name); return p ? { output: agentBus.read(p) } : null }`. Manter tudo o mais intacto.

- [ ] **Step 3: typecheck + build + testes** — verdes; `out/orq/bin.js` ainda gerado.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: orq ask/check + resolução nome->pty no main (Fase 6)"`

- [ ] **Step 5: CHECKPOINT VISUAL (humano)** — `npm run dev`. Criar 2 terminais; renomear um para "Dev" (editar o header). Num outro terminal rodar `orq ask "Dev" "echo oi do outro agente"` (o comando deve ser digitado/executado no terminal "Dev") e `orq check "Dev"` (deve imprimir a saída recente do terminal "Dev"). *(Humano; o implementador para no build/typecheck.)*

---

## Notas de risco
- **`ask` fire-and-forget:** envia o prompt como se digitado (com `\n`). Não espera resposta — o agente chamador usa `check` para ler. O `ask` bloqueante com detecção de ociosidade é refinamento futuro (precisa validação com agentes reais).
- **Buffer com códigos ANSI:** o buffer guarda a saída bruta do pty (com escapes ANSI). Para o MVP, `check` retorna bruto; um "strip ANSI" pode ser adicionado depois.
- **Resolução por nome:** nomes duplicados resolvem para o primeiro; renomear é responsabilidade do usuário. O mirror reflete o nome atual.
- **AgentBus.track após spawn:** garantir que `track` é chamado para todo pty criado (inclusive os recriados no reload/hydrate).
