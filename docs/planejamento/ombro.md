# Plano de Implementação — Ombro

> **Origem:** `docs/analise-maestri-360/ombro.md` · **Status:** proposto (pronto para implementar) · **Onda(s):** 1 e 2 (metade SEM LLM)

---

## 1. Objetivo & valor

Capturar **todo o valor sem-LLM** do Ombro (o companheiro que "olha por cima do seu ombro" e avisa quando um agente para/trava) reusando a infraestrutura de atenção/ociosidade **que o Orkestra já tem funcionando**. O objetivo é fechar o ciclo **alerta → ação → contexto**, sem tocar na camada de LLM (resumo/Q&A/notas automáticas), que fica **explicitamente fora de escopo**.

Duas ondas incrementais:

- **Onda 1 — Notificação clicável (fecha o ciclo alerta→ação).** Hoje a notificação nativa dispara mas é "morta": clicar nela não faz nada. Adicionar `notification.on('click')` que **foca a janela e enquadra o nó culpado** (reusa o `ptyId→nodeId` já resolvido e a lógica de enquadrar do `Shift+A`). É o maior salto de valor por menor esforço.
- **Onda 2 — Briefing sem LLM (§6.1 D/C/E/F do doc de origem).** Distinguir **"travou" vs "terminou" vs "precisa de você"** por padrões conhecidos no buffer (mesma técnica de `generatingSignal.ts`); enriquecer o **corpo da notificação** com nome do agente + prévia da última linha; **HUD** de agentes aguardando dentro do app; **notificação agregada/anti-spam**.

**Fora de escopo (registrar e NÃO perseguir agora):** a camada de LLM — resumo do que aconteceu, sugestão de próximo passo, Q&A em linguagem natural, notas automáticas "Ombro Notes" e resumo de notas (§6.2 G/H/I/J do doc de origem). Exige LLM **local** (lock-in de hardware: Apple Silicon / Ollama / llama.cpp) ou **remoto** (contraria o diferencial on-device e expõe buffer de terminal). A estratégia deliberada é **extrair 100% do valor sem-LLM primeiro**; o gatilho (`onAttention`) e a matéria-prima (`agentBus.read`) já ficam prontos para plugar o LLM depois, se e quando for reintroduzido.

---

## 2. Estado atual no código (verificado)

Verificado lendo o código real em 2026-07-15. **A maior parte dos caminhos do doc de origem confere; há UMA correção material** (o watcher de "busy"/`onBusyChange` foi **removido** — o doc §5.1 ainda o cita).

