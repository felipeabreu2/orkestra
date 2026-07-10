# Orkestra — Fase 10 (Rotinas: agendador cron) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Uma **rotina** dispara um comando sozinha, num horário (expressão cron). O usuário/agente define `{nome, cron, alvo, comando}`; quando o cron casa o minuto atual, o comando é **enviado ao terminal alvo** (como se o agente digitasse — reusa o `AgentBus`). Encadeamento é via `&&` no próprio comando (o shell interpreta).

**Architecture:** Um matcher cron **puro** (`src/shared/cron.ts`: `cronMatches(expr, date)`) suporta os 5 campos (`min hour dom mon dow`) com `*`, `N`, `*/N`, `A-B`, `A,B`. Um **`RoutineScheduler`** (main) guarda as rotinas, faz `tick()` a cada 30s, e para cada rotina habilitada cujo cron casa o minuto atual (com dedupe por minuto para não disparar 2×), chama `onFire(routine)`. No `main/index.ts`, `onFire` resolve `alvo → pty` (o mesmo `resolvePtyByName` da Fase 6/7) e faz `agentBus.ask(pty, comando)`. Rotinas são geridas pela UI (IPC `routine:*`) e pelo agente (`orq routine ...` → rotas HTTP token-gated). Persistem em `~/.orkestra/routines.json`.

**Tech Stack:** sem deps novas (matcher cron próprio, ~40 linhas, testável). Vitest com `now` injetável + fake timers.

## Global Constraints

- Renderer NÃO importa `fs`/`http`/`node-pty`/`child_process`. Scheduler/FS só no main.
- Segurança do servidor inalterada (127.0.0.1 + token, gate antes do routing).
- O `now` do scheduler é **injetável** (`opts.now`) para testabilidade; produção usa `() => new Date()`.
- Dedupe: uma rotina dispara **no máximo uma vez por minuto** (rastrear o minuto-epoch do último disparo).
- Nomenclatura: **não** usar marcas do Maestri.

---

### Task 1: Matcher cron puro (TDD)

**Files:**
- Create: `src/shared/cron.ts`, `src/shared/cron.test.ts`

**Interfaces:**
- Produces: `cronMatches(expr: string, d: Date): boolean` (5 campos; `*`, `N`, `*/N`, `A-B`, `A,B`; retorna `false` para expr malformada).

- [ ] **Step 1: Test (falha primeiro)**

`src/shared/cron.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { cronMatches } from './cron'

// Datas locais fixas (o matcher usa getHours/getMinutes/... locais)
const at = (y: number, mo: number, d: number, h: number, mi: number): Date => new Date(y, mo - 1, d, h, mi, 0, 0)

describe('cronMatches', () => {
  it('* * * * * casa qualquer minuto', () => {
    expect(cronMatches('* * * * *', at(2026, 7, 10, 3, 7))).toBe(true)
  })
  it('minuto/hora exatos', () => {
    expect(cronMatches('30 9 * * *', at(2026, 7, 10, 9, 30))).toBe(true)
    expect(cronMatches('30 9 * * *', at(2026, 7, 10, 9, 31))).toBe(false)
    expect(cronMatches('30 9 * * *', at(2026, 7, 10, 10, 30))).toBe(false)
  })
  it('*/15 casa múltiplos', () => {
    expect(cronMatches('*/15 * * * *', at(2026, 7, 10, 3, 0))).toBe(true)
    expect(cronMatches('*/15 * * * *', at(2026, 7, 10, 3, 15))).toBe(true)
    expect(cronMatches('*/15 * * * *', at(2026, 7, 10, 3, 16))).toBe(false)
  })
  it('intervalo e lista', () => {
    expect(cronMatches('0 9-17 * * *', at(2026, 7, 10, 13, 0))).toBe(true)
    expect(cronMatches('0 9-17 * * *', at(2026, 7, 10, 18, 0))).toBe(false)
    expect(cronMatches('0 0 * * 1,3,5', at(2026, 7, 10, 0, 0))).toBe(cronMatches('0 0 * * 5', at(2026, 7, 10, 0, 0)))
  })
  it('dia da semana (0=domingo)', () => {
    // 2026-07-10 é uma sexta-feira (dow=5)
    expect(cronMatches('* * * * 5', at(2026, 7, 10, 0, 0))).toBe(true)
    expect(cronMatches('* * * * 1', at(2026, 7, 10, 0, 0))).toBe(false)
  })
  it('expr malformada → false', () => {
    expect(cronMatches('nonsense', at(2026, 7, 10, 0, 0))).toBe(false)
    expect(cronMatches('* * *', at(2026, 7, 10, 0, 0))).toBe(false)
  })
})
```

