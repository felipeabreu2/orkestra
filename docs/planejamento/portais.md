# Plano de Implementação — Portais

> **Origem:** `docs/analise-maestri-360/portais.md` · **Status:** Proposto (não iniciado) · **Onda(s):** 1, 2, 3

---

## 1. Objetivo & valor

Transformar os **Portais** (navegadores embutidos no canvas, hoje já dirigíveis por
`orq portal open|navigate|click|fill|eval|snapshot`) de uma automação **fire-and-forget/cega** numa
plataforma de **automação web com feedback**, aproximando a paridade com o Maestri **sem regredir o
hardening de segurança** — que é o diferencial do Orkestra (validação de esquema de URL, remoção de
`preload` no `will-attach-webview`, `hardenSession` negando permissões sensíveis, scripts injetados
via `JSON.stringify`, escopo de projeto 409).

Valor por onda:

- **Onda 1 — fechar o loop de confirmação.** Hoje `click`/`fill` já *computam* um booleano de sucesso
  (`clickScript`/`fillScript` retornam `true`/`false`), mas ele é **descartado** (o `.catch(()=>{})`
  engole o resultado e a ponte é unidirecional). Propagar esse booleano até o agente elimina a rodada
  extra de `orq portal snapshot` e remove a ambiguidade "cliquei em nada". É o maior retorno com menor
  esforço — mas exige **construir um caminho de resposta** que hoje não existe (ver T1).
- **Onda 2 — paridade de navegação e autonomia do agente.** `back/forward/reload/scroll` dedicados,
  `snapshot --html/--dom` (expor seletores para o agente parar de adivinhar), `orq portal create`
  (agente cria portais sozinho) e o indicador visual "agente dirigindo".
- **Onda 3 — o agente "vê" e depura.** `screenshot` (via `capturePage()`, agente multimodal enxerga a
  página), leitura de `console`/erros, e escopar `portalStates` por projeto (robustez cross-project).

Combinadas, viabilizam **pipelines de automação web sem MCP** (sem Playwright/Puppeteer/servidor de
browser), mantendo tudo dentro do canvas.

---

## 2. Estado atual no código (verificado)

