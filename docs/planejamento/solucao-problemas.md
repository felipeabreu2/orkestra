# Plano de Implementação — Solução de Problemas / Resiliência

> **Origem:** `docs/analise-maestri-360/solucao-problemas.md` · **Status:** ✅ **CONCLUÍDO (2026-07-17)** — T1–T7 entregues; T-opcional (memória por pid) fica como follow-up P2 · **Onda(s):** 3

**Registro da entrega (2026-07-17)** — decisões além do plano:
- **T1:** primeiro `Menu` de aplicação do app (papéis nativos preservados — sem eles o macOS perde
  ⌘C/⌘V/⌘Q); o item "Ajuda → Reportar um Problema" já nasceu com o seam late-bound do export
  (`runDiagnosticsExport`, preenchido na T4). Atalho ⌘Esc roda ANTES do guard `isTypingTarget`
  (o caso de uso é exatamente um terminal focado).
- **T2:** ring de 500 linhas SEMPRE funciona (mesmo com disco falhando) — é o que o diagnóstico
  coleta; `obs()` faz o eco duplo (console.error de sempre + arquivo) nos 6 eventos de
  observabilidade existentes.
- **T3/T4:** redação por VALOR conhecido (o ORKESTRA_TOKEN é aleatório por boot — regex nenhuma o
  pegaria) + padrões genéricos varrendo DENTRO das linhas de log; env por allowlist
  (PATH/LANG/SHELL); o shape do relatório nem tem onde carregar conteúdo do usuário. O menu roda a
  MESMA composição do IPC, com as MESMAS deps.
- **T5:** cap default 256KB inalterado (nenhum chamador/teste tocado); `trimBuffers` mantém a cauda
  e nunca mata processo.
- **T6:** `terminalNodeIds(id)` valida o id com o MESMO guard de traversal do resto do
  ProjectManager; hibernate não é switch/remove (índice/ativo/canvas intactos); o teste de escopo
  cobre a regressão do incidente cross-project. UI: MoonStar só em projeto não-ativo; estado
  `hibernatedIds` é efêmero de propósito (ao reiniciar o app tudo já nasce sem pty).
- **T7:** painel 100% derivado dos Sets `generating`/`attention` do canvasStore (nenhum estado
  novo, nenhum IPC); toggle ⇧H; clique = mesmo gesto do Shift+A. `AgentBus.snapshot()` entregue
  como base da futura coluna "última atividade".
- **Follow-ups:** T-opcional (memória por pid, P2); persistir `hibernatedIds`/hibernação
  automática por ociosidade (P2); botão de trim/“economizar memória” na UI consumindo
  `pty:setMemoryLimit` (o núcleo T5 está pronto; o canal IPC fica para quando houver a UI).

---

## 1. Objetivo & valor

A base de resiliência de **baixo nível** do Orkestra já é forte — em vários pontos mais robusta do
que a doc do Maestri expõe: persistência atômica com `fsync` e distinção `ok/missing/corrupt/ioerror`
(`ProjectManager.writeJson`/`readJson`), backup `*.corrupt-*` antes de degradar, self-heal do índice
(`reconstructFromDir`), guard de path-traversal (`isValidProjectId`), single-instance lock,
`ErrorBoundary` por nó, scrollback por pty com re-attach (`PtyManager`) e health check de ociosidade
(`AgentBus`). Verificado integralmente no código (seção 2).

**O que falta é a camada voltada ao usuário** — as ferramentas de auto-recuperação e diagnóstico que o
Maestri documenta e o Orkestra ainda não tem. Esta é a Onda 3 (principal), toda ela **reusando
infraestrutura existente**:

1. **Reset de foco** — recuperar de um estado de foco preso no canvas (xterms/webviews capturando o
   teclado), sem tocar no trabalho. Alívio de 1-clique/atalho.
2. **Cap de memória por terminal (scrollback)** — tornar o `MAX_BUFFER` do `PtyManager` configurável e
   truncável sob demanda (modo "economizar memória"), reusando o buffer que já existe.
3. **Hibernação de projeto** — liberar os recursos (ptys/agentes) de um projeto **inativo**, reusando
   `killByNode` (já usado na remoção de projeto) e a persistência atômica do canvas para "acordar de
   onde parou". **Escopada por projeto** — o incidente de corrupção cross-project (memória
   `incidente-corrupcao-cross-project`) exige que a operação nunca cruze o limite de um projeto.
4. **Export de diagnóstico anônimo** — um bundle de metadados + logs recentes, **redigindo segredos** e
   **sem conteúdo do usuário** (nenhum canvas, nenhuma saída de terminal). Requer um logger com arquivo
   rotativo (pré-requisito compartilhado, hoje inexistente — a observabilidade vive só em
   `console.error`).
5. **Painel de saúde dos agentes** — visão agregada de "quem está gerando / ocioso / aguardando você",
   reusando os Sets `attention`/`generating` do `canvasStore` e o watcher do `AgentBus`.

Valor: reduzir drasticamente o ciclo de suporte (diagnóstico self-service), dar válvulas de alívio de
memória para quem roda N agentes (N × 500–700 MB), e paliativos de recuperação sem "reinicie o app".

