# Orkestra — Fase 20 (Indicador de Atenção do Agente) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Quando um terminal-agente **produz output e depois fica em silêncio** (o agente parou / terminou / espera você), o terminal ganha um **indicador visual de "precisa de atenção"** no header; uma **notificação do SO** opcional avisa quando você não está com a janela em foco; **Shift+A** pula ao próximo terminal que precisa de atenção; o indicador **limpa quando você foca aquele terminal**. É a peça do "companheiro" viável sem LLM (reusa a detecção de ociosidade da Fase 14).

**Architecture:** O `AgentBus` (main), que já observa `onData` de cada pty, ganha um **watcher de atenção**: por pty, ao chegar output marca "teve atividade" e reinicia um timer de `idleMs`; quando o timer expira **e houve output desde a última limpeza**, dispara `onAttention(ptyId)`. O main resolve `ptyId → nodeId` (`PtyManager.nodeForPty`) e envia `agent:attention` ao renderer. O renderer marca o nó (um `Set<nodeId>` no store); `TerminalFlowNode` mostra o indicador; focar o terminal envia `agent:attention:clear` (o `AgentBus` reseta o flag). A semântica "output desde a última limpeza" evita que um shell parado no prompt acenda para sempre — só acende quando **algo novo aconteceu e parou**.

**Tech Stack:** Electron `Notification` (main). Vitest com fake timers para o watcher.

## Global Constraints

- Renderer não importa `fs`/`http`/`node-pty`/`child_process`. O watcher/timers e a notificação ficam no main.
- `idleMs` default (ex.: 1200 ms) é **empírico** (mesma ressalva da Fase 14) — ajustável; um valor conservador evita falsos positivos no meio de um stream.
- Zero regressão a terminais/`orq ask`/`waitForIdle`/notas/portais/projetos/árvore/grupos. Nomenclatura sem marcas de terceiros.

---

### Task 1: Watcher de atenção no `AgentBus` + `nodeForPty` + IPC + fiação (TDD)

**Files:**
- Modify: `src/main/orchestration/AgentBus.ts` (+ `.test.ts`), `src/main/pty/PtyManager.ts` (+ `.test.ts`), `src/main/index.ts`, `src/preload/index.ts`

**Interfaces:**
- Produces:
  - `AgentBus` gains: constructor optional `onAttention?: (ptyId: string) => void` and `idleMs?: number` (default 1200); `clearAttention(ptyId: string): void`. The watcher lives inside the existing `track()` `onData` subscription (no new subscription).
  - `PtyManager.nodeForPty(ptyId: string): string | undefined` (reverse of `ptyIdForNode`).
  - IPC: main→renderer `agent:attention` (payload `nodeId: string`); renderer→main `agent:attention:clear` (payload `nodeId`). Preload: `onAgentAttention(cb)` + `clearAgentAttention(nodeId)`.

- [ ] **Step 1: `AgentBus` attention test (falha primeiro, fake timers)**

Em `AgentBus.test.ts`:
```ts
describe('AgentBus attention', () => {
  beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers())
  it('dispara onAttention após output seguido de idleMs de silêncio', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const onAttention = vi.fn()
    const bus = new AgentBus(mgr, { onAttention, idleMs: 1000 })
    const id = mgr.spawn({}); bus.track(id)
    f.emit('trabalhando...\n')            // atividade
    vi.advanceTimersByTime(1000)          // silêncio por idleMs
    expect(onAttention).toHaveBeenCalledWith(id)
  })
  it('não redispara sem novo output (só uma vez até limpar)', () => {
    // ...emit, advance→fire once; advance more→still once; emit again→can fire again...
  })
  it('não dispara se não houve output desde a última limpeza', () => {
    // clearAttention(id) então advance → onAttention NÃO chamado (sem novo output)
  })
})
```

- [ ] **Step 2: Implementar o watcher em `AgentBus.ts`**

Em `track(ptyId)`, dentro do `onData` existente: setar `sawOutput.set(ptyId, true)`; `clearTimeout(attTimer[ptyId])`; `attTimer[ptyId] = setTimeout(() => { if (sawOutput.get(ptyId)) this.opts.onAttention?.(ptyId) }, idleMs)`. `clearAttention(ptyId)`: `sawOutput.set(ptyId, false)`, `clearTimeout(attTimer[ptyId])`. `untrack`: limpar timer + maps. Não redisparar: após o fire, deixar `sawOutput` true mas não reagendar até novo `onData` (o timer só é reagendado em `onData`); um segundo fire só ocorre com novo output → novo timer. (Guardar `onAttention`/`idleMs` num `opts` — manter o construtor retrocompatível: `constructor(pty, opts?: { onAttention?; idleMs? })`.)

- [ ] **Step 3: `PtyManager.nodeForPty` (TDD)** — teste: `spawn({nodeId:'n1'})` → `nodeForPty(id)==='n1'`; após `kill`/exit, `nodeForPty` volta undefined. Impl: varrer `ptyByNode` por valor (ou manter um reverso).