- [ ] **Step 2: Implementar `src/shared/cron.ts`**

```ts
function matchField(spec: string, val: number): boolean {
  for (const part of spec.split(',')) {
    if (part === '*') return true
    if (part.startsWith('*/')) {
      const step = Number(part.slice(2))
      if (Number.isInteger(step) && step > 0 && val % step === 0) return true
      continue
    }
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number)
      if (Number.isFinite(a) && Number.isFinite(b) && val >= a && val <= b) return true
      continue
    }
    if (Number(part) === val) return true
  }
  return false
}

export function cronMatches(expr: string, d: Date): boolean {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const [min, hour, dom, mon, dow] = fields
  return (
    matchField(min, d.getMinutes()) &&
    matchField(hour, d.getHours()) &&
    matchField(dom, d.getDate()) &&
    matchField(mon, d.getMonth() + 1) &&
    matchField(dow, d.getDay())
  )
}
```

- [ ] **Step 3: Testes + typecheck** — verdes.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: matcher cron puro (Fase 10)"`

---

### Task 2: `RoutineScheduler` + IPC + disparo + persistência (TDD)

**Files:**
- Create: `src/main/routines/RoutineScheduler.ts` (+ `.test.ts`), `src/main/routines/registerRoutineIpc.ts` (+ `.test.ts`), `src/shared/routines.ts` (tipo `Routine`)
- Modify: `src/main/index.ts`, `src/preload/index.ts`

**Interfaces:**
- Produces:
  - `interface Routine { id; name; schedule; target; command; enabled }` (em `src/shared/routines.ts`).
  - `class RoutineScheduler { constructor(opts: { onFire: (r: Routine) => void; now?: () => Date; persistPath?: string }); tick(): void; start(): void; stop(): void; add(r: Omit<Routine,'id'>): Routine; list(): Routine[]; remove(id: string): void; setEnabled(id: string, enabled: boolean): void; loadPersisted(): Promise<void> }`
  - IPC `routine:list/add/remove/toggle` → `window.orkestra.routines.*`.
- Consumes: `cronMatches` (Task 1); no `index.ts`, `resolvePtyByName` + `agentBus` (Fase 6/7).

- [ ] **Step 1: `RoutineScheduler` test (falha primeiro)**