---

## 2. Estado atual no código (verificado)

| Arquivo real | O que já faz | Relevância |
| --- | --- | --- |
| `src/main/projects/ProjectManager.ts` | `writeJson` (tmp + `openSync`/`writeSync`/`fsyncSync` + `renameSync` + fsync best-effort do diretório); `readJson`/`ReadResult` com 4 estados `ok`/`missing`/`corrupt`/`ioerror`; `backup()` → `*.corrupt-<ts>`; `reconstructFromDir()` self-heal; `isValidProjectId` (guard path-traversal); `cleanupTmp` (só `projects/*.tmp`); `switch/remove/create/list/terminalCounts` transacionais | Base de persistência atômica reusada pela **hibernação** (canvas fica seguro em disco). `remove()` já coleta `removedNodeIds` dos terminais — o **exato padrão** que a hibernação vai reusar. |
| `src/main/pty/PtyManager.ts` | `MAX_BUFFER = 256*1024` scrollback por pty (`buffers` Map), truncado no append; `spawn/kill/killByNode/killAll/getBuffer`; `ptyIdForNode`/`nodeForPty`; `onExit` multi-subscriber | Núcleo do **cap de memória** (o buffer já existe, falta ser configurável/truncável) e da **hibernação** (`killByNode`). |
| `src/main/pty/nodePtySpawner.ts` | Envolve `node-pty`; expõe `onData/onExit/write/resize/kill` | **NÃO expõe `pid`** — medição de memória por processo (opcional) exigiria adicioná-lo ao `IPtyLike`. |
| `src/main/pty/registerPtyIpc.ts` | `pty:spawn` (allowlist de campos), `pty:attach` (re-attach por `nodeId` → `{ptyId, buffer}`), `pty:kill`, `pty:killForNode`; `PtyDataBatcher` | Canal de re-attach que a **hibernação** confia para "acordar" (na verdade re-spawnar) os terminais. |
| `src/main/orchestration/AgentBus.ts` | `track()` + watcher de atenção (`onAttention`, `idleMs` 1200); `waitForIdle` (timeout + fast-path exit); `read/buffers`; `clearAttention`; `untrack` | Fonte do **painel de saúde**. Hoje **não há** API agregada ("liste todos os agentes e seu estado") — a adicionar (`snapshot()`). |
| `src/main/index.ts` | Single-instance lock; observabilidade via `console.error` com prefixos `[RENDERER-GONE]`/`[RENDERER-UNRESPONSIVE]`/`[RENDERER-CONSOLE]`/`[RENDERER-LOAD-FAILED]`/`[CHILD-PROCESS-GONE]`/`[BOOT]`; `Notification` de agente ocioso; `killAll` no `closed`/`before-quit`; `hardenSession`/`installCsp`; `orchestrationEnv` com `ORKESTRA_TOKEN` | **Não há `Menu` de aplicação** (`Menu.setApplicationMenu` nunca é chamado) nem **logger estruturado**. O reset de foco e o export precisam de novos pontos de entrada aqui. `ORKESTRA_TOKEN` é o **segredo a redigir** no diagnóstico. |
| `src/renderer/src/components/Canvas.tsx` | `handleKeyDown` global (Cmd+K, Cmd+G, Shift+1/2/M, Shift+A); `isTypingTarget` (detecta `.xterm`/input); `useReactFlow().fitView` | Ponto de entrada do **reset de foco** (atalho) e host do **painel de saúde**. `isTypingTarget` já sabe detectar o `.xterm` que "prende" o teclado. |
| `src/renderer/src/components/ProjectsSidebar.tsx` | `switchTo` (flush→`switch`→`hydrate`); `handleRemove`; linhas com ações por hover (pasta/remover); ícone do projeto | Onde entra a ação **"Descarregar"** por projeto e a **pista visual** (ícone esmaecido) de hibernado. |
| `src/renderer/src/store/canvasStore.ts` | `hydrate/serialize/setSwitching/activeProjectId`; Sets `attention` e `generating` (efêmeros, nunca serializados); `killForNode` no remove/undo | Reuso direto no **painel de saúde** (`attention`=aguardando, `generating`=gerando) sem novo estado no main. |
| `src/renderer/src/components/ErrorBoundary.tsx` | Boundary por subárvore (fallback local, `console.error`) | Isolamento de crash de UI já resolvido — **sem gap**; citado como âncora de "degradar sem derrubar tudo". |
| `src/preload/index.ts` | `window.orkestra.{pty,persistence,projects,filetree,orchestration,ide}` + `onAgentAttention`/`clearAgentAttention` | Superfície onde entram `diagnostics.export`, `view.onResetFocus`, `projects.hibernate`, `agents.health`. **Não há** canal de settings/diagnóstico hoje. |
| `src/main/orchestration/OrchestrationServer.ts` | Auth por token (`timingSafeEqual`); `409 project not active` (escopo); `503 app unavailable` (`BLD-6`); cap de corpo `413` | Modelo de "não mentir ok" e escopo de projeto — nada a mudar; referência de postura. |