| Arquivo real | O que já faz | Relevância |
| --- | --- | --- |
| `src/renderer/src/components/PortalNode.tsx` | Hospeda o `<webview>`; registra no `portalRegistry` por `nodeId`; a cada `did-finish-load` roda `snapshotScript()` e reporta `{name,url,title,text}` ao main via `window.orkestra.portalState` (canal `portal:state`). Recebe `partition` já calculada e a repassa ao atributo. | Ponto de captura de estado; onde ficarão hooks de `console-message` (T8) e `capturePage` (T7). |
| `src/renderer/src/components/PortalFlowNode.tsx` | Nó React Flow: nome editável, **seletor de sessão** (`linkedTo`), barra de URL com botão "ir" (navega só no Enter/clique), `NodeResizer`, `PortalNode key={partition}`. | Onde entra o realce visual "agente dirigindo" (T6). |
| `src/renderer/src/portalPartition.ts` | `partitionForPortal(nodeId, linkedTo)` → `persist:portal-${linkedTo||nodeId}`. Isolamento/compartilhamento de sessão. | Reusado por `orq portal create` (T5) — cada portal novo nasce isolado. |
| `src/renderer/src/portalRegistry.ts` | `Map<nodeId, WebviewTag>`: `registerPortal`/`unregisterPortal`/`getPortal`. Ponte nome→nó→webview vive só no renderer. | Como todo comando alcança o `<webview>` vivo. |
| `src/renderer/src/hooks/useOrchestrationSync.ts` | Aplica comandos do agente: `portalOpen` (guarda `isSafePortalUrl`), `portalClick`, `portalFill`, `portalEval`. `resolvePortalWebview(nodes, target)` resolve por nome. **Toda automação é `try/catch` + `.catch(()=>{})` silencioso — o booleano de retorno é jogado fora.** | Núcleo do gap #9 (T1); recebe os novos comandos T2/T3/T5/T7/T8. |
| `src/shared/portalScripts.ts` (+ `.test.ts`) | `clickScript(sel)` → `...return true } return false`; `fillScript(sel,txt)` → `if(!el) return false; ... return true`; `snapshotScript()` → `{url,title,text}` (text `.slice(0,4000)`). Todo valor via `JSON.stringify` (anti-injeção). | **O booleano de sucesso JÁ existe** (confirmado). Recebe `scrollScript` (T3) e `domSnapshotScript` (T4). |
| `src/shared/portalUrl.ts` (+ `.test.ts`) | `isSafePortalUrl`: aceita `http`/`https` e URL sem esquema; bloqueia `file://`/`javascript:`/`data:` e ofuscação por caracteres de controle (SEC-3). | Guarda reusada por `orq portal create` (T5) — não regredir. |
| `src/shared/orchestration.ts` | Tipos: união `OrchestrationCommand` (`portalOpen`/`portalClick`/`portalFill`/`portalEval`) e `interface PortalState {url,title,text}`. | Estende-se com novos comandos + `requestId?` (T1) e tipos de resultado. |
| `src/orq/orq.ts` (+ `orq.test.ts`) | CLI `portal` com `open`/`navigate`/`click`/`fill`/`eval`/`snapshot`. `click`/`fill` fazem POST e retornam `res.ok ? 'ok' : errOut` — **não leem corpo de resposta**. Ajuda documenta o modelo fire-and-forget. | Superfície de todos os subcomandos novos + leitura do `{ok}` (T1). |
| `src/main/orchestration/OrchestrationServer.ts` | Endpoints `POST /portal/{open,click,fill,eval}` (valida tipos → 400) e `GET /portal?name=` (404 se sem estado). `emit(cmd,res)` chama `onCommand(cmd)` **síncrono** → 200/503 (BLD-6, é "renderer vivo?", **não** o resultado da ação). Escopo de projeto (409) antes de toda rota. | Onde entram os endpoints novos + a variante **assíncrona** que aguarda o resultado (T1). |
| `src/main/index.ts` | `webviewTag:true`; `will-attach-webview` remove `preload`/força `nodeIntegration:false`/`contextIsolation:true`; `hardenSession` + `DENIED_PERMISSIONS` negados em toda sessão (`session-created` cobre partitions novas); `Map` `portalStates` (nome→estado) via IPC `portal:state`, servido em `GET /portal`; `resolveActiveProjectId`. **`onCommand` faz `webContents.send('orchestration:command', cmd, projectId)` — ponte UNIDIRECIONAL, sem canal de resposta.** | O hardening a NÃO regredir; onde nasce o registry de respostas pendentes (T1) e o escopo por projeto do estado (T9). |
| `src/preload/index.ts` | Expõe `orchestration.sync`/`onCommand`, `portalState` (send unidirecional), `onAgentAttention`/`clearAgentAttention`. `setMaxListeners(200)`. | Onde entra `portalResult`/`portalConsole` (canais de volta) e tipos novos. |
| `src/renderer/src/store/canvasStore.ts` | `addPortalNode(position, opts?)` → id `portal-<uuid>`, `data:{name:'Portal N', url}`, 480×320. `updatePortalUrl/Name/Link`. | Reusado por `orq portal create` (T5) e pelo flag de "driving" (T6). |
| `src/main/orchestration/installOrq.ts` | `ONBOARDING` cita `orq portal navigate/click/fill/snapshot`. Reescrito a cada boot. | Atualizar o texto com os novos comandos (create/screenshot/back/…). |
| `src/renderer/src/components/Topbar.tsx`, `Canvas.tsx`, `palette/paletteCommands.ts` | Entradas de criação de portal (ferramenta "Portal", "Novo portal aqui", comando "Criar Portal"). | Contexto — não mudam nas ondas 1–3. |
| `src/renderer/src/edges/edgeKind.ts` | Tipo de aresta `'portal'` (conexão envolvendo um portal), só visual hoje. | Base para o **gate por conexão** (item a avaliar). |