`RoutineScheduler.test.ts` (usa `now` injetável — sem fake timers p/ o `tick` manual):
```ts
import { describe, it, expect, vi } from 'vitest'
import { RoutineScheduler } from './RoutineScheduler'

const at = (h: number, mi: number): Date => new Date(2026, 6, 10, h, mi, 0, 0)

describe('RoutineScheduler', () => {
  it('dispara quando o cron casa e reporta a rotina', () => {
    let clock = at(9, 30)
    const onFire = vi.fn()
    const s = new RoutineScheduler({ onFire, now: () => clock })
    s.add({ name: 'R', schedule: '30 9 * * *', target: 'Dev', command: 'echo oi', enabled: true })
    s.tick()
    expect(onFire).toHaveBeenCalledTimes(1)
    expect(onFire.mock.calls[0][0]).toMatchObject({ target: 'Dev', command: 'echo oi' })
  })
  it('não dispara duas vezes no mesmo minuto (dedupe)', () => {
    const onFire = vi.fn()
    const s = new RoutineScheduler({ onFire, now: () => at(9, 30) })
    s.add({ name: 'R', schedule: '30 9 * * *', target: 'D', command: 'x', enabled: true })
    s.tick(); s.tick()
    expect(onFire).toHaveBeenCalledTimes(1)
  })
  it('não dispara rotina desabilitada', () => {
    const onFire = vi.fn()
    const s = new RoutineScheduler({ onFire, now: () => at(9, 30) })
    const r = s.add({ name: 'R', schedule: '* * * * *', target: 'D', command: 'x', enabled: true })
    s.setEnabled(r.id, false)
    s.tick()
    expect(onFire).not.toHaveBeenCalled()
  })
  it('remove tira a rotina da lista', () => {
    const s = new RoutineScheduler({ onFire: vi.fn(), now: () => at(1, 0) })
    const r = s.add({ name: 'R', schedule: '* * * * *', target: 'D', command: 'x', enabled: true })
    s.remove(r.id)
    expect(s.list()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Implementar `RoutineScheduler.ts`**

Guardar rotinas num `Map<id,Routine>`; `lastFired: Map<id, number>` (minuto-epoch). `tick()`: `now = opts.now?.() ?? new Date()`; `minute = Math.floor(now.getTime()/60000)`; para cada rotina `enabled` com `cronMatches(schedule, now)` e `lastFired.get(id) !== minute`: setar `lastFired`, chamar `opts.onFire(r)`. `add` gera `id` (`randomUUID`), persiste. `start()`=`setInterval(()=>this.tick(), 30000)`; `stop()`=`clearInterval`. `persist()`/`loadPersisted()` como o `FloorManager` (writeFile/readFile em `persistPath`, guardas Array.isArray). Import `cronMatches` de `../../shared/cron`.

- [ ] **Step 3: `registerRoutineIpc` (TDD)**

`registerRoutineIpc(ipcMain, scheduler)`: `routine:list`→`scheduler.list()`, `routine:add`→`scheduler.add(payload)`, `routine:remove`→`scheduler.remove(id)`, `routine:toggle`→`scheduler.setEnabled(id, enabled)`. Testar com `ipcMain` fake (mapa de handlers) + scheduler real.

- [ ] **Step 4: Fiar no `main/index.ts`**

`const routineScheduler = new RoutineScheduler({ persistPath: join(app.getPath('home'), '.orkestra', 'routines.json'), onFire: (r) => { const pty = resolvePtyByName(r.target); if (pty) agentBus.ask(pty, r.command) } })`; `await routineScheduler.loadPersisted()`; `routineScheduler.start()` no `whenReady`; `routineScheduler.stop()` no `before-quit`; `registerRoutineIpc(ipcMain, routineScheduler)`; expor `window.orkestra.routines.*` no preload. (`resolvePtyByName`/`agentBus` já existem da Fase 6/7 — reusar.)

- [ ] **Step 5: Testes + typecheck** — verdes.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: RoutineScheduler + IPC + disparo via AgentBus + persistencia (Fase 10)"`

---

### Task 3: `orq routine` + rotas HTTP + UI (RoutinesPanel) + checkpoint (TDD)

**Files:**
- Modify: `src/main/orchestration/OrchestrationServer.ts` (+ `.test.ts`), `src/orq/orq.ts` (+ `.test.ts`), `src/main/index.ts`, `src/renderer/src/components/Canvas.tsx`, `src/renderer/src/env.d.ts`
- Create: `src/renderer/src/components/RoutinesPanel.tsx`