| Arquivo real | O que já faz | Relevância |
|---|---|---|
| `src/main/orchestration/AgentBus.ts` | `track(ptyId)` mantém, **dentro da mesma assinatura `onData`**, um watcher de atenção: cada chunk marca `sawOutput` e reagenda um timer; após `idleMs` de silêncio dispara `opts.onAttention(ptyId)` **uma vez** (não redispara sem novo output). `DEFAULT_ATTENTION_IDLE_MS = 1200` (**linha 14**). `clearAttention` (**linha 81**), `untrack`/auto-untrack via `onExit` (**linhas 63, 87**), `read(ptyId)` devolve o buffer acumulado (teto `MAX = 8000`, **linha 75**), `waitForIdle` bloqueante (**linha 123**). | **Base da Onda 1 e 2.** O gatilho "trabalhando→ocioso" e a captura de buffer (`read`) já existem. |
| `src/main/index.ts` | Constrói o `AgentBus` com `onAttention` (**linhas 32-55**): resolve `ptyId→nodeId` via `ptyManager.nodeForPty` (**linha 34**); respeita `monitor === false` lendo o `mirror` (**linha 38**); envia `agent:attention` ao renderer (**linha 42**, com guard `isDestroyed`); **se a janela não está em foco** (`!mainWindow.isFocused()`, **linha 44**) dispara `new Notification({ title: 'Agente ocioso', body: 'Um agente parou e pode precisar de você.' })` dentro de `try/catch` (**linhas 46-53**). `Notification` importado do Electron (**linha 1**). IPC `agent:attention:clear` → `agentBus.clearAttention` (**linhas 302-305**). | **Ponto de edição da Onda 1 (click handler) e Onda 2 (corpo enriquecido).** A `Notification` é criada inline e descartada — **não há `.on('click')`**. |
| `src/preload/index.ts` | `onAgentAttention(cb)` assina `agent:attention` (**linhas 118-122**); `clearAgentAttention(nodeId)` envia `agent:attention:clear` (**linha 123**). Padrão de assinatura-com-unsubscribe já estabelecido. | **Ponte para o novo evento `agent:frame`** (Onda 1). |
| `src/renderer/src/components/Canvas.tsx` | Assina `window.orkestra.onAgentAttention` → `setAttention(nodeId, true)` respeitando `monitor === false` (**linhas 166-180**). **Atalho `Shift+A`** (**linhas 358-376**): pega `Array.from(attention)`, cicla via `attentionCycleRef`, **`fitView({ nodes: [{ id: targetId }] })`** (enquadra) e **seleciona** o nó via `onNodesChange` — NÃO limpa atenção. | **Fonte da lógica de "enquadrar nó"** a reusar no click handler (Onda 1). |
| `src/renderer/src/components/TerminalFlowNode.tsx` | `hasAttention = useCanvasStore(s => s.attention.has(id))` (**linha 22**); renderiza o badge `.ork-node-attention` com `role="status"` (**linhas 95-102**); `nodeState = generating ? 'generating' : hasAttention ? 'needsInput' : 'idle'` (**linha 63**); `handleFocusCapture` limpa a atenção do próprio id (`setAttention(id,false)` + `clearAgentAttention(id)`, **linhas 74-77**). | **Consumidor do sinal de atenção.** HUD (Onda 2) é irmão deste badge. |
| `src/renderer/src/terminal/generatingSignal.ts` (+ `.test.ts`) | Função **pura** `screenIsGenerating(visibleLines: string[]): boolean` casando `WORKING_MARKER = /esc to interrupt/i` contra as linhas VISÍVEIS do xterm. `TerminalNode.tsx` varre `term.buffer.active` (throttled 150 ms, `scanGenerating`, **linhas 92-118**) e chama `setGenerating`. | **Molde exato** do detector "travou/terminou/precisa-atenção" (Onda 2) — mesma técnica: regex sobre linhas visíveis, função pura, TDD denso. |
| `src/renderer/src/store/canvasStore.ts` | Sets efêmeros (nunca serializados) `attention` / `generating` com setters imutáveis (**linhas 281-297, 446-462**); limpeza de `attention`/`generating` ao remover nó (**~668-690**) e em `remove` por tecla (**~849-859**). | **Fonte de verdade** do HUD (Onda 2) e do `Shift+A`. |
| `src/main/pty/PtyManager.ts` | `nodeForPty(ptyId)` (**linha 94**) e `ptyIdForNode(nodeId)` (**linha 86**) — o pipeline `ptyId↔nodeId` que o Ombro precisa. | Reuso direto no click handler (já usado pelo `onAttention`). |
| `src/main/orchestration/OrchestrationServer.ts` (via `src/main/index.ts`) | `check(name)` devolve `agentBus.read(pty)` (buffer ao vivo, **linhas 112-115**); `ask/askWait/askRaw`. | Fundação de captura de estado (Q&A cru via `orq check`) — não muda nesta entrega. |
| `src/renderer/src/components/NewTerminalModal.tsx` | Toggle `monitor` (default `true`, **linhas 36/56/160**), propagado ao `mirror` via `useOrchestrationSync` (`src/shared/orchestration.ts:8`). | Já respeitado por `onAttention` e Canvas; HUD/notificações **devem** respeitá-lo também. |

### 2.1 Correção de caminho stale (importante)

- **`AgentBus.onBusyChange` / evento `agent:busy` / `onAgentBusy` NÃO EXISTEM MAIS.** O doc de origem §5.1 os descreve ("watcher de busy `onBusyChange`, linhas 28/85-100"; "`onBusyChange` → `agent:busy`, linhas 62-68"; preload "`onAgentBusy`, linhas 129-132"). **Verificado:** `grep -rn "onBusy\|agent:busy\|onAgentBusy\|onBusyChange" src/` retorna **apenas um comentário** em `Canvas.tsx:189` dizendo que esse plumbing **foi removido**. O sinal de "generating" hoje vem **100% da varredura de conteúdo** (`generatingSignal.ts`), não de um watcher de ociosidade. **Nenhuma tarefa abaixo depende do `onBusyChange`.**
- Ajuste fino de linhas: `onAttention` está em **32-55** (não 32-54); `waitForIdle` em **123** (não 175). Sem impacto nas tarefas.

---

## 3. Gaps priorizados