- [ ] **Step 4: Fiar `main/index.ts` + preload**

`new AgentBus(ptyManager, { onAttention: (ptyId) => { const nodeId = ptyManager.nodeForPty(ptyId); if (!nodeId) return; mainWindow?.webContents.send('agent:attention', nodeId); if (mainWindow && !mainWindow.isFocused()) { try { new Notification({ title: 'Agente ocioso', body: 'Um agente parou e pode precisar de você.' }).show() } catch {} } } })`. `ipcMain.on('agent:attention:clear', (_e, nodeId) => { const p = ptyManager.ptyIdForNode(nodeId); if (p) agentBus.clearAttention(p) })`. Preload: `onAgentAttention: (cb) => { const l=(_e,nodeId)=>cb(nodeId); ipcRenderer.on('agent:attention', l); return ()=>ipcRenderer.removeListener('agent:attention', l) }`, `clearAgentAttention: (nodeId) => ipcRenderer.send('agent:attention:clear', nodeId)`.

- [ ] **Step 5: Testes + typecheck + build** — verdes.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: watcher de atencao do agente no AgentBus + nodeForPty + IPC + notificacao SO (Fase 20)"`

---

### Task 2: Indicador no `TerminalFlowNode` + limpar ao focar + Shift+A + checkpoint

**Files:**
- Modify: `src/renderer/src/store/canvasStore.ts` (+ `.test.ts`), `src/renderer/src/components/TerminalFlowNode.tsx` (+ CSS em `nodes.css`), `src/renderer/src/components/Canvas.tsx` (listener + Shift+A), `src/renderer/src/components/TerminalNode.tsx` (limpar ao focar)

**Interfaces:**
- Consumes: `window.orkestra.onAgentAttention` / `clearAgentAttention` (Task 1).
- Produces: store `attention: Set<string>` (nodeIds) + `setAttention(nodeId, on)`; helpers para o Canvas/TerminalFlowNode lerem.

- [ ] **Step 1: Store attention (TDD)** — `attention` (Set), `setAttention(nodeId, on)` add/remove. Teste: setAttention liga/desliga; não afeta outros. (Set em zustand: guardar como novo Set a cada mudança p/ re-render.)

- [ ] **Step 2: Listener em `Canvas.tsx`** — `useEffect`: `const off = window.orkestra.onAgentAttention((nodeId) => setAttention(nodeId, true)); return off`. **Shift+A** (no keydown handler, DEPOIS do guard de digitação): achar o próximo nodeId em `attention` e enquadrá-lo (`fitView({nodes:[{id}], duration:300})` + selecioná-lo); ciclar entre eles em chamadas repetidas.

- [ ] **Step 3: Indicador no `TerminalFlowNode`** — ler `attention.has(id)`; quando true, mostrar um ponto/badge pulsante no header (`--warn` ou `--accent`, animação sutil respeitando `prefers-reduced-motion`), com `title="Este agente parou e pode precisar de você"`. 

- [ ] **Step 4: Limpar ao focar** — quando o terminal ganha foco (o xterm/host recebe foco, ou ao clicar no nó/terminal), chamar `setAttention(id, false)` + `window.orkestra.clearAgentAttention(id)`. Em `TerminalNode.tsx` (que hospeda o xterm), um handler de `focus` no wrapper, OU no `TerminalFlowNode` um `onFocusCapture`/click. (Escolher o gancho mais simples que dispare quando o usuário passa a interagir com aquele terminal.)

- [ ] **Step 5: Testes + typecheck + build** — verdes.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: indicador de atencao no terminal + Shift+A p/ pular + limpar ao focar (Fase 20)"`

- [ ] **Step 7: CHECKPOINT VISUAL (humano)** — `npm run dev`. Abrir 2 terminais, rodar um comando que produz output e termina (ex.: `ls; sleep 1`) num deles sem focá-lo → após ~1s ocioso, o header pisca o indicador; **Shift+A** enquadra esse terminal; focar/clicar nele apaga o indicador. Com a janela do app em segundo plano, ao ficar ocioso surge uma notificação do SO.

---

## Notas de risco
- **Heurística de ociosidade frágil:** um agente que pausa longamente no meio de uma resposta pode acender cedo; `idleMs` conservador + "só re-acende com novo output" + limpar-ao-focar reduzem o ruído. Ajuste fino precisa de validação com agentes reais (checkpoint do usuário) — mesma ressalva da Fase 14.
- **Shell puro:** acende ao terminar um comando (útil), e não re-acende parado no prompt (sem novo output). Aceitável.
- **Notificação do SO:** só quando a janela não está focada, e envolvida em try/catch (permissão de notificação varia por SO). Não bloquear se falhar.
- **ptyId↔nodeId:** `nodeForPty` reverte o `ptyByNode` existente; um pty sem nodeId (spawn sem nodeId) não gera atenção — aceitável (todo terminal do canvas passa nodeId).
- **Limpar ao focar:** garantir que focar um terminal limpa só aquele; não limpar todos.