> **Nota de ciclo de vida (verificada):** no boot só o canvas do **projeto ativo** é carregado
> (`persistence:load` devolve o ativo), e um terminal só spawna quando seu `TerminalNode` monta — ou
> seja, **projetos nunca visitados nesta sessão já nascem "hibernados"** (sem pty). O gap da hibernação
> é liberar os ptys de projetos **visitados e depois abandonados** — que **sobrevivem à troca** por
> design (re-attach, `PtyManager`), somando N × 500–700 MB vivos.

---

## 3. Gaps priorizados

| Gap | Prioridade | Valor | Esforço (S/M/L) | Onda |
| --- | --- | --- | --- | --- |
| Reset de foco (recuperar de foco preso, sem tocar no trabalho) | P0 | Médio-alto (alívio de 1-clique) | S | 3 |
| Logger com arquivo rotativo (pré-requisito do diagnóstico) | P0 | Alto (base de observabilidade) | S-M | 3 |
| Export de diagnóstico anônimo com redação de segredos | P0 | Alto (reduz ciclo de suporte) | M | 3 |
| Cap de memória por terminal (scrollback configurável + trim) | P1 | Médio-alto | M | 3 |
| Hibernação de projeto (escopada por projeto) | P0 | Alto (maior alívio de memória) | L | 3 |
| Painel de saúde dos agentes (reusa `attention`/`generating`/`AgentBus`) | P1 | Médio | S-M | 3 |
| Medição de memória por processo (pid) — read-only | P2 | Médio (educa "os agentes é que pesam") | M | 3 (opcional) |

---

## 4. Tarefas de implementação (TDD, em ordem)

### T1 — Reset de foco (núcleo puro + atalho + menu)  [P0 · S · Onda 3]

- **Arquivos a tocar:**
  - `src/renderer/src/ui/resetFocus.ts` ((novo)) — função pura de reset.
  - `src/renderer/src/ui/resetFocus.test.ts` ((novo), jsdom).
  - `src/renderer/src/components/Canvas.tsx` — atalho no `handleKeyDown` + assinatura do IPC de menu.
  - `src/main/menu.ts` ((novo)) — `Menu` de aplicação com "Visualizar → Resetar Foco" que envia
    `view:reset-focus`.
  - `src/main/index.ts` — chamar `buildAppMenu(mainWindow)` em `whenReady` (depois de `createWindow`).
  - `src/preload/index.ts` — `view.onResetFocus(cb)` (assinatura `view:reset-focus`, mesmo padrão de
    `onAgentAttention`).
- **Passos TDD:**
  1. **Teste que falha** — `resetFocus.test.ts` (`// @vitest-environment jsdom`): montar um `<div class="react-flow" tabindex="-1">` (o pane) e, dentro, um `<div class="xterm"><textarea/></div>`; focar a `textarea`; chamar `resetFocus(pane)`; **esperar** `document.activeElement !== textarea` e `document.activeElement === pane` (o foco voltou ao canvas). Segundo caso: com foco já no `body` (nada preso), `resetFocus(pane)` **não lança** e ainda foca o pane (idempotente). Terceiro caso: `resetFocus(null)` é no-op seguro (sem pane, só faz `blur` do ativo).
  2. **Implementação** — `export function resetFocus(pane: HTMLElement | null): void`: se `document.activeElement` for um `HTMLElement` e estiver dentro de `.xterm`, `<webview>` ou for `INPUT/TEXTAREA/[contenteditable]`, chama `.blur()`; depois, se `pane`, `pane.focus({ preventScroll: true })`. **Não** toca em `nodes/edges` — puramente foco. Em `Canvas.tsx`: adicionar atalho **Cmd/Ctrl+Esc** (comando, roda **antes** do `isTypingTarget` guard, como Cmd+K) que resolve o pane via `document.querySelector('.react-flow__pane')` (ou um `ref`) e chama `resetFocus`; e assinar `window.orkestra.view.onResetFocus(() => resetFocus(...))` num `useEffect` com cleanup. Em `menu.ts`: template com submenu "Visualizar" contendo item `{ label: 'Resetar Foco', accelerator: 'CmdOrCtrl+Escape', click: () => win.webContents.send('view:reset-focus') }`.
  3. **Verde** — `npx vitest run src/renderer/src/ui/resetFocus.test.ts`.
- **Critérios de aceite:**
  - `resetFocus` remove o foco de um `.xterm`/webview e o devolve ao pane do React Flow.
  - Nenhum nó/edge muda (nada de `useCanvasStore` no caminho).
  - Item "Visualizar → Resetar Foco" e atalho Cmd/Ctrl+Esc funcionam com um terminal focado.
  - `npm run typecheck` e `npm run lint` limpos.
- **Notas:** o Orkestra **não tem `Menu` hoje** — introduzir um `Menu` mínimo (só "Visualizar" + os
  papéis nativos de editar/janela para não perder copiar/colar no macOS). Risco: o atalho não deve
  colidir com o uso do xterm; Cmd/Ctrl+Esc não é atalho comum de shell. Alternativa se o menu for
  adiado: expor um botão discreto na `Topbar`. Postura do Maestri (registrar no doc/README): foco
  preso é bug "a eliminar, não contornar" — o reset é paliativo.