| Gap | Prioridade | Valor | Esforço | Onda |
|---|---|---|---|---|
| **#2 Notificação clicável** — clicar foca a janela e enquadra o `nodeId` (reusa `ptyId→nodeId` + lógica do `Shift+A`) | **P1** | Alto | **M** | 1 |
| **Validar/polir a notificação existente** (permissão do SO em macOS/Windows; texto) | P1 | Alto | S (QA) | 1 |
| **Detector "travou/terminou/precisa-atenção"** — função pura sobre o buffer (regex `(y/n)` / stack trace), mesma técnica de `generatingSignal.ts` | **P1** | Médio-Alto | **M** | 2 |
| **Corpo da notificação enriquecido** — nome do agente + prévia da última linha não-vazia + título por status | P2 | Médio-Alto | **S** | 2 |
| **HUD de agentes que precisam de atenção** — lista/contador dentro do app sobre o Set `attention` | P2 | Médio | **M** | 2 |
| **Notificação agregada / anti-spam** — coalescer eventos numa janela curta ("2 agentes ficaram ociosos") | P3 | Baixo-Médio | **M** | 2 |
| ~~Resumo / Sugestão de próximo passo / Q&A NL / Notas automáticas~~ (LLM) | — | Alto | L | **fora de escopo** |

---

## 4. Tarefas de implementação (TDD, em ordem)

> O detector de "travou/terminou/precisa-atenção" e o extrator de prévia são **funções puras sobre texto do buffer** — capriche no TDD (mesma técnica e estilo de `generatingSignal.test.ts`). Comando de teste padrão: `npx vitest run <arquivo>`. Config: `vitest.config.ts` inclui `src/**/*.test.ts`, `environment: 'node'`, `globals: false` (import explícito de `vitest`).

---

### T1 — Extrair helper puro "enquadrar + selecionar nó" do `Shift+A`  [P1 · S · Onda 1]

Pré-requisito da notificação clicável: hoje a lógica que enquadra/seleciona um nó vive **inline** no handler de `Shift+A` (`Canvas.tsx:358-376`). Extraí-la para um módulo puro e testável permite que **tanto o `Shift+A` quanto o click handler da notificação** a reusem (sem duplicação).

- **Arquivos a tocar:**
  - `src/renderer/src/canvas/frameNode.ts` ((novo))
  - `src/renderer/src/canvas/frameNode.test.ts` ((novo))
  - `src/renderer/src/components/Canvas.tsx` (refatorar o `Shift+A` para usar o helper)
- **Passos TDD:**
  1. **Teste que falha** (`frameNode.test.ts`): `selectionChangesToFocus(nodes, targetId)` retorna os `NodeChange[]` que **selecionam só o alvo e desmarcam os demais**. Casos concretos:
     - `nodes=[{id:'a',selected:false},{id:'b',selected:true}]`, `targetId='a'` → `[{id:'a',type:'select',selected:true},{id:'b',type:'select',selected:false}]`.
     - alvo já selecionado e único selecionado → `[]` (nenhuma mudança).
     - `targetId` inexistente na lista → `[]` (no-op seguro).
  2. **Implementação:** função pura `selectionChangesToFocus(nodes: {id:string;selected?:boolean}[], targetId: string): NodeChange[]` (a mesma varredura das linhas 367-374 do `Canvas.tsx`, isolada). Opcional: `frameNode(reactFlow, nodes, onNodesChange, targetId)` que chama `fitView({ nodes:[{id:targetId}], duration:300 })` + aplica as changes — mas **a lógica testável é `selectionChangesToFocus`** (o `fitView` é efeito colateral do React Flow, não unit-testável).
  3. **Verde:** `npx vitest run src/renderer/src/canvas/frameNode.test.ts`.
- **Critérios de aceite:**
  - `Shift+A` continua enquadrando + selecionando exatamente como antes (nenhuma regressão de comportamento).
  - `selectionChangesToFocus` é pura (sem React/DOM) e coberta pelos 3 casos.
  - `npm run typecheck` e `npm run lint` verdes.
- **Notas:** manter o `attentionCycleRef` (ciclo entre múltiplos) no `Canvas.tsx` — ele é estado do handler, não do helper. **Não** limpar atenção aqui (limpeza continua sendo do `handleFocusCapture` do `TerminalFlowNode`).

---

### T2 — Notificação clicável: foca a janela e enquadra o nó  [P1 · M · Onda 1]

Fecha o ciclo **alerta→ação**: clicar na notificação nativa traz a janela à frente e enquadra o agente ocioso.