**Achado-chave (corrige a premissa do gap #9).** A análise diz "o valor de retorno já existe, falta só
encaminhá-lo pela ponte IPC/HTTP". Verdadeiro que o booleano existe — mas a ponte
`main → renderer` é **unidirecional** (`webContents.send`) e **não há canal de volta**
`renderer → main` para resultados de comando (só existe `portal:state`, um `send` unidirecional
disparado no `did-finish-load`, sem correlação). Logo, T1 precisa **construir** um round-trip
(id de correlação + canal de resposta + handler assíncrono no servidor + timeout), espelhando o
padrão assíncrono de `askWait`. Isso mantém o esforço em **M**, não **S**.

---

## 3. Gaps priorizados

| Gap | Prioridade | Valor | Esforço (S/M/L) | Onda |
| --- | --- | --- | --- | --- |
| #9 — `click`/`fill` não retornam sucesso ao agente (booleano descartado; ponte unidirecional) | P0 | Alto | M | 1 |
| #3 — Sem `back/forward/reload` dedicados (só `eval`) | P1 | Médio-alto | S | 2 |
| #3 — Sem `scroll` dedicado | P1 | Médio | S | 2 |
| A3 — `snapshot` só dá `innerText`; agente adivinha seletores (falta `--html/--dom`) | P1 | Alto | M | 2 |
| #4 — Agente não cria portais (falta `orq portal create`) | P1 | Alto | M | 2 |
| C4 — Sem indicador visual de "agente dirigindo" | P2 | Médio (UX) | S | 2 |
| #1 — Sem screenshot; agente não "vê" a página (multimodal) | P2 | Alto | L | 3 |
| #2 — Sem leitura de console/erros | P2 | Médio | M | 3 |
| #8 — `portalStates` global por nome (resíduo cross-project) | P3 | Robustez | M | 3 |
| #6 — Sem gate por conexão (aresta terminal→portal não restringe) | Avaliar | Médio | M | — |
| C2 — Entrada "real" via CDP (anti-bot) | Avaliar | Alto | L | — |

---

## 4. Tarefas de implementação (TDD, em ordem)

> Regra transversal (segurança — **não regredir**): todo valor vindo do agente (seletor/texto/URL/JS/
> números) continua embutido via `JSON.stringify`/coerção numérica, **nunca** concatenação crua;
> `orq portal create` roda a URL por `isSafePortalUrl` antes de navegar; nenhum toque em
> `will-attach-webview`, `hardenSession`/`DENIED_PERMISSIONS` ou no `webviewTag`. Portais novos herdam
> o hardening automaticamente (`app.on('session-created', hardenSession)`).
>
> Onde a mudança toca `<webview>`/IPC (não testável em unidade no jsdom), **extraia helpers puros**
> (parsing de comando, geração de script, validação, ring-buffer, registry de pendências) e teste-os;
> o fio IPC vai para o **checklist manual** (`npm run dev`).

---

### T1 — Feedback de sucesso em `portal click`/`fill` (round-trip do booleano)  [P0 · M · Onda 1]

- **Arquivos a tocar:**
  - `src/shared/orchestration.ts` — adicionar `requestId?: string` a `portalClick`/`portalFill`; novo tipo `PortalActionResult { ok: boolean }`.
  - `src/main/orchestration/portalActionRegistry.ts` ((novo)) — registry puro de promises pendentes por `requestId`, com timeout.
  - `src/main/orchestration/portalActionRegistry.test.ts` ((novo)).
  - `src/main/orchestration/OrchestrationServer.ts` — nova opt `runPortalAction?: (cmd) => Promise<PortalActionResult | null>`; `/portal/click` e `/portal/fill` passam a **aguardar** o resultado e responder `{ok}` JSON (ou 503 se sem renderer, 504/`{ok:false}` no timeout). Fallback ao `emit` atual quando a opt está ausente (retrocompat dos testes existentes).
  - `src/main/index.ts` — implementar `runPortalAction`: gera `requestId`, registra a pendência, faz `webContents.send('orchestration:command', {...cmd, requestId}, projectId)`; resolve ao chegar `portal:result`. Novo `ipcMain.on('portal:result', ...)`.
  - `src/preload/index.ts` — expor `portalResult(requestId, ok)` (send de volta) e tipar em `onCommand` o `requestId`.
  - `src/renderer/src/hooks/useOrchestrationSync.ts` — em `portalClick`/`portalFill`, encadear o `.then((ok) => window.orkestra.portalResult(cmd.requestId, ok))` (e `.catch(() => portalResult(requestId, false))`); só responde quando há `requestId`.
  - `src/orq/orq.ts` — `click`/`fill` leem o corpo JSON e imprimem `ok: true`/`ok: false` (mantendo `code 0` no HTTP 200; `code 1` em não-ok de transporte).
  - `src/orq/orq.test.ts` — novos casos.
- **Passos TDD:**
  1. **Teste que falha:**
     - `portalActionRegistry.test.ts`: `register(id)` devolve uma Promise; `resolve(id, {ok:true})` a cumpre com `{ok:true}`; `id` desconhecido em `resolve` é no-op; a Promise **rejeita/resolve `{ok:false}` após o timeout** (usar `vi.useFakeTimers()`), e a entrada é limpa do mapa (sem vazamento).
     - `orq.test.ts`: `startServer(..., { runPortalAction: async () => ({ ok: false }) })` → `runOrq(['portal','click','P','.x'])` → `expect(out).toContain('ok: false')` e `code` 0. Outro caso com `{ ok: true }` → `out` contém `ok: true`. Caso `runPortalAction: async () => null` (sem renderer) → `code != 0` (503).
  2. **Implementação:** registry puro (Map `requestId → {resolve, timer}`, `randomUUID` do id no chamador); servidor com handler assíncrono para `/portal/click|fill` (mesma forma do ramo `askWait`: `void (async () => { const r = await opts.runPortalAction?.(cmd); ... })()`); main que fecha o loop via `portal:result`; renderer que encaminha o booleano; orq que imprime `ok: <bool>`.
  3. **Verde:** `npx vitest run src/main/orchestration/portalActionRegistry.test.ts src/orq/orq.test.ts`.
- **Critérios de aceite:**
  - `orq portal click "P" ".naoexiste"` imprime `ok: false`; `orq portal click "P" "#existe"` imprime `ok: true` — sem `snapshot` extra.
  - Sem renderer vivo → 503 (mesma orientação BLD-6 de hoje); timeout do renderer → resposta determinística (`ok:false`/erro), nunca pendura o agente.
  - `portalEval`/`portalOpen` seguem fire-and-forget (inalterados); testes existentes de portal continuam verdes (fallback quando `runPortalAction` ausente).
  - `npm run typecheck` e `npm run lint` limpos.
- **Notas (riscos/edge cases):**
  - **Correlação obrigatória:** sem `requestId` a resposta é ignorada — comandos legados/externos não quebram.
  - **Timeout** (ex.: 5000 ms) evita agente pendurado se o webview morrer entre o `send` e o reply; ao expirar, limpar a pendência (evita vazamento de memória — mesmo cuidado do teto de `waitForIdle`).
  - **Escopo de projeto:** o guard 409 continua na frente; se o renderer descartar o comando pelo guard de projeto (assíncrono, invisível ao main), o timeout cobre — documentar como limitação conhecida (igual à nota BLD-6).
  - Não abrir novo canal por ação: reusar `orchestration:command` (só carimbar `requestId`) minimiza a superfície.

---

### T2 — `orq portal back|forward|reload` (navegação dedicada)  [P1 · S · Onda 2]

- **Arquivos a tocar:**
  - `src/shared/orchestration.ts` — `{ type: 'portalNavigate'; target: string; action: 'back'|'forward'|'reload' }` (união fechada de ações).
  - `src/orq/orq.ts` (+ `orq.test.ts`) — subcomandos `back`/`forward`/`reload` → POST `/portal/nav` com `{target, action}`.
  - `src/main/orchestration/OrchestrationServer.ts` — endpoint `POST /portal/nav` validando `action ∈ {back,forward,reload}` (senão 400).
  - `src/renderer/src/hooks/useOrchestrationSync.ts` — `portalNavigate` → `webview.goBack()`/`goForward()`/`reload()`.
- **Passos TDD:**
  1. **Teste que falha (`orq.test.ts`):** `runOrq(['portal','back','P'])` → `commands` contém `{type:'portalNavigate',target:'P',action:'back'}` e `code 0`; idem forward/reload. `action` inválida (rota chamada com corpo ruim) → 400/`code != 0`.
  2. **Implementação:** parser no orq (mapa `sub → action`), validação no servidor, aplicação no hook (`goBack`/`goForward`/`reload` são métodos nativos do `WebviewTag`, sem injeção de script).
  3. **Verde:** `npx vitest run src/orq/orq.test.ts`.
- **Critérios de aceite:** os três comandos emitem o `OrchestrationCommand` correto; ajuda do `portal` atualizada; `back/forward` são no-op seguros quando não há histórico.
- **Notas:** sem superfície de injeção (ações são enum, não string livre); reusar o round-trip do T1 é **opcional** aqui (navegação é idempotente e barata) — manter fire-and-forget para não inflar o esforço.

---

### T3 — `orq portal scroll` (rolagem dedicada)  [P1 · S · Onda 2]

- **Arquivos a tocar:**
  - `src/shared/portalScripts.ts` (+ `.test.ts`) — `scrollScript(x: number, y: number)` que **coage** os args (`Number(...)`, `NaN`→0, embute como número literal, nunca string crua).
  - `src/shared/orchestration.ts` — `{ type: 'portalScroll'; target: string; x: number; y: number }`.
  - `src/orq/orq.ts` (+ `orq.test.ts`) — `orq portal scroll "<nome>" <dx> <dy>` (dy opcional=0).
  - `src/main/orchestration/OrchestrationServer.ts` — `POST /portal/scroll` validando `typeof x/y === 'number'` (400 se não).
  - `src/renderer/src/hooks/useOrchestrationSync.ts` — `portalScroll` → `executeJavaScript(scrollScript(x,y))`.
- **Passos TDD:**
  1. **Teste que falha (`portalScripts.test.ts`):** `scrollScript(0, 500)` contém `window.scrollBy(0, 500)` (ou `scrollBy` com os números); `scrollScript('x' as any, 'y' as any)` **não** injeta a string — resulta em `0,0` (prova a coerção anti-injeção). `orq.test.ts`: `runOrq(['portal','scroll','P','0','800'])` → `{type:'portalScroll',target:'P',x:0,y:800}`.
  2. **Implementação:** `scrollScript` puro; parsing numérico no orq; validação no servidor.
  3. **Verde:** `npx vitest run src/shared/portalScripts.test.ts src/orq/orq.test.ts`.
- **Critérios de aceite:** `orq portal scroll "P" 0 600` rola 600px; valores não-numéricos viram 0 (nunca injeção).
- **Notas:** **segurança** — este é o único comando novo que injeta script com valor do agente; a coerção `Number()` + literal numérico é a barreira (análoga ao `JSON.stringify` dos demais). Testar explicitamente o caso hostil.

---

### T4 — `orq portal snapshot --html/--dom` (expor seletores ao agente)  [P1 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/shared/portalScripts.ts` (+ `.test.ts`) — `domSnapshotScript(maxChars = 8000)`: coleta os elementos **interativos** (`a,button,input,textarea,select,[role=button],[onclick]`) com um seletor sugerido (`tag#id` / `tag.classe` / `[name=…]`) + rótulo curto (texto/aria-label/placeholder), retornando um array serializável limitado por tamanho.
  - `src/shared/orchestration.ts` — estender `PortalState` com `dom?: string` **ou** adicionar 2º canal; decisão: guardar o `dom` no mesmo `portalStates` (capturado no `did-finish-load`, ao lado do `text`), evitando round-trip novo.
  - `src/renderer/src/components/PortalNode.tsx` — no `did-finish-load`, além de `snapshotScript()`, rodar `domSnapshotScript()` e enviar junto em `portalState`.
  - `src/main/index.ts` — `portalStates` passa a guardar `dom` também.
  - `src/orq/orq.ts` (+ `orq.test.ts`) — flag `--html`/`--dom` em `snapshot`: quando presente, imprime a seção de elementos interativos/seletores.
  - `src/main/orchestration/OrchestrationServer.ts` — `GET /portal` já devolve o `PortalState` completo (inclui `dom` novo); sem rota nova.
- **Passos TDD:**
  1. **Teste que falha:**
     - `portalScripts.test.ts`: `domSnapshotScript()` contém `querySelectorAll`, referencia as tags interativas e aplica `.slice`/limite; monta seletor a partir de `id`/`name`/classe (asserir o formato do gerador, já que a execução real é no webview).
     - `orq.test.ts`: `getPortalState` devolve `{url,title,text,dom:'[button] #enviar — Enviar'}`; `runOrq(['portal','snapshot','P','--dom'])` → `out` contém `#enviar`. Sem a flag, o `out` mantém só url/title/text (retrocompat — assertar que **não** inclui o dom).
  2. **Implementação:** gerador puro; captura no `PortalNode`; flag no orq (parsing igual ao `--wait`, aceita em qualquer posição).
  3. **Verde:** `npx vitest run src/shared/portalScripts.test.ts src/orq/orq.test.ts`.
- **Critérios de aceite:** `orq portal snapshot "P" --dom` lista elementos clicáveis/campos com seletores utilizáveis direto em `click`/`fill`; saída limitada (cap de chars); `snapshot` sem flag inalterado.
- **Notas (segurança):** o DOM vira **texto** no terminal do agente (não é renderizado) → sem XSS; ainda assim **cap de tamanho** (evita despejar página gigante). `file://` já está bloqueado na navegação, então o DOM não exfiltra arquivo local. Não expor `value` de campos `type=password`.

---

### T5 — `orq portal create "<nome>" "<url>"` (agente cria portais)  [P1 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/shared/orchestration.ts` — `{ type: 'portalCreate'; name: string; url?: string }`.
  - `src/orq/orq.ts` (+ `orq.test.ts`) — subcomando `create` → POST `/portal/create` com `{name, url}`.
  - `src/main/orchestration/OrchestrationServer.ts` — `POST /portal/create` (valida `name:string`, `url` opcional string; 400 senão).
  - `src/renderer/src/hooks/useOrchestrationSync.ts` — `portalCreate`: se `url` presente, **validar com `isSafePortalUrl`** (retornar sem criar se inseguro, como `portalOpen` faz); chamar `store.addPortalNode(undefined, { name, url })`.
- **Passos TDD:**
  1. **Teste que falha (`orq.test.ts`):** `runOrq(['portal','create','Pesquisa','https://example.com'])` → `commands` contém `{type:'portalCreate',name:'Pesquisa',url:'https://example.com'}` e `code 0`. `create` só com nome (`url` ausente) também funciona.
  2. **Implementação:** parser no orq; validação no servidor; no hook, guard `isSafePortalUrl(url)` **antes** de `addPortalNode` (reusa a barreira SEC-3).
  3. **Verde:** `npx vitest run src/orq/orq.test.ts`.
- **Critérios de aceite:** `orq portal create "Docs" "https://example.com"` cria um nó portal no canvas já navegando; portal novo nasce com **partition isolada própria** (`persist:portal-<uuid>` via `addPortalNode`→`partitionForPortal`) e herda o `hardenSession` (via `session-created`). `create` com `file://`/`javascript:` cria o portal mas **não navega** (URL descartada) — nunca carrega esquema hostil.
- **Notas:** nome duplicado é permitido (como hoje); a resolução por nome dos comandos seguintes pega o primeiro — documentar. Considerar retornar o `nodeId` criado ao agente numa iteração futura (exigiria round-trip T1) — fora do escopo desta tarefa.

---

### T6 — Indicador visual "agente dirigindo"  [P2 · S · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/store/canvasStore.ts` — slice `drivingPortals: Set<string>` (por `nodeId`) + ação pura `markPortalDriving(nodeId)` que adiciona e agenda remoção após ~1200 ms (debounce por nó).
  - `src/renderer/src/store/canvasStore.test.ts` (ou arquivo de teste do store existente) — testar a lógica pura de marcação/expiração com `vi.useFakeTimers()`.
  - `src/renderer/src/hooks/useOrchestrationSync.ts` — em `portalClick/Fill/Scroll/Open/Navigate/Eval`, após resolver o webview, chamar `markPortalDriving(node.id)`.
  - `src/renderer/src/components/PortalFlowNode.tsx` — ler `drivingPortals` (com `useShallow`) e aplicar classe CSS `ork-node--driving` no `.ork-node`.
  - `src/renderer/src/components/nodes.css` — regra de realce coerente com o `border-beam` de "gerando" dos terminais (reusar a animação existente).
- **Passos TDD:**
  1. **Teste que falha:** `markPortalDriving('portal-1')` deixa `drivingPortals` com `portal-1`; após avançar o timer, o set fica vazio; chamadas repetidas **estendem** a janela (não empilham timers duplicados).
  2. **Implementação:** reducer/timer puro no store; wiring no hook; classe no componente; CSS.
  3. **Verde:** `npx vitest run src/renderer/src/store/canvasStore.test.ts`.
- **Critérios de aceite:** ao rodar qualquer `orq portal <ação> "P" …`, o nó do portal P ganha realce por ~1s; some sozinho; múltiplos comandos em sequência mantêm o realce aceso.
- **Notas:** puramente visual — não bloqueia interação; limpar timers no reset/troca de projeto para não vazar. Checklist manual valida a estética (o teste cobre só a máquina de estado).

---

### T7 — `orq portal screenshot` (capturePage → arquivo, agente multimodal)  [P2 · L · Onda 3]

- **Arquivos a tocar:**
  - `src/shared/orchestration.ts` — `{ type: 'portalScreenshot'; target: string; requestId: string }` + tipo de resultado `PortalScreenshotResult { ok: boolean; path?: string }`.
  - `src/main/orchestration/OrchestrationServer.ts` — `POST /portal/screenshot` **assíncrono** (reusa o round-trip do T1) devolvendo `{ok, path}` JSON.
  - `src/main/index.ts` — ao receber o `portal:result` do screenshot (base64/`Buffer`), **gravar** PNG em `os.tmpdir()/orkestra-portal-<nomeSanitizado>-<ts>.png` e resolver a pendência com o caminho. Helper puro `screenshotFilename(name, ts)` ((novo em `src/main/orchestration/portalScreenshot.ts`)) + teste.
  - `src/renderer/src/components/PortalNode.tsx` / `useOrchestrationSync.ts` — `portalScreenshot`: `webview.capturePage()` → `NativeImage.toPNG()` → base64 → `window.orkestra.portalResult(requestId, {png})`.
  - `src/preload/index.ts` — `portalResult` aceita payload de imagem além do booleano (união de tipos).
  - `src/orq/orq.ts` (+ `orq.test.ts`) — `orq portal screenshot "<nome>"` imprime o caminho do arquivo salvo.
- **Passos TDD:**
  1. **Teste que falha:** `portalScreenshot.test.ts`: `screenshotFilename('Meu Portal!', 123)` → nome sanitizado, sem separadores de path, sufixo `.png`. `orq.test.ts`: `startServer(..., { runPortalAction: async () => ({ ok:true, path:'/tmp/x.png' }) })` → `runOrq(['portal','screenshot','P'])` → `out` contém `/tmp/x.png`.
  2. **Implementação:** filename puro; captura no renderer; escrita do arquivo no main; endpoint assíncrono; orq imprime o path.
  3. **Verde:** `npx vitest run src/main/orchestration/portalScreenshot.test.ts src/orq/orq.test.ts`.
- **Critérios de aceite:** `orq portal screenshot "P"` salva um PNG e imprime o caminho; o agente multimodal abre esse arquivo com a própria ferramenta de leitura de imagem. Sem renderer → 503; timeout → erro determinístico.
- **Notas (transporte/segurança):** a ponte hoje só carrega texto/JSON pequeno; base64 de PNG pode passar de 1 MB — **preferir arquivo temporário** (path curto no stdout) a despejar base64. Limpeza: gravar em `tmpdir` (o SO limpa) e/ou apagar screenshots antigos do portal a cada nova captura. `capturePage` só captura o que já está renderizado (mesma visibilidade do humano) — sem novo vazamento. **Depende de T1** (infra de round-trip).

---

### T8 — `orq portal console` (buffer de console/erros)  [P2 · M · Onda 3]

- **Arquivos a tocar:**
  - `src/shared/portalConsoleBuffer.ts` (+ `.test.ts`) ((novo)) — ring-buffer puro: `pushConsole(lines, entry, cap=200)` (descarta o mais antigo, trunca cada linha por tamanho).
  - `src/renderer/src/components/PortalNode.tsx` — assinar `webview.addEventListener('console-message', …)`; acumular via `pushConsole`; reportar batches ao main via novo IPC `portal:console` (`{name, entries}`), espelhando o padrão de `portal:state`.
  - `src/preload/index.ts` — `portalConsole(payload)` (send unidirecional).
  - `src/main/index.ts` — `Map<string, string[]>` `portalConsoles` alimentado por `ipcMain.on('portal:console', …)`; `getPortalConsole(name)`.
  - `src/main/orchestration/OrchestrationServer.ts` — `GET /portal/console?name=` (404 se vazio).
  - `src/orq/orq.ts` (+ `orq.test.ts`) — `orq portal console "<nome>"` imprime as linhas bufferizadas.
- **Passos TDD:**
  1. **Teste que falha:** `portalConsoleBuffer.test.ts`: `pushConsole` respeita o `cap` (mantém as últimas N), trunca linha longa. `orq.test.ts`: `startServer(..., { getPortalConsole: () => ['erro X','warn Y'] })` (nova opt) → `runOrq(['portal','console','P'])` → `out` contém `erro X`; buffer vazio → `code != 0` (404).
  2. **Implementação:** ring-buffer puro; assinatura no `PortalNode`; canal IPC; mapa no main; rota; comando no orq.
  3. **Verde:** `npx vitest run src/shared/portalConsoleBuffer.test.ts src/orq/orq.test.ts`.
- **Critérios de aceite:** `orq portal console "P"` mostra os últimos erros/logs do site; memória limitada pelo ring-buffer.
- **Notas:** só strings bufferizadas (nível+mensagem); cap por linha e por buffer bounda a memória. Throttle do report ao main (evitar tempestade de IPC em páginas verborrágicas). Mesmo padrão global-por-nome do `portalStates` — herda o gap #8 (endereçado no T9).

---

### T9 — Escopar `portalStates` (e `portalConsoles`) por projeto  [P3 · M · Onda 3]

- **Arquivos a tocar:**
  - `src/main/orchestration/portalStateStore.ts` (+ `.test.ts`) ((novo)) — wrapper puro de mapa com **chave composta** `(projectId, name)`: `set`, `get`, `clearProject(projectId)`.
  - `src/main/index.ts` — `portalStates`/`portalConsoles` passam pelo wrapper; o IPC `portal:state`/`portal:console` inclui `projectId` (renderer envia `store.activeProjectId`); `getPortalState`/`getPortalConsole` resolvem por `resolveActiveProjectId()`.
  - `src/preload/index.ts` + `src/renderer/src/components/PortalNode.tsx` — anexar `projectId` (do store) ao payload de `portalState`/`portalConsole`.
  - Limpeza opcional no `projects:remove`/switch: `clearProject(id)`.
- **Passos TDD:**
  1. **Teste que falha:** `portalStateStore.test.ts`: estado de `('proj-A','P')` não é lido por `('proj-B','P')`; `clearProject('A')` remove só os de A; `get` de chave ausente → `null`.
  2. **Implementação:** wrapper puro; wiring no main/preload/renderer.
  3. **Verde:** `npx vitest run src/main/orchestration/portalStateStore.test.ts`.
- **Critérios de aceite:** `snapshot`/`console` de um projeto nunca retornam resíduo de outro; o guard 409 continua sendo a barreira de acesso (defesa em profundidade). Testes existentes de `GET /portal` seguem verdes (projeto ausente → comportamento legado).
- **Notas:** o `projectId` no payload é *hint*; a autoridade continua sendo `getActiveProjectId()` no servidor. Fecha o gap #8 sem mexer no modelo de segurança.

---

### (A avaliar — decisão de produto, fora das ondas 1–3)

- **Gate por conexão (#6).** Exigir aresta `'portal'` (terminal→portal) para dirigir. Reusa `edgeKind.ts` + o `mirror.edges` já disponível no servidor (como `GET /context` faz). Implementável como **modo configurável** (não padrão) para não adicionar fricção. Esforço M.
- **Entrada "real" via CDP (C2).** `webContents.debugger.attach()` + `Input.dispatchMouseEvent/dispatchKeyEvent` para sites com anti-bot que ignoram `.click()`/`dispatchEvent`. Alto esforço/manutenção; só se surgir demanda concreta. **Não** enfraquecer o hardening ao anexar o debugger.

---

## 5. Dependências & riscos

- **T7 depende de T1** (compartilham o round-trip request/response com `requestId` + timeout). Fazer T1 primeiro reduz retrabalho.
- **T8 e T9** compartilham o padrão "mapa no main alimentado por IPC do renderer, lido por rota GET" — implementar T8 já pensando na chave composta do T9 evita migração dupla.
- **Risco de segurança (o diferencial a preservar):**
  - Único vetor de injeção novo é o `scrollScript` (T3) — coerção numérica obrigatória e testada.
  - `orq portal create` (T5) **deve** passar a URL por `isSafePortalUrl` antes de navegar (regressão SEC-3 se esquecido).
  - `snapshot --dom` (T4) e `console` (T8) retornam **texto** ao terminal (sem render) → sem XSS; ainda assim cap de tamanho e omitir `value` de campos de senha.
  - Portais criados pelo agente herdam `hardenSession` via `session-created` e `will-attach-webview` — **não** tocar nesses handlers.
- **Risco de UX:** timeout do round-trip (T1/T7) precisa ser generoso o bastante para páginas lentas, mas finito — nunca pendurar o agente.
- **Risco de memória:** ring-buffers (T8) e limpeza de screenshots antigos (T7) bounded; timers do "driving" (T6) e das pendências (T1) precisam ser limpos no unmount/reset/troca de projeto.
- **Retrocompatibilidade:** todos os endpoints/opts novos usam fallback quando ausentes — a suíte atual (`orq.test.ts`, `portalScripts.test.ts`, `portalUrl.test.ts`) deve continuar verde sem edição dos casos existentes.

**Verificação por tarefa:** `npx vitest run <arquivo>` (indicado em cada T) · **global:** `npm run typecheck` e `npm run lint`.

**Checklist manual (`npm run dev`):**
1. Criar um portal, navegar para um formulário. `orq portal click "P" "#botao"` → confirmar `ok: true`; `orq portal click "P" ".nada"` → `ok: false` (T1).
2. `orq portal back|forward|reload|scroll "P" 0 600` → página responde (T2/T3).
3. `orq portal snapshot "P" --dom` → lista seletores utilizáveis (T4).
4. `orq portal create "Novo" "https://example.com"` → nó aparece navegando; `create` com `file:///…` → nó aparece **sem** navegar (T5).
5. Rodar qualquer comando → realce "dirigindo" pisca no nó (T6).
6. `orq portal screenshot "P"` → PNG salvo, caminho impresso (T7).
7. `orq portal console "P"` → erros/logs do site (T8).
8. Abrir dois projetos; confirmar que `snapshot`/`console` não vazam entre eles (T9).
9. **Segurança (não regredir):** um site no portal pede câmera/geolocalização → negado (hardenSession); `orq portal open "P" "file:///etc/passwd"` → não carrega.

---

## 6. Referências

**Documento de origem**
- `docs/analise-maestri-360/portais.md` — análise 360° (gaps §5.5, melhorias §6, backend §4).

**Código-fonte real verificado (caminhos confirmados nesta análise)**
- `src/shared/portalScripts.ts` (+ `.test.ts`) — `clickScript`/`fillScript` **retornam booleano** (confirmado); `snapshotScript` (cap 4000).
- `src/shared/portalUrl.ts` (+ `.test.ts`) — `isSafePortalUrl` (SEC-3: bloqueia `file://`/`javascript:`/`data:`/controle).
- `src/shared/orchestration.ts` — `OrchestrationCommand`, `PortalState`.
- `src/renderer/src/hooks/useOrchestrationSync.ts` — aplica os comandos; **descarta o booleano** (`.catch(()=>{})`).
- `src/renderer/src/components/PortalNode.tsx` — `<webview>`, registry, report `portal:state` no `did-finish-load`.
- `src/renderer/src/components/PortalFlowNode.tsx` — nó React Flow, barra de URL, seletor de sessão.
- `src/renderer/src/portalRegistry.ts` / `portalPartition.ts` — `getPortal(nodeId)` / `partitionForPortal(nodeId, linkedTo)`.
- `src/renderer/src/store/canvasStore.ts` — `addPortalNode`, `updatePortalUrl/Name/Link`.
- `src/orq/orq.ts` (+ `orq.test.ts`) — CLI `portal open|navigate|click|fill|eval|snapshot`; `click`/`fill` **não leem corpo de resposta** (só `res.ok`).
- `src/main/orchestration/OrchestrationServer.ts` — endpoints `/portal/*`; `emit` síncrono (BLD-6 = "renderer vivo?", não resultado); ramo `askWait` = **modelo do handler assíncrono** para T1/T7.
- `src/main/index.ts` — `webviewTag`, `will-attach-webview`, `hardenSession`/`DENIED_PERMISSIONS`, `portalStates`, `resolveActiveProjectId`; **ponte `webContents.send` unidirecional** (sem canal de volta).
- `src/main/orchestration/installOrq.ts` — `ONBOARDING` (atualizar com os comandos novos).
- `src/preload/index.ts` — canais `orchestration:command`/`sync`, `portal:state` (todos unidirecionais hoje).
- `src/renderer/src/edges/edgeKind.ts` — tipo de aresta `'portal'` (base do gate por conexão, a avaliar).

**Documentação Maestri**
- Portais — <https://www.themaestri.app/pt-br/docs/portals>.