### T2 — Logger com arquivo rotativo (pré-requisito do diagnóstico)  [P0 · S-M · Onda 3]

- **Arquivos a tocar:**
  - `src/main/diagnostics/Logger.ts` ((novo)).
  - `src/main/diagnostics/Logger.test.ts` ((novo)).
  - `src/main/index.ts` — instanciar `const logger = new Logger(join(app.getPath('userData'), 'logs'))`
    e encaminhar os `console.error` de observabilidade existentes (`[RENDERER-GONE]` etc.) também para
    `logger.write(...)` (sem remover os `console.error`).
- **Passos TDD:**
  1. **Teste que falha** — `Logger.test.ts` (node env, dir temporário via `mkdtempSync(os.tmpdir())`):
     (a) `logger.write('linha A')` → `logger.recent()` contém "linha A" e o arquivo `app.log` existe
     com a linha; (b) **cap de tamanho**: com `maxBytes` pequeno (ex. 200) e várias escritas, o arquivo
     rotaciona para `app.log.1` e `app.log` fica abaixo do cap (nunca cresce sem limite); (c)
     `recent(n)` devolve só as últimas `n` linhas do ring em memória.
  2. **Implementação** — classe `Logger` com: ring buffer em memória (`private lines: string[]`, cap
     `MAX_LINES` ex. 500), `write(msg)` que faz `appendFileSync` com timestamp ISO + rotação
     (`renameSync(app.log, app.log.1)` quando `statSync().size > maxBytes`, mantendo 1–2 gerações),
     `recent(n?)` retornando a cauda do ring, `path()` do arquivo atual. **Best-effort/nunca lança**
     (mesmo princípio de `writeJson`/`backup` do `ProjectManager`) — falha de I/O não pode derrubar o
     boot. Injetar `baseDir` no construtor para testar sem `app`.
  3. **Verde** — `npx vitest run src/main/diagnostics/Logger.test.ts`.
- **Critérios de aceite:**
  - Arquivo de log criado sob `userData/logs/`, com rotação e teto de tamanho.
  - `recent()` reflete as últimas N linhas.
  - `Logger` nunca lança (I/O falho é engolido, como `backup()`).
- **Notas:** manter dependência **zero** (não introduzir `electron-log` — evita nova devDep e mantém a
  disciplina do projeto de módulos testáveis e injetáveis). Edge: o `userData` é compartilhado com o
  Cache do Chromium — escrever **só** em `userData/logs/` (subpasta própria), nunca fazer sweep no
  `userData` (mesma lição do `cleanupTmp`, `INT-7`).

### T3 — Coletor de diagnóstico com redação de segredos  [P0 · M · Onda 3]

- **Arquivos a tocar:**
  - `src/main/diagnostics/collectDiagnostics.ts` ((novo)).
  - `src/main/diagnostics/collectDiagnostics.test.ts` ((novo)).
- **Passos TDD:**
  1. **Teste que falha** — `collectDiagnostics.test.ts` (node env): chamar
     `buildDiagnosticReport(input)` com um `input` **injetado** contendo `env: { ORKESTRA_TOKEN: 'sk-secreto', ANTHROPIC_API_KEY: 'abc123', PATH: '/usr/bin' }`, `versions: { app, electron, chrome, node }`, `platform/arch`, `memory: { rss, freemem }`, `logs: ['[BOOT] ok', 'token=sk-secreto no log']`, e um `canvasSummary` proibido. **Esperar** que o JSON de saída:
     - **NÃO contenha** `sk-secreto` nem `abc123` em lugar nenhum (nem em `env`, nem dentro das linhas de `logs` — a redação varre as strings e substitui valores sensíveis por `«redigido»`);
     - contenha os metadados seguros (versões, platform, arch, memória) e a **contagem** de projetos/nós, mas **nenhum conteúdo** de nota/terminal/canvas (só números);
     - `env` seja um **allowlist** (ex. só `PATH`/`LANG`/`SHELL`), nunca o `process.env` inteiro.
  2. **Implementação** — `export function buildDiagnosticReport(input: DiagnosticInput): DiagnosticReport`, pura: monta o objeto a partir do `input` injetado; aplica `redact(str)` (regex para `ORKESTRA_TOKEN`, chaves `*_API_KEY`, `token=…`, `Bearer …`, e o valor exato do token quando conhecido) sobre cada linha de log; filtra `env` por allowlist. **Nenhuma** leitura de disco/`process` aqui (o caller injeta) — testável e determinística. Uma função irmã `gatherDiagnosticInput(deps)` (fina, não testada por unidade) coleta de `app.getVersion()`, `process.versions`, `os.*`, `logger.recent()`, `ProjectManager.list()`/`terminalCounts()` e passa ao core.
  3. **Verde** — `npx vitest run src/main/diagnostics/collectDiagnostics.test.ts`.