- **Arquivos a tocar:**
  - `src/main/index.ts` (dentro do callback `onAttention`, linhas 44-53 — guardar a `Notification` numa const e adicionar `.on('click')`)
  - `src/preload/index.ts` (novo `onAgentFrame(cb)` assinando `agent:frame`, no molde de `onAgentAttention`)
  - `src/renderer/src/components/Canvas.tsx` (assinar `onAgentFrame` e chamar o helper da T1)
  - `src/preload/index.d.ts` / tipo `OrkestraApi` se houver declaração de tipos exposta (verificar; `OrkestraApi = typeof api` já propaga o tipo)
- **Passos TDD:**
  1. **Teste que falha:** o click handler em si depende de `Notification`/`BrowserWindow` do Electron (não unit-testável sem harness). Cobrir a **parte pura** já feita na T1 (`selectionChangesToFocus`) e, no `main`, extrair a decisão testável: `frameTargetFromAttention(nodeId): { channel: 'agent:frame'; nodeId }` — ou, mais simples, **não** adicionar teste unitário no `main` (é composition root, sem testes hoje) e validar por execução (`npm run dev`). Se quiser um alvo de teste no main, extrair `buildAttentionNotification` (T4) já cobre o objeto; o wiring do click é validado manualmente.
  2. **Implementação:**
     - `main/index.ts`: `const notification = new Notification({...})`; `notification.on('click', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('agent:frame', nodeId) } })`; `notification.show()`. Tudo dentro do `try/catch` existente. `nodeId` já está resolvido no escopo do callback (linha 34).
     - `preload/index.ts`: `onAgentFrame: (cb) => { const l = (_e, nodeId) => cb(nodeId); ipcRenderer.on('agent:frame', l); return () => ipcRenderer.removeListener('agent:frame', l) }`.
     - `Canvas.tsx`: `useEffect(() => window.orkestra.onAgentFrame((nodeId) => { fitView({ nodes:[{id:nodeId}], duration:300 }); const changes = selectionChangesToFocus(useCanvasStore.getState().nodes, nodeId); if (changes.length) onNodesChange(changes) }), [fitView, onNodesChange])`.
  3. **Verde:** `npx vitest run src/renderer/src/canvas/frameNode.test.ts` (T1 segue verde) + validação por execução (`npm run dev`: rodar um agente, tirar o foco da janela, deixar ocioso, clicar na notificação → janela volta e enquadra o nó).
- **Critérios de aceite:**
  - Clicar na notificação **foca a janela** (mesmo minimizada) e **enquadra + seleciona** o nó do agente ocioso.
  - Se o nó não existir mais (terminal de outro projeto / removido): `fitView` num id inexistente é no-op do React Flow e `selectionChangesToFocus` devolve `[]` — **nenhum crash**.
  - Respeita `monitor === false` (a notificação nem é criada nesse caso — guard já existe na linha 38).
  - `npm run typecheck` / `npm run lint` verdes.
- **Notas / riscos:** no macOS a notificação só dispara com a janela **fora de foco** (guard `!isFocused()`), então o click sempre traz de um estado "não focado" — correto. Edge: agente de **outro projeto** (nó ausente no canvas atual) — o `nodeId` chega mas o `fitView`/seleção é no-op; aceitável (a notificação do SO já cobre o aviso cross-project). Não abrir/trocar de projeto automaticamente nesta entrega (fora de escopo; anotar como follow-up).

---

### T3 — Detector puro "travou / terminou / precisa-atenção" + prévia da última linha  [P1 · M · Onda 2]

**Peça central da Onda 2.** Função pura sobre texto do buffer, mesma técnica de `generatingSignal.ts`. Colocada em `src/shared/` para ser importável **tanto pelo `main`** (corpo da notificação, T4) **quanto pelo renderer** (HUD, T5) — segue o padrão de módulos puros compartilhados (`roles.ts`, `presets.ts`, `ssh.ts`, cada um com `.test.ts` irmão).

- **Arquivos a tocar:**
  - `src/shared/agentStatus.ts` ((novo))
  - `src/shared/agentStatus.test.ts` ((novo))