**Interfaces:**
- Consumes: `RoutineScheduler` (Task 2) via novas opts do server; `window.orkestra.routines.*` (Task 2).
- Produces:
  - `OrchestrationServer` opts ganham `routines?: { list(); add(r); remove(id) }`; rotas `GET /routines`, `POST /routines` (`{name,schedule,target,command}`), `POST /routines/remove` (`{id}`).
  - `orq routine list|add|remove`.
  - `RoutinesPanel.tsx`: lista rotinas, criar (nome/cron/alvo/comando), habilitar/desabilitar, remover.

- [ ] **Step 1: Endpoints test (falha primeiro)**

Em `OrchestrationServer.test.ts`: `GET /routines` (token) → devolve `routines.list()`; `POST /routines {name,schedule,target,command}` → chama `routines.add`, 200; body inválido → 400; `POST /routines/remove {id}` → `routines.remove`, 200. Sem token → 401.

- [ ] **Step 2: Implementar endpoints** — em `OrchestrationServer.ts`, após o token gate, as 3 rotas (mesmo padrão try/catch do `/note`). Estender opts com `routines?`.

- [ ] **Step 3: `orq routine` (TDD)** — em `orq.test.ts`: `runOrq(['routine','add','R','*/5 * * * *','Dev','echo oi'], env)` → `routines.add` recebe; `runOrq(['routine','list'], env)` imprime. Em `orq.ts`: sub-router `routine` com `list` (GET), `add <nome> <cron> <alvo> <comando...>` (POST; comando = resto juntado), `remove <id>` (POST /routines/remove).

- [ ] **Step 4: Fiar server no `index.ts`** — passar `routines: { list: () => routineScheduler.list(), add: (r) => routineScheduler.add(r), remove: (id) => routineScheduler.remove(id) }` ao `OrchestrationServer`.

- [ ] **Step 5: `RoutinesPanel.tsx` + registrar em `Canvas.tsx`** — painel (canto) que `routines.list()` no mount; form criar (nome, cron, alvo, comando → `routines.add`); por rotina: toggle habilitar (`routines.toggle`) + remover (`routines.remove`); re-lista. Erros em try/catch. Registrar no `Canvas.tsx` (ao lado do FloorsPanel). Tipos em `env.d.ts` se necessário.

- [ ] **Step 6: Testes + typecheck + build** — verdes; `out/orq/bin.js` emitido.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: orq routine + rotas HTTP + RoutinesPanel (Fase 10)"`

- [ ] **Step 8: CHECKPOINT VISUAL (humano)** — `npm run dev`. Criar um terminal "Dev". No RoutinesPanel, criar uma rotina: nome "ping", cron `*/1 * * * *` (todo minuto), alvo "Dev", comando `echo tick`. Em ≤1 min, o terminal "Dev" recebe `echo tick` sozinho. Testar `orq routine list` num terminal (lista a rotina); `orq routine add "hora" "0 * * * *" "Dev" "date"`. Desabilitar/remover no painel. *(Humano; o implementer para no build. Nota: o scheduler tica a cada 30s — o disparo pode levar até ~1min.)*

---

## Notas de risco
- **Resolução de minuto:** o cron tem granularidade de 1 minuto; o `tick` a cada 30s + dedupe por minuto garante ≤1 disparo/minuto por rotina. Se o app estiver fechado no horário, a rotina **não** dispara (sem catch-up — comportamento esperado p/ um app desktop).
- **Alvo ausente:** se o terminal alvo não existe no disparo, `resolvePtyByName` retorna undefined → no-op silencioso (a rotina não faz nada). Considerar um log/feedback na Fase 13.
- **Encadeamento `&&`:** feito pelo shell no comando (ex: `git pull && npm test`) — nenhuma lógica especial no scheduler.
- **Fuso horário:** o matcher usa a hora **local** do sistema (`getHours` etc.) — consistente com a expectativa do usuário; documentar.
- **Persistência:** rotinas sobrevivem a restart (`routines.json`); `lastFired` é em-memória (após restart, uma rotina pode disparar de novo no mesmo minuto do restart — aceitável).
