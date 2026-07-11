# Orkestra — Fase 14 (Melhorias & Robustez) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fechar as melhorias de maior valor deixadas em aberto ao longo do projeto: (1) **detecção de ociosidade** para um `orq ask` **bloqueante** (o risco técnico central, deferido no MVP); (2) **CI multi-plataforma** + polimentos de completude (`engines.node`, cron `dow=7`); (3) **hardening** do servidor de orquestração (cap de corpo, comparação de token em tempo constante).

**Architecture:** O `AgentBus` (main) ganha `waitForIdle(ptyId, opts)` que resolve quando o terminal fica em silêncio por `idleMs` (ou no teto `timeoutMs`), devolvendo o output acumulado desde a chamada. Um novo caminho `ask` **com espera** no `OrchestrationServer` (POST body `{wait:true}`) chama `ask` + `waitForIdle` e responde com o output; `orq ask "<nome>" "<prompt>" --wait` usa esse caminho. Tudo testável com **fake timers** + fake pty. O CI vira uma matriz GitHub Actions. Os hardenings são mudanças pontuais no `OrchestrationServer`.

**Nota honesta (registrada):** a heurística de ociosidade é **frágil por natureza** — o valor de `idleMs` (default 1500 ms) é um ponto de partida que precisa de **tuning com agentes reais** (um agente pode pausar no meio de uma resposta). O mecanismo é correto e testado; o valor default é empírico e ajustável por env/opção. Por isso o `ask` fire-and-forget (Fase 6) **permanece o default**; `--wait` é opt-in.

**Tech Stack:** sem deps novas. Vitest com `vi.useFakeTimers()`.

## Global Constraints

- Renderer não importa `fs`/`http`/`node-pty`/`child_process`. Servidor segue 127.0.0.1 + token, gate antes do routing.
- `ask` sem `--wait` continua fire-and-forget (compat total com a Fase 6).
- `waitForIdle` usa timers reais em produção mas é testado com fake timers (nada de `Date.now()` não-injetável na lógica testada).
- Nomenclatura sem marcas do Maestri.

---

### Task 1: Detecção de ociosidade — `AgentBus.waitForIdle` + `orq ask --wait` (TDD)

**Files:**
- Modify: `src/main/orchestration/AgentBus.ts` (+ `.test.ts`), `src/main/orchestration/OrchestrationServer.ts` (+ `.test.ts`), `src/orq/orq.ts` (+ `.test.ts`), `src/main/index.ts`

**Interfaces:**
- Produces:
  - `AgentBus.waitForIdle(ptyId: string, opts?: { idleMs?: number; timeoutMs?: number }): Promise<string>` — resolve com o output acumulado desde a chamada quando não houver novo `onData` por `idleMs` (default 1500), ou no `timeoutMs` (default 120000), o que vier primeiro.
  - `OrchestrationServer` opts ganham `askWait?: (name: string, prompt: string) => Promise<{ ok: boolean; output?: string; error?: string }>`; `POST /ask` com body `{name, prompt, wait: true}` usa `askWait` e responde `{output}` (ou 404/timeout).
  - `orq ask "<nome>" "<prompt>" --wait` → POST /ask `{..., wait:true}`, imprime o output retornado.

- [ ] **Step 1: `waitForIdle` test (falha primeiro, fake timers)**

Em `AgentBus.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// ... reuse the existing fakePty helper (onData subscriber + emit + write)

describe('AgentBus.waitForIdle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('resolve com o output apos idleMs de silencio', async () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty); const bus = new AgentBus(mgr)
    const id = mgr.spawn({}); bus.track(id)
    const p = bus.waitForIdle(id, { idleMs: 1000, timeoutMs: 10000 })
    f.emit('resposta parte 1\n')
    vi.advanceTimersByTime(500)     // ainda não ocioso
    f.emit('resposta parte 2\n')    // reseta o timer de ociosidade
    vi.advanceTimersByTime(1000)    // agora 1000ms de silêncio
    await expect(p).resolves.toContain('resposta parte 2')
  })

  it('resolve no timeoutMs mesmo sem ficar ocioso', async () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty); const bus = new AgentBus(mgr)
    const id = mgr.spawn({}); bus.track(id)
    const p = bus.waitForIdle(id, { idleMs: 5000, timeoutMs: 2000 })
    const spam = setInterval(() => f.emit('x'), 100)  // nunca fica ocioso
    vi.advanceTimersByTime(2000)
    clearInterval(spam)
    await expect(p).resolves.toBeTypeOf('string')
  })
})
```

- [ ] **Step 2: Implementar `waitForIdle` em `AgentBus.ts`**

Registrar um subscriber `onData` temporário via `this.pty.onData(ptyId, cb)` que: (a) reinicia um timer de `idleMs` a cada chunk, (b) acumula o output desde a marca inicial. Quando o timer de ociosidade dispara OU o `timeoutMs` estoura, limpar timers e resolver com o output acumulado. Cuidado: como `PtyManager.onData` é aditivo e não retorna um "unsubscribe", use uma flag `done` para ignorar chunks após resolver (o subscriber fica registrado até o pty sair — aceitável; documentar). Guardar o output desde a marca lendo `read(ptyId)` no início e no fim (delta) OU acumular no próprio cb.

- [ ] **Step 3: `POST /ask` com `wait` (TDD) + `orq ask --wait`**

Em `OrchestrationServer.test.ts`: `POST /ask {name, prompt, wait:true}` (token) → chama `opts.askWait` e responde `{output}` (200); sem `askWait` configurado → cai no caminho `ask` normal (200 fire-and-forget) OU 404 (documentar a escolha; preferir: se `wait` e `askWait` ausente → 404). Em `orq.test.ts`: `runOrq(['ask','Dev','oi','--wait'], env)` → POST com `wait:true`, imprime o output. Em `orq.ts`: detectar a flag `--wait` nos args de `ask`; se presente, enviar `wait:true` e imprimir `res` output.