- **Passos TDD:**
  1. **Teste que falha** (`agentStatus.test.ts`) — casos concretos (estilo `generatingSignal.test.ts`):
     - **precisa de atenção (needs-input):** `classifyAgentStatus(['Do you want to proceed? (y/n)'])` → `'needs-input'`; idem `'Overwrite existing file? [y/N]'`, `'Continue? (yes/no)'`, `'Press Enter to continue'`, `'❯ 1. Yes  2. No'` (prompt de seleção estilo Claude Code). Case-insensitive.
     - **travou (crashed):** `classifyAgentStatus(['Traceback (most recent call last):','  File "app.py", line 42, in <module>','ValueError: boom'])` → `'crashed'`; idem `'Error: ENOENT: no such file'`, `'panic: runtime error'`, `'    at Object.<anonymous> (/x/y.js:10:5)'`, `'Segmentation fault (core dumped)'`.
     - **terminou (done):** texto normal sem marcas → `'done'` (ex.: `['Tudo pronto.','- rodei os testes, tudo verde']`).
     - **precedência:** needs-input **vence** crashed vence done (um stack trace seguido de um `(y/n)` classifica como `'needs-input'`) — testar a ordem explicitamente.
     - **prévia:** `lastNonEmptyLine(['linha A','',''])` → `'linha A'`; `lastNonEmptyLine([])` / `['','  ']` → `''` (string vazia, nunca `undefined`); trim de espaços.
     - **ANSI:** `stripAnsi('\x1b[32mok\x1b[0m')` → `'ok'`; e `lastNonEmptyLine(toLines('\x1b[2K\x1b[1G done\n'))` → `'done'` (o buffer cru de `agentBus.read` contém escapes — ver Notas).
  2. **Implementação:**
     - `export type AgentStatus = 'needs-input' | 'crashed' | 'done'`.
     - `NEEDS_INPUT_MARKERS: RegExp[]` (ex.: `/\((y\/n|yes\/no)\)/i`, `/\[y\/n\]/i`, `/do you want to (proceed|continue)/i`, `/press (enter|return) to continue/i`, `/overwrite\b.*\?/i`, `/^\s*❯?\s*\d+\.\s+(yes|no)\b/im`).
     - `CRASH_MARKERS: RegExp[]` (ex.: `/traceback \(most recent call last\)/i`, `/^\s*at\s+.+\(.*:\d+:\d+\)/m`, `/^\s*File ".*", line \d+/m`, `/\b(Error|Exception|panic):/`, `/segmentation fault/i`).
     - `stripAnsi(s: string): string` (regex de sequências CSI/OSC — `/\x1b\[[0-9;?]*[ -/]*[@-~]/g` + OSC).
     - `toLines(text: string): string[]` = `stripAnsi(text).split(/\r?\n/)`.
     - `classifyAgentStatus(lines: string[]): AgentStatus` — junta as linhas (ou testa por linha), aplica `NEEDS_INPUT_MARKERS` → `'needs-input'`; senão `CRASH_MARKERS` → `'crashed'`; senão `'done'`.
     - `lastNonEmptyLine(lines: string[]): string` — varre de trás pra frente o primeiro `line.trim() !== ''`, retorna `trim()`; default `''`.
  3. **Verde:** `npx vitest run src/shared/agentStatus.test.ts`.
- **Critérios de aceite:**
  - Todos os casos acima verdes; função **100% pura** (sem I/O, sem Electron, sem React).
  - Precedência needs-input > crashed > done testada.
  - `lastNonEmptyLine` nunca retorna `undefined`.
  - `npm run typecheck` / `npm run lint` verdes.
- **Notas / riscos (importante):**
  - **Fonte do texto importa.** Para a TUI do Claude Code (Ink), o buffer **cru** de `agentBus.read(ptyId)` é append-only e cheio de escapes/repaints — a "última linha" crua pode ser lixo de repaint. A fonte de **alta fidelidade** é a mesma de `generatingSignal.ts`: as **linhas VISÍVEIS do xterm** (`term.buffer.active` → `translateToString(true)`, já sem ANSI). Por isso o detector opera sobre `string[]` (mesmo shape de `screenIsGenerating`): no **renderer** (T5) recebe as linhas visíveis do xterm; no **main** (T4) recebe `toLines(agentBus.read(ptyId))` como fallback "pobre mas 100% local" (o próprio doc §6.1 C chama a prévia de "versão pobre do resumo"). `stripAnsi` mitiga, mas não reconstrói o layout de uma TUI — documentar como limitação conhecida.
  - Markers são heurística — falso-positivo/negativo é aceitável (é um aviso, não um gate). Ajustar markers é o único knob, exatamente como `WORKING_MARKER`.

---

### T4 — Corpo da notificação enriquecido (nome + prévia + título por status)  [P2 · S · Onda 2]