- **Critérios de aceite:**
  - O relatório **redige** `ORKESTRA_TOKEN` e chaves de API, inclusive quando aparecem **dentro** de
    linhas de log.
  - Nenhum conteúdo de canvas/nota/saída de terminal — só metadados e contagens.
  - `env` é allowlist explícito, nunca o `process.env` cru.
- **Notas:** este é o **coração testável** do export. Alinha com o princípio Maestri ("totalmente
  anônimo: nenhum código, nenhuma saída de terminal, nada dos seus workspaces"). Edge: o token muda a
  cada boot (`randomBytes` no `OrchestrationServer`), então a redação por **valor conhecido** (passado
  no `input`) cobre o caso exato, e os regexes cobrem o genérico.

### T4 — Export "Reportar um Problema" (IPC + menu + save dialog)  [P0 · M · Onda 3 · dep: T2, T3]

- **Arquivos a tocar:**
  - `src/main/diagnostics/registerDiagnosticsIpc.ts` ((novo)).
  - `src/main/diagnostics/registerDiagnosticsIpc.test.ts` ((novo)).
  - `src/main/menu.ts` — submenu "Ajuda → Reportar um Problema…" que envia `diagnostics:request-export`
    (ou chama direto o handler).
  - `src/main/index.ts` — `registerDiagnosticsIpc(ipcMain, { gatherInput, saveDialog, writeFile })`.
  - `src/preload/index.ts` — `diagnostics.export(): Promise<{ ok: boolean; path?: string }>`.
  - `src/renderer/src/components/Topbar.tsx` (ou `CommandPalette.tsx`) — item "Reportar um Problema".
- **Passos TDD:**
  1. **Teste que falha** — `registerDiagnosticsIpc.test.ts` (node env, `ipcMain` fake que captura os
     handlers, como os testes de `registerProjectIpc`): registrar com um `gatherInput` fake, um
     `saveDialog` fake que devolve `/tmp/diag.json`, e um `writeFile` fake que grava num objeto. Invocar
     o handler `diagnostics:export`; **esperar** que ele: chame `buildDiagnosticReport`, escreva o JSON
     **redigido** no path do `saveDialog`, e retorne `{ ok: true, path }`. Segundo caso: `saveDialog`
     devolve `null` (cancelado) → `{ ok: false }`, **nada escrito**.
  2. **Implementação** — `registerDiagnosticsIpc(ipcMain, deps)` registra `ipcMain.handle('diagnostics:export', …)` que compõe `gatherDiagnosticInput` → `buildDiagnosticReport` → `saveDialog` → `writeFile` (todos injetados, como o `pickDirectory` de `registerProjectIpc`). Em `index.ts`, os `deps` reais usam `dialog.showSaveDialog(mainWindow, { defaultPath: 'orkestra-diagnostico.json' })` e `writeFileSync`. No menu, "Ajuda → Reportar um Problema…".
  3. **Verde** — `npx vitest run src/main/diagnostics/registerDiagnosticsIpc.test.ts`.
- **Critérios de aceite:**
  - Handler `diagnostics:export` gera e grava um JSON **redigido** no caminho escolhido; cancelar não
    escreve nada.
  - Item de menu "Ajuda → Reportar um Problema…" e/ou comando no palette disparam o fluxo.
  - O arquivo salvo não contém segredos nem conteúdo do usuário (garantido por T3).
- **Notas:** o `dialog`/`writeFileSync` ficam **só** no `index.ts` (o módulo IPC recebe wrappers — mesmo
  padrão de `registerProjectIpc(pickDirectory)`) para manter o teste livre de `electron`. Instrução ao
  usuário na UI: "salve e envie para o suporte" (o Maestri usa e-mail; o Orkestra pode só orientar o
  envio — sem exfiltração automática, privacidade por padrão).

### T5 — Cap de memória por terminal (scrollback configurável + trim)  [P1 · M · Onda 3]

- **Arquivos a tocar:**
  - `src/main/pty/PtyManager.ts` — `MAX_BUFFER` vira campo de instância configurável + `trimBuffers`.
  - `src/main/pty/PtyManager.test.ts` — novos casos.
  - (Wiring opcional) `src/main/pty/registerPtyIpc.ts` + `src/preload/index.ts` — canal
    `pty:setMemoryLimit`/`pty:trim` para o modo "economizar memória"; consumido pelo painel de saúde (T7).
- **Passos TDD:**
  1. **Teste que falha** — em `PtyManager.test.ts` (usando o `fakePty` multi-subscriber já existente):
     (a) construir `new PtyManager(spawner, { maxBufferBytes: 64 })`, spawnar, emitir 200 bytes;
     **esperar** `getBuffer(id).length <= 64` (cap respeitado, mantém a cauda); (b) `trimBuffers(16)`
     reduz todos os buffers para ≤ 16 bytes retroativamente; (c) default sem opção continua
     `256*1024` (retrocompatível — os testes existentes seguem verdes).
  2. **Implementação** — `constructor(spawner, opts: { maxBufferBytes?: number } = {})` guardando
     `private maxBuffer = opts.maxBufferBytes ?? MAX_BUFFER`; o truncamento no handler `onData` do
     `spawn` passa a ler `this.maxBuffer`; adicionar `setMaxBuffer(bytes)` e
     `trimBuffers(bytes = this.maxBuffer)` que itera `this.buffers` e faz `slice(-bytes)`. Nenhuma
     mudança de assinatura pública quebrada (parâmetro opcional, appended).
  3. **Verde** — `npx vitest run src/main/pty/PtyManager.test.ts`.
- **Critérios de aceite:**
  - O cap de scrollback é configurável e o buffer nunca ultrapassa o cap (mantendo a cauda).
  - `trimBuffers` reduz o consumo retroativamente sem matar o pty (shell/nó preservados).
  - Comportamento default inalterado (256 KB) — testes existentes verdes.
- **Notas:** esta é a leitura do "limite de memória por terminal" **factível e escopada ao que o
  Orkestra controla** (o buffer de scrollback do main), diferente da poda de processo-filho por SO do
  Maestri (enumeração de árvore de processos, alto esforço e dependente de plataforma — fica como
  follow-up P2, ver T-opcional). Preserva o shell/nó (filosofia "não destruir o trabalho"). Edge: o
  re-attach (`getBuffer`) devolve menos scrollback após um trim — aceitável (alívio de memória > alguns
  KB de histórico).

### T6 — Hibernação de projeto (escopada por projeto)  [P0 · L · Onda 3]

- **Arquivos a tocar:**
  - `src/main/projects/ProjectManager.ts` — novo `terminalNodeIds(id: string): string[]`.
  - `src/main/projects/ProjectManager.test.ts` — casos do novo método.
  - `src/main/projects/registerProjectIpc.ts` — handler `projects:hibernate` + seam `onHibernate`.
  - `src/main/projects/registerProjectIpc.test.ts` — o handler chama `onHibernate` com os node ids.
  - `src/main/index.ts` — passar `onHibernate = (nodeIds) => nodeIds.forEach(id => ptyManager.killByNode(id))` (reusa o **exato** padrão de `onProjectRemoved`).
  - `src/preload/index.ts` — `projects.hibernate(id): Promise<void>`.
  - `src/renderer/src/components/ProjectsSidebar.tsx` — ação "Descarregar" (só em projeto **não** ativo) + `hibernatedIds` (state) + ícone esmaecido.
  - `src/renderer/src/components/ProjectsSidebar.css` — classe `ork-sidebar-project--hibernated` (opacidade reduzida do ícone).
- **Passos TDD:**
  1. **Teste que falha** —
     - `ProjectManager.test.ts`: criar projeto, gravar canvas com 2 nós `terminal` + 1 `note`;
       `terminalNodeIds(id)` devolve **só** os 2 ids de terminal, na ordem; projeto inexistente ou
       canvas `missing`/`corrupt` → `[]` (nunca lança). **Escopo**: chamar com o id de OUTRO projeto
       devolve os terminais **daquele** projeto, nunca mistura (lê `projects/<id>.json` por id
       explícito, mesma resolução de `terminalCounts`).
     - `registerProjectIpc.test.ts`: `ipcMain` fake; invocar `projects:hibernate` com um id; **esperar**
       que `onHibernate` seja chamado **uma vez** com exatamente `pm.terminalNodeIds(id)`; e que **nada**
       toque o índice/ativo (hibernar não é `switch` nem `remove` — o projeto continua na lista, só
       perde os ptys).
  2. **Implementação** —
     - `ProjectManager.terminalNodeIds(id)`: `const snap = this.readCanvas(this.canvasPath(id)); return (snap?.nodes ?? []).filter(n => n.type === 'terminal').map(n => n.id)` — **espelha** a coleta de `removedNodeIds` em `remove()` e a leitura de `terminalCounts()`, sem efeito colateral.
     - `registerProjectIpc`: `ipcMain.handle('projects:hibernate', (_e, id) => { onHibernate?.(pm.terminalNodeIds(id)) })` (seam opcional/appended, retrocompatível).
     - Renderer: em `ProjectsSidebar`, botão "Descarregar" nas ações da linha (ao lado de pasta/remover), **desabilitado/ausente** na linha do `activeId`; ao clicar: `await window.orkestra.projects.hibernate(p.id)`, adiciona `p.id` a `hibernatedIds` (esmaece o ícone). Ao `switchTo(id)` (acordar), remove `id` de `hibernatedIds` — a hidratação do canvas re-monta os `TerminalNode`, que, como os ptys foram mortos, **re-spawnam** (o `pty:attach` retorna `null`). O trabalho (canvas) volta "de onde parou"; o agente reinicia.
  3. **Verde** — `npx vitest run src/main/projects/ProjectManager.test.ts src/main/projects/registerProjectIpc.test.ts`.
- **Critérios de aceite:**
  - `terminalNodeIds(id)` é **por id explícito** — nunca lê o projeto ativo por engano (escopo).
  - `projects:hibernate` mata os ptys **só** dos terminais daquele projeto; o índice/ativo não muda; o
    canvas em disco permanece intacto (persistência atômica já garante).
  - Na sidebar, "Descarregar" só aparece em projetos não ativos; o ícone esmaece; ao reabrir, o canvas
    re-hidrata (terminais re-spawnam).
  - Nenhuma operação cruza o limite de um projeto (regressão do incidente de corrupção coberta).
- **Notas:** **escopo por projeto é a exigência dura** (memória `incidente-corrupcao-cross-project`):
  hibernar B enquanto A está ativo só pode ler `projects/B.json` e matar ptys por `nodeId` daquele
  canvas — nunca tocar A. Reusa `killByNode` (já provado no `onProjectRemoved`). Nuance a documentar:
  "acorda de onde parou" = **canvas restaurado**, mas o **agente reinicia** (o pty foi liberado) — é o
  trade-off explícito de liberar recursos (o Maestri também libera "todos os recursos"). Boot já é lazy
  (só o ativo carrega) — a hibernação cobre o caso "visitei e saí". Follow-up de UX: persistir
  `hibernatedIds` e/ou hibernar automaticamente projetos ociosos há muito tempo (P2).

### T7 — Painel de saúde dos agentes (reusa `attention`/`generating` + `AgentBus`)  [P1 · S-M · Onda 3]

- **Arquivos a tocar:**
  - `src/renderer/src/agents/agentHealth.ts` ((novo)) — agregador puro.
  - `src/renderer/src/agents/agentHealth.test.ts` ((novo), jsdom não necessário — pura).
  - `src/renderer/src/components/AgentHealthPanel.tsx` ((novo)) — painel/overlay no canvas.
  - `src/renderer/src/components/Canvas.tsx` — atalho/toggle para abrir o painel (ex. no palette ou um
    botão na `Topbar`).
  - `src/main/orchestration/AgentBus.ts` — `snapshot()` agregado (opcional, para "última atividade").
  - `src/main/orchestration/AgentBus.test.ts` — caso do `snapshot()`.
- **Passos TDD:**
  1. **Teste que falha** —
     - `agentHealth.test.ts`: dado `nodes` (3 terminais + 1 nota), `attention: Set(['t1'])`,
       `generating: Set(['t2'])`, `buildAgentHealth(nodes, attention, generating)` devolve **só os
       terminais**, cada um com `{ id, name, status }` onde `t1='aguardando'`, `t2='gerando'`,
       `t3='ocioso'`, e a nota é ignorada. Ordena por status (gerando → aguardando → ocioso) ou por nome
       (definir e testar a ordem).
     - `AgentBus.test.ts`: `track(a)`/`track(b)`, emitir output em `a`, avançar timers com
       `vi.useFakeTimers()`; `snapshot()` lista `a` e `b` com um flag de atividade recente coerente
       (ex. `a` marcado como "falou recentemente"). (Escopo mínimo — o painel primário vem do store.)
  2. **Implementação** — `buildAgentHealth`: filtra `nodes` por `type==='terminal'`, mapeia para o
     status derivado dos Sets (`generating` tem prioridade sobre `attention`), retorna array ordenado.
     `AgentHealthPanel`: seleciona `nodes`/`attention`/`generating` do `useCanvasStore`, chama
     `buildAgentHealth`, renderiza a lista com badge de status e um clique que faz `fitView` no nó
     (reusa o mesmíssimo mecanismo do Shift+A já em `Canvas.tsx`). `AgentBus.snapshot()`: itera
     `this.tracked`, devolve `[{ ptyId, sawOutput: this.sawOutput.get(ptyId) ?? false }]` (agregado
     barato do estado que já existe).
  3. **Verde** — `npx vitest run src/renderer/src/agents/agentHealth.test.ts src/main/orchestration/AgentBus.test.ts`.
- **Critérios de aceite:**
  - O painel lista os terminais-agente com status **gerando / aguardando você / ocioso**, derivado do
    estado que o app **já calcula** (Sets do store + watcher do `AgentBus`).
  - Clicar num item enquadra (`fitView`) o nó no canvas.
  - `buildAgentHealth` é puro e determinístico (sem `window`/IPC).
- **Notas:** o painel primário **não precisa de novo estado no main** — `attention` (aguardando) e
  `generating` (gerando) já vivem no `canvasStore` e são atualizados pelo watcher do `AgentBus`
  (`onAttention`) e pela varredura de conteúdo do xterm ("esc to interrupt"). O `AgentBus.snapshot()` é
  um extra para uma futura coluna de "última atividade". Reduz a "caça manual pelo canvas" citada na
  análise.

### T-opcional — Medição de memória por processo (pid, read-only)  [P2 · M · Onda 3 (adiável)]

- **Arquivos a tocar:** `src/main/pty/PtyManager.ts` (IPtyLike ganha `pid?`),
  `src/main/pty/nodePtySpawner.ts` (expor `p.pid`), um `src/main/pty/processMemory.ts` ((novo))
  read-only por plataforma, e um canal `pty:memory`.
- **Passos TDD:** teste do parser de saída de memória por SO (ex. parse de `ps -o rss= -p <pid>`) com
  fixtures — **sem** spawnar processo real.
- **Critérios de aceite:** exibe a memória aproximada do processo do terminal no header do nó (educa "o
  app é leve; os agentes pesam") **sem matar nada**.
- **Notas:** só um degrau de exibição; a poda cirúrgica de processo-filho (o comportamento pleno do
  Maestri) é o passo seguinte, de alto esforço por SO — fora do escopo desta onda.

---

## 5. Dependências & riscos

- **Ordem de dependência:** T2 (Logger) e T3 (coletor) são pré-requisitos de T4 (export). T1, T5, T6,
  T7 são independentes entre si e podem ir em paralelo. Sugerido: T1 → T2 → T3 → T4 → T5 → T6 → T7.
- **Novo `Menu` de aplicação (T1/T4):** o app **não tem menu hoje**. Introduzir um `Menu` mínimo exige
  cuidado no macOS (preservar os papéis nativos de editar/janela para não perder copiar/colar). Risco
  baixo, mas é uma superfície nova. Alternativa de menor escopo: expor as ações via `Topbar`/palette em
  vez de menu nativo.
- **Redação de segredos (T3):** o risco central do export é **vazar** `ORKESTRA_TOKEN` ou chaves de API
  do ambiente. Mitigação: `env` por **allowlist** (nunca `process.env` cru) + `redact()` varrendo
  também as linhas de log + redação por **valor conhecido** do token. O teste de redação é gate de merge.
- **Escopo por projeto na hibernação (T6):** regressão potencial do **incidente de corrupção
  cross-project**. Mitigação: `terminalNodeIds(id)` lê **só** `projects/<id>.json` por id explícito e
  hibernar **não** chama `switch`/`remove` (não mexe no índice/ativo). Guardar "Descarregar" fora da
  linha do projeto ativo. Testes cobrem "id de outro projeto não vaza terminais do ativo".
- **Semântica de "acordar" (T6):** o agente **reinicia** ao acordar (o pty foi morto) — expectativa a
  comunicar na UI ("Descarregar libera os agentes; o canvas volta, os agentes reiniciam"). É o mesmo
  trade-off do Maestri ("libera todos os recursos").
- **`node-pty` sem `pid` (T-opcional):** medir memória por processo exige estender `IPtyLike`/spawner —
  contido, mas dependente de SO no parse. Adiável.
- **Retrocompatibilidade:** todo parâmetro novo (`maxBufferBytes`, `onHibernate`, seams de diagnóstico)
  é **opcional/appended**, preservando os fakes de teste e chamadores atuais — padrão já usado em
  `registerPtyIpc`/`registerProjectIpc`.
- **Sem dependências novas de runtime:** Logger e diagnóstico são feitos com `node:fs`/`node:os` puros
  (sem `electron-log`), coerente com a arquitetura testável/injetável do projeto.

---

## 6. Referências

- **Fonte:** `docs/analise-maestri-360/solucao-problemas.md` (§2 catálogo Maestri, §4 modelo de backend,
  §5 estado atual + gaps, §6 ondas de melhoria).
- **Código verificado (caminhos reais):**
  - `src/main/projects/ProjectManager.ts` — `writeJson`/`readJson` (`ReadResult`), `backup`,
    `reconstructFromDir`, `isValidProjectId`, `cleanupTmp`, `remove()` (padrão `removedNodeIds`),
    `terminalCounts()` (base do novo `terminalNodeIds`).
  - `src/main/pty/PtyManager.ts` — `MAX_BUFFER`, `buffers`, `getBuffer`, `killByNode`, `nodeForPty`.
  - `src/main/pty/nodePtySpawner.ts` — wrapper `node-pty` (sem `pid` exposto).
  - `src/main/pty/registerPtyIpc.ts` — `pty:attach` (re-attach), allowlist de spawn.
  - `src/main/orchestration/AgentBus.ts` — `track`/`onAttention`, `waitForIdle`, `sawOutput`.
  - `src/main/index.ts` — observabilidade (`console.error` prefixado), single-instance, `Notification`,
    `killAll`, `orchestrationEnv`/`ORKESTRA_TOKEN`; **ausência** de `Menu` e de logger.
  - `src/renderer/src/components/Canvas.tsx` — `handleKeyDown`, `isTypingTarget`, `fitView`.
  - `src/renderer/src/components/ProjectsSidebar.tsx` — `switchTo`, ações por linha, ícone do projeto.
  - `src/renderer/src/store/canvasStore.ts` — `attention`/`generating` Sets, `hydrate`/`serialize`.
  - `src/preload/index.ts` — superfície `window.orkestra.*`.
  - `src/renderer/src/components/ErrorBoundary.tsx` — isolamento de crash por nó (sem gap).
- **Convenções de teste (verificadas):** `import { describe, it, expect, vi } from 'vitest'`; main em
  `environment: 'node'`; renderer que toca DOM com `// @vitest-environment jsdom` (ex.
  `canvasStore.test.ts`); `fakePty` multi-subscriber para `PtyManager`; rodar `npx vitest run <arquivo>`.
  `vitest.config.ts` inclui `src/**/*.test.ts`.
- **Memórias relacionadas:** `incidente-corrupcao-cross-project` (exige escopo por projeto na
  hibernação), `release-posix-spawnp-prebuilds` (contexto de robustez de build/terminal).
```