- [ ] **Step 4: Fiar no `main/index.ts`**

`askWait: async (name, prompt) => { const p = resolvePtyByName(name); if (!p) return { ok:false, error:'not found' }; agentBus.ask(p, prompt); const output = await agentBus.waitForIdle(p); return { ok:true, output } }` passado ao `OrchestrationServer`. Manter o `ask` fire-and-forget existente.

- [ ] **Step 5: Testes + typecheck + build** — verdes; `out/orq/bin.js` emitido.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: deteccao de ociosidade — AgentBus.waitForIdle + orq ask --wait bloqueante (Fase 14)"`

---

### Task 2: CI multi-plataforma + polimentos de completude (TDD onde aplicável)

**Files:**
- Modify: `.github/workflows/ci.yml`, `package.json` (engines), `src/shared/cron.ts` (+ `.test.ts`), `src/orq/orq.ts` (guard de `fetch`)

- [ ] **Step 1: CI matrix**

Ler o `.github/workflows/ci.yml` atual (hoje só `macos-latest` com lint/typecheck/test). Estendê-lo para uma **matriz** `runs-on: [ubuntu-latest, macos-latest, windows-latest]` rodando `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`. (Não empacotar no CI de PR — packaging/assinatura é um workflow de release separado, deixado como TODO comentado.) Node 20 na matriz.

- [ ] **Step 2: `engines.node` + guard de `fetch` no `orq`**

`package.json`: adicionar `"engines": { "node": ">=18" }` (o `orq` usa `fetch` global, disponível em Node ≥18). Em `orq.ts`: no início de `runOrq`, se `typeof fetch === 'undefined'`, imprimir um erro amigável ("orq requer Node >= 18 (fetch global indisponível)") e sair com código 1 — em vez de um `ReferenceError` cru. (TDD: um teste que injeta um env sem fetch é difícil; ao invés, testar a função extraída `hasFetch()` ou apenas garantir o guard por inspeção — se um teste for frágil, documentar e pular.)

- [ ] **Step 3: cron `dow=7` (domingo alternativo) (TDD)**

Em `cron.test.ts`: `cronMatches('* * * * 7', <um domingo>)` → `true` (hoje é `false`). Em `cron.ts`: no campo `dow`, tratar `7` como `0` (domingo) — normalizar `val`/o spec: se o campo dow contém `7`, também casar quando `getDay() === 0`. Implementação simples: ao avaliar o campo dow, se `matchField(dow, 0)` já cobre `0`, adicionar que `7` no spec casa `val===0` — e.g. normalizar cada parte `'7' → '0'` no campo dow antes de `matchField`, ou avaliar `matchField(dow, day) || (day===0 && matchField(dow, 7))`.

- [ ] **Step 4: Testes + typecheck** — verdes.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: CI multi-plataforma + engines.node + guard fetch + cron dow=7 (Fase 14)"`

---

### Task 3: Hardening do `OrchestrationServer` (TDD)

**Files:**
- Modify: `src/main/orchestration/OrchestrationServer.ts` (+ `.test.ts`)

**Interfaces:** sem novas exports públicas; comportamento defensivo.

- [ ] **Step 1: Cap de tamanho de corpo (TDD)**

Em `OrchestrationServer.test.ts`: um `POST /note` com um corpo maior que o cap (ex.: > 1 MB) → responde `413` (payload too large) e **não** chama `onCommand`. Em `OrchestrationServer.ts`: no acúmulo do corpo dos POSTs, manter um contador; se exceder `MAX_BODY` (1 MB), `res.writeHead(413).end('payload too large')`, `req.destroy()`, e abortar. Aplicar a todos os POSTs (fatorar num helper `readJsonBody(req, res, cb)` que já centraliza parse+cap — isto também resolve o Minor de duplicação dos ~9 blocos de parse).

- [ ] **Step 2: Comparação de token em tempo constante (TDD)**

Em `OrchestrationServer.ts`: trocar `req.headers['x-orkestra-token'] !== this.token` por uma comparação em tempo constante usando `crypto.timingSafeEqual` (com guarda de comprimento: se os buffers diferem em tamanho, é 401 sem comparar). Adicionar um teste: token errado do mesmo comprimento → 401; token certo → passa. (Baixo risco sob o threat model localhost, mas fecha o Minor e é barato.)

- [ ] **Step 3: Testes + typecheck + build** — verdes.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: hardening do OrchestrationServer — cap de corpo (413) + token timing-safe + readJsonBody helper (Fase 14)"`

---

## Notas de risco
- **Ociosidade frágil:** `idleMs` default (1500 ms) é empírico; um agente que pausa longamente no meio da resposta pode disparar cedo. Mitigação: `--wait` é opt-in, `timeoutMs` como teto, e o valor é ajustável. Tuning fino exige validação com agentes reais (checkpoint do usuário).
- **`waitForIdle` sem unsubscribe:** o `PtyManager.onData` é aditivo e não expõe remoção; o subscriber temporário permanece até o pty sair, mas é inerte após resolver (flag `done`). Aceitável; um `offData` pode ser adicionado depois se acumular muitos waits no mesmo pty.
- **CI:** a matriz roda quando o repo tiver remote no GitHub; localmente o YAML só é validado (parse). Windows/Linux builds só saem no CI (não no macOS Intel local).
- **`timingSafeEqual`:** exige buffers de mesmo tamanho; a guarda de comprimento evita o throw (e não vaza timing além do comprimento, que já é público-ish).
- **Zero regressão** no `ask` fire-and-forget e em todas as rotas existentes.