Troca a notificação genérica ("Um agente parou e pode precisar de você.") por um mini-briefing local: **nome do agente**, **prévia da última linha** e **título conforme o status** (T3).

- **Arquivos a tocar:**
  - `src/main/orchestration/attentionNotification.ts` ((novo) — função pura testável)
  - `src/main/orchestration/attentionNotification.test.ts` ((novo))
  - `src/main/index.ts` (usar `buildAttentionNotification` no callback `onAttention` para montar `{title, body}`; ler o nome do agente do `mirror` e o buffer via `agentBus.read(ptyId)`)
- **Passos TDD:**
  1. **Teste que falha** (`attentionNotification.test.ts`):
     - `buildAttentionNotification({ agentName:'Revisor', bufferText:'...\nDo you want to proceed? (y/n)' })` → `{ title: 'Revisor precisa de você', body: 'Do you want to proceed? (y/n)' }`.
     - status `crashed`: `bufferText` com stack trace → `title: 'Revisor travou'`, `body` = última linha não-vazia (ex.: `ValueError: boom`).
     - status `done`: buffer normal → `title: 'Revisor ficou ocioso'` (ou "terminou"), `body` = última linha não-vazia; se buffer vazio → `body` cai num texto padrão (ex.: `'Um agente parou e pode precisar de você.'`).
     - `agentName` ausente/vazio → usa `'Agente'` como fallback.
     - `body` é truncado a ~140 chars (evitar corpo gigante numa linha longa).
  2. **Implementação:** `buildAttentionNotification(input: { agentName?: string; bufferText: string }): { title: string; body: string }` — usa `classifyAgentStatus(toLines(bufferText))` e `lastNonEmptyLine(toLines(bufferText))` da T3; mapeia status→título; trunca `body`. Depois, no `main/index.ts`, dentro de `onAttention`: `const agentName = mirror.nodes.find(n => n.id === nodeId)?.name; const { title, body } = buildAttentionNotification({ agentName, bufferText: agentBus.read(ptyId) }); new Notification({ title, body })...` (mantendo o `.on('click')` da T2 e o `try/catch`).
  3. **Verde:** `npx vitest run src/main/orchestration/attentionNotification.test.ts`.
- **Critérios de aceite:**
  - Notificação mostra nome + prévia + título coerente com o status.
  - Buffer vazio / sem última linha → corpo padrão, nunca `undefined`/`"undefined"`.
  - `agentBus.read(ptyId)` é lido **uma vez** por disparo (sem custo repetido).
  - `npm run typecheck` / `npm run lint` verdes.
- **Notas:** o `read()` cru é a fonte "pobre" (ver T3 Notas). Se depois quiser a prévia de alta fidelidade da TUI, o caminho é o renderer enviar a última linha visível junto do sinal (follow-up, não nesta entrega). Não vazar conteúdo sensível além da **uma** linha de prévia (privacidade: o corpo fica curto por design).

---

### T5 — HUD de agentes que precisam de atenção  [P2 · M · Onda 2]

Consolida o valor de monitoramento **dentro do app**: um pequeno painel/contador ("3 agentes aguardando") derivado do Set `attention`, clicável para enquadrar cada um (reusa o helper da T1).

- **Arquivos a tocar:**
  - `src/renderer/src/canvas/attentionList.ts` ((novo) — seletor puro testável)
  - `src/renderer/src/canvas/attentionList.test.ts` ((novo))
  - `src/renderer/src/components/AttentionHud.tsx` ((novo) — componente)
  - `src/renderer/src/components/AttentionHud.css` ((novo))
  - `src/renderer/src/components/Canvas.tsx` (montar `<AttentionHud />` como irmão da toolbar)
- **Passos TDD:**
  1. **Teste que falha** (`attentionList.test.ts`): `attentionAgents(nodes, attentionSet)` retorna `[{ id, name }]` **só** dos nós presentes no Set, **na ordem dos nós do canvas**, ignorando ids órfãos (no Set mas sem nó). Casos:
     - Set `{a,c}`, nodes `[a(name:'Dev'),b,c(name:'Revisor')]` → `[{id:'a',name:'Dev'},{id:'c',name:'Revisor'}]`.
     - id no Set sem nó correspondente → omitido (não quebra).
     - Set vazio → `[]`.
     - nó sem `data.name` → `name` cai em `'Terminal'` (mesmo default do `TerminalFlowNode`).
  2. **Implementação:** `attentionAgents(nodes, attention: Set<string>): { id: string; name: string }[]` puro. `AttentionHud.tsx`: seleciona `nodes` + `attention` do store, chama `attentionAgents`, e:
     - se vazio → não renderiza nada (ou renderiza colapsado);
     - senão → um chip "N aguardando" que expande numa lista; clicar num item chama o helper da T1 (`fitView` + `selectionChangesToFocus` via `onNodesChange`). Respeita `monitor` implicitamente (o Set `attention` já só contém nós monitorados).
  3. **Verde:** `npx vitest run src/renderer/src/canvas/attentionList.test.ts`.
- **Critérios de aceite:**
  - HUD aparece só quando há ≥1 agente em `attention`; some ao esvaziar.
  - Contador bate com `attention.size` (descontando órfãos).
  - Clicar num item enquadra + seleciona o nó (mesmo comportamento do `Shift+A`).
  - Acessível: `role`/`aria-label` coerentes (seguir o padrão do badge `.ork-node-attention`).
  - `npm run typecheck` / `npm run lint` verdes.
- **Notas:** não duplicar o ciclo do `Shift+A` — o HUD é a versão **visível/clicável** da mesma fonte (`attention`). Manter fora do caminho de arrasto do canvas (posicionar como overlay `ork-toolbar`, `nodrag`). Não persistir estado (efêmero, como o Set).

---

### T6 — Notificação agregada / anti-spam  [P3 · M · Onda 2]

Com muitos agentes, evitar N notificações simultâneas: coalescer eventos numa janela curta e emitir **uma** ("2 agentes ficaram ociosos: Dev, Revisor").

- **Arquivos a tocar:**
  - `src/main/orchestration/NotificationCoalescer.ts` ((novo))
  - `src/main/orchestration/NotificationCoalescer.test.ts` ((novo))
  - `src/main/index.ts` (rotear os disparos de `onAttention` pelo coalescer antes de `new Notification`)
- **Passos TDD** (usar `vi.useFakeTimers()`, como `AgentBus.test.ts`):
  1. **Teste que falha:**
     - Dois `push({nodeId,agentName,...})` dentro de `windowMs` → após `advanceTimersByTime(windowMs)`, o callback `onFlush` é chamado **uma vez** com os 2 eventos.
     - Um único evento na janela → `onFlush` com 1 evento (a agregação degrada para a notificação individual da T4).
     - Eventos em janelas separadas (avança o tempo entre eles) → dois `onFlush`.
     - `buildAggregateBody([...])` puro: 1 evento → título/corpo individual (delega a `buildAttentionNotification`); 2+ → `title: '2 agentes ficaram ociosos'`, `body: 'Dev, Revisor'`.
  2. **Implementação:** classe `NotificationCoalescer` com `push(ev)` que (re)agenda um `setTimeout(windowMs)` acumulando `ev` num buffer; ao disparar, chama `onFlush(events)` e limpa. `buildAggregateBody(events)` puro. No `main`, `onAttention` chama `coalescer.push(...)`; o `onFlush` monta e dispara a `Notification` (individual via T4 ou agregada). **O click da agregada** enquadra o **primeiro/mais recente** nó (ou abre o HUD) — decidir e testar a escolha do alvo (`aggregateClickTarget(events): nodeId`).
  3. **Verde:** `npx vitest run src/main/orchestration/NotificationCoalescer.test.ts`.
- **Critérios de aceite:**
  - `windowMs` curto (ex.: 400-800 ms) — não atrasa perceptivelmente o aviso de um único agente.
  - Nunca emite 2 notificações para eventos coalescidos.
  - Timers limpos (sem vazamento) — cobrir com `afterEach(vi.useRealTimers())`.
  - `npm run typecheck` / `npm run lint` verdes.
- **Notas:** manter o coalescer **desligável** (janela 0 = passthrough) para não mascarar bugs. Interação com T4: a agregada perde a prévia por-agente (troca detalhe por volume) — aceitável; a individual (1 evento) mantém a prévia. Menor prioridade — entregar T3/T4/T5 primeiro.

---

## 5. Dependências & riscos

- **Ordem:** T1 → T2 (Onda 1, independentes da Onda 2). T3 é pré-requisito de T4 e alimenta T5/T6. T5 reusa o helper da T1. T6 reusa T4. Sugestão de entrega: **T1, T2** (Onda 1) → **T3, T4, T5** → **T6**.
- **`main/index.ts` é composition root sem testes unitários.** O valor de TDD está nos módulos puros extraídos (T1 `frameNode`, T3 `agentStatus`, T4 `attentionNotification`, T5 `attentionList`, T6 `NotificationCoalescer`). O wiring no `main`/`Canvas` é validado por `npm run typecheck` + execução (`npm run dev`).
- **Permissão de notificação do SO (gap A, validar).** Em macOS/Windows a `Notification` pode ser negada; o `try/catch` já existe. **Ação de QA (Onda 1):** rodar `npm run dev`, colocar a janela fora de foco, deixar um agente ocioso, confirmar que a notificação aparece **e** que o clique foca+enquadra. Sem harness automatizado para isso.
- **Fidelidade da prévia em TUI (Claude Code/Ink).** O buffer cru de `agentBus.read` é ruidoso; `stripAnsi` mitiga mas não reconstrói o layout. Risco: prévia/classificação imprecisas para agentes TUI. Mitigação: detector opera sobre `string[]` para poder usar as linhas visíveis do xterm no renderer (alta fidelidade) e degradar para o buffer cru no main. Follow-up possível: renderer envia a última linha visível junto do sinal de atenção.
- **Heurística de markers.** Falsos positivos/negativos em `NEEDS_INPUT_MARKERS`/`CRASH_MARKERS` são aceitáveis (aviso, não gate); único knob de ajuste, como `WORKING_MARKER`. Cobrir com testes é a rede de segurança.
- **Respeitar `monitor === false`** em todos os novos caminhos (notificação, HUD) — o Set `attention` já só contém monitorados, então HUD herda de graça; a notificação já tem o guard (linha 38).
- **Cross-project.** Agentes de projeto não-ativo: `nodeForPty` acha o pty, mas o nó não está no canvas atual → click/HUD são no-op seguros. Não abrir/trocar projeto automaticamente nesta entrega (follow-up).
- **Fora de escopo confirmado:** LLM local/remoto (resumo, sugestão de próximo passo, Q&A NL, notas "Ombro Notes", resumo de notas) e janela flutuante dedicada + atalho global ⇧O. Registrado para não haver ambiguidade — **não implementar agora**.

---

## 6. Referências

- **Doc de origem:** `docs/analise-maestri-360/ombro.md` (§5 estado atual, §6.1 melhorias sem LLM A-F, §6.2 melhorias com LLM G-J fora de escopo).
- **Mapa interno:** `docs/maestri-mapa-funcionalidades-2026-07-11.md` (Ombro on-device; Onda 1 "Indicador de atenção do agente" viável sem LLM).
- **Código real verificado (2026-07-15):**
  - `src/main/orchestration/AgentBus.ts` + `AgentBus.test.ts` — `onAttention`, `clearAttention`, `read`, `waitForIdle`, `DEFAULT_ATTENTION_IDLE_MS=1200`. **Sem `onBusyChange`** (removido).
  - `src/main/index.ts` — callback `onAttention` (32-55), `Notification` inline (46-53), `ptyManager.nodeForPty` (34), guard `monitor===false` (38), IPC `agent:attention:clear` (302-305).
  - `src/preload/index.ts` — `onAgentAttention` (118-122), `clearAgentAttention` (123). **Sem `onAgentBusy`** (removido).
  - `src/renderer/src/components/Canvas.tsx` — `Shift+A` (358-376), assinatura `onAgentAttention` (166-180), nota do plumbing `busy` removido (189).
  - `src/renderer/src/components/TerminalFlowNode.tsx` — badge `.ork-node-attention` (95-102), `nodeState` (63), `handleFocusCapture` (74-77).
  - `src/renderer/src/components/TerminalNode.tsx` — varredura `scanGenerating` / `scheduleGeneratingScan` (92-118), uso de `screenIsGenerating`.
  - `src/renderer/src/terminal/generatingSignal.ts` (+ `.test.ts`) — molde do detector puro (`WORKING_MARKER`, `screenIsGenerating`).
  - `src/renderer/src/store/canvasStore.ts` — Sets `attention`/`generating` e setters (275-297, 446-462), limpeza ao remover nó (~668-690, ~849-859).
  - `src/main/pty/PtyManager.ts` — `nodeForPty` (94), `ptyIdForNode` (86).
  - `src/shared/` — padrão de módulo puro + `.test.ts` (`roles.ts`, `presets.ts`, `ssh.ts`, `orchestration.ts` com `MirrorNode.monitor`).
  - `vitest.config.ts` — `include: ['src/**/*.test.ts']`, `environment: 'node'`, `globals: false`.
</content>
</invoke>
