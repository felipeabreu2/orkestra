# Orkestra — Fase 9 (Portais: browser embutido dirigível) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Um **portal** é um nó do canvas com um browser embutido (`<webview>`). Um agente, via `orq`, **dirige** o portal: `orq portal open "<nome>" "<url>"`, `orq portal navigate`, `orq portal click "<nome>" "<seletor>"`, `orq portal fill "<nome>" "<seletor>" "<texto>"`, `orq portal eval "<nome>" "<js>"`, e lê o estado com `orq portal snapshot "<nome>"` (url + título + texto).

**Architecture:** O `PortalNode` (renderer) hospeda um Electron `<webview>` (habilitado por `webviewTag:true`), integrado ao React Flow como elemento DOM (flui com pan/zoom — nada de sincronizar posição, ao contrário de `BrowserView`). Portais têm **nome** editável (default "Portal N"). Comandos de portal viajam pelo mesmo caminho da Fase 6/7: `orq` → `OrchestrationServer` → `onCommand` → `webContents.send` → `useOrchestrationSync` → o `PortalNode` alvo (por nome) executa no seu `<webview>` via `executeJavaScript`/`loadURL`. Para leitura, o `PortalNode` reporta ao main o **estado** do webview (url/título/texto-limitado) a cada `did-finish-load`; `orq portal snapshot` faz um GET que devolve o último estado (padrão espelho, como o `orq check`). **Automação = fire-and-forget** (open/click/fill/eval não bloqueiam); o snapshot lê o último estado carregado.

**Segurança do webview:** o `<webview>` carrega conteúdo web **não confiável**, então roda com `nodeintegration` desativado e `contextIsolation` ativo (padrão do webview) — a página nunca alcança Node/main. `orq portal eval` executa JS **no contexto da página** (confinado à página, não ao processo) — é o agente dirigindo, aceitável dado que ele já tem o terminal. A geração dos scripts de click/fill é feita por funções puras testáveis; valores são serializados via `JSON.stringify` (sem injeção de aspas).

**Tech Stack:** Electron `<webview>` tag. Sem deps novas. Vitest (lógica pura + endpoints + orq; o webview real é checkpoint humano).

## Global Constraints

- Renderer NÃO importa `fs`/`http`/`node-pty`/`child_process`. Segurança do servidor inalterada (127.0.0.1 + token, gate antes do routing).
- `webviewTag:true` habilitado no `webPreferences` da janela; `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false` permanecem.
- O `<webview>` roda com `nodeintegration` OFF; `orq portal eval` é confinado à página.
- Valores de selector/texto/url injetados em scripts via `JSON.stringify` (nunca concatenação crua de strings).
- Nomenclatura: **não** usar marcas do Maestri.

---

### Task 1: `PortalNode` (webview) + store + persistência + scripts de automação (TDD onde aplicável)

**Files:**
- Create: `src/renderer/src/components/PortalNode.tsx`, `src/renderer/src/components/PortalFlowNode.tsx`, `src/shared/portalScripts.ts` (+ `.test.ts`)
- Modify: `src/renderer/src/store/canvasStore.ts` (+ `.test.ts`), `src/renderer/src/components/Canvas.tsx` (registrar o nodeType `portal` + botão criar), `src/renderer/src/flow` (onde os `nodeTypes` são definidos — localizar), `src/main/index.ts` (webPreferences `webviewTag:true`)

**Interfaces:**
- Produces:
  - `src/shared/portalScripts.ts`: funções PURAS que geram o JS a executar no webview — `clickScript(selector: string): string`, `fillScript(selector: string, text: string): string`, `snapshotScript(): string` (retorna um IIFE que resolve `{url,title,text}`). Todas usam `JSON.stringify` nos valores.
  - store: `addPortalNode(position?, opts?: { name?; url? })` (semeia `data:{ name:'Portal N', url:'' }`, tipo `'portal'`); `updatePortalUrl(id, url)`; `updatePortalName(id, name)` (ou reusar um `updateNodeName` genérico se já houver — senão espelhar `updateTerminalName`).

- [ ] **Step 1: `portalScripts` test (falha primeiro)**

`src/shared/portalScripts.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { clickScript, fillScript, snapshotScript } from './portalScripts'

describe('portalScripts', () => {
  it('clickScript embute o seletor com segurança (JSON.stringify)', () => {
    const s = clickScript('a.btn"; alert(1)//')
    expect(s).toContain(JSON.stringify('a.btn"; alert(1)//'))
    expect(s).toContain('querySelector')
  })
  it('fillScript seta value e dispara evento input', () => {
    const s = fillScript('#in', 'olá "mundo"')
    expect(s).toContain(JSON.stringify('#in'))
    expect(s).toContain(JSON.stringify('olá "mundo"'))
    expect(s).toContain('input')
  })
  it('snapshotScript retorna url/title/text', () => {
    const s = snapshotScript()
    expect(s).toContain('location.href'); expect(s).toContain('document.title')
  })
})
```

- [ ] **Step 2: Implementar `src/shared/portalScripts.ts`**

```ts
export function clickScript(selector: string): string {
  return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) { el.click(); return true } return false })()`
}
export function fillScript(selector: string, text: string): string {
  return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`
}
export function snapshotScript(): string {
  return `(() => ({ url: location.href, title: document.title, text: (document.body ? document.body.innerText : '').slice(0, 4000) }))()`
}
```

- [ ] **Step 3: Store — addPortalNode (TDD)**

Teste em `canvasStore.test.ts`: `addPortalNode(undefined,{url:'https://x'})` cria um nó tipo `'portal'` com `data.url==='https://x'` e um `data.name` "Portal N"; `updatePortalUrl` altera a url. Implementar espelhando `addTerminalNode`/`updateNoteContent` (contador `portalSeq`, seeding de `data.name`/`data.url`; incluir `portalSeq` no seeding do `hydrate` como o `terminalSeq`).

- [ ] **Step 4: `PortalNode.tsx` + `PortalFlowNode.tsx` (UI — manual)**

`PortalNode.tsx`: renderiza `<webview src={url} style={{width:'100%',height:'100%'}} />` (com `ref`); expõe o `ref` do webview ao pai (ou registra o webview num registry por node.id para o hook de comandos alcançá-lo — ver Task 2). `PortalFlowNode.tsx`: header com o nome editável (como o terminal) + uma barra de URL (input + "ir" → `updatePortalUrl` + `webview.loadURL`), e o `<PortalNode/>` no corpo; `NodeResizer` como os outros nós.

- [ ] **Step 5: Registrar o nodeType + botão criar + habilitar webviewTag**

No mapa de `nodeTypes` do React Flow, registrar `portal: PortalFlowNode`. Em `Canvas.tsx`, um botão "+ Portal" → `addPortalNode()`. Em `main/index.ts` `createWindow`, adicionar `webviewTag: true` ao `webPreferences` (mantendo `contextIsolation:true, sandbox:true, nodeIntegration:false`).

- [ ] **Step 6: Testes + typecheck** — `npm test && npm run typecheck` verdes (portalScripts + store).

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: PortalNode (webview) + scripts de automacao + store/persistencia (Fase 9)"`

---

### Task 2: Comandos de portal (`orq portal ...`) + aplicação no webview + snapshot + checkpoint (TDD)

**Files:**
- Modify: `src/shared/orchestration.ts` (OrchestrationCommand + portal state no mirror ou canal próprio), `src/main/orchestration/OrchestrationServer.ts` (+ `.test.ts`), `src/orq/orq.ts` (+ `.test.ts`), `src/renderer/src/hooks/useOrchestrationSync.ts`, `src/main/index.ts`, `src/renderer/src/components/PortalNode.tsx`

**Interfaces:**
- Consumes: `portalScripts` + o webview registry (Task 1); `OrchestrationServer` opts (`onCommand`, `ask`/`check` padrão); o mecanismo mirror/onCommand (Fase 6/7).
- Produces:
  - `OrchestrationCommand` estende: `| { type:'portalOpen'; target; url } | { type:'portalClick'; target; selector } | { type:'portalFill'; target; selector; text } | { type:'portalEval'; target; js }`.
  - Endpoints `POST /portal/open|click|fill|eval` (ou um `POST /portal` com `{action,target,...}`) → validam strings → `onCommand` → 200/400. `GET /portal?name=` → devolve o último estado reportado `{url,title,text}` ou 404.
  - Um canal IPC `portal:state` (renderer→main): o `PortalNode` reporta `{name,url,title,text}` no `did-finish-load`; o main guarda por nome; o `GET /portal` lê disso.
  - `orq portal open|navigate|click|fill|eval|snapshot`.

- [ ] **Step 1: Endpoints test (falha primeiro)**

Em `OrchestrationServer.test.ts`: `POST /portal/click {target:'P', selector:'.x'}` (token) → `onCommand` recebe `{type:'portalClick',target:'P',selector:'.x'}`, 200; body inválido → 400. `GET /portal?name=P` → devolve o estado injetado por um `getPortalState` fake (ou 404 se ausente). (Adicionar `getPortalState?: (name)=>{url,title,text}|null` às opts do server.)

- [ ] **Step 2: Implementar endpoints em `OrchestrationServer.ts`**

Estender `OrchestrationCommand` (shared). Adicionar, após o token gate, os handlers `POST /portal/<action>` (parse body, validar, `onCommand`) e `GET /portal` (lê `getPortalState(name)`). Mesmo padrão try/catch do `/note`/`/recruit`.

- [ ] **Step 3: `orq` portal (TDD)**

Em `orq.test.ts`: `runOrq(['portal','click','P','.x'], env)` → `onCommand` recebe o portalClick; `runOrq(['portal','snapshot','P'], env)` → imprime o estado do `GET /portal`. Em `orq.ts`: sub-roteador `portal` com `open|navigate|click|fill|eval|snapshot` (open/navigate → `portalOpen`; snapshot → GET; resto → POST respectivo), seguindo o tratamento de erro existente.

- [ ] **Step 4: Aplicar comandos no webview + reportar estado**

`useOrchestrationSync.ts`: nos comandos recebidos, para `portalOpen/Click/Fill/Eval`, achar o `PortalNode` (por `data.name`) e executar: `portalOpen`→`webview.loadURL(url)`; `portalClick`→`webview.executeJavaScript(clickScript(selector))`; `portalFill`→`executeJavaScript(fillScript(...))`; `portalEval`→`executeJavaScript(js)`. Usar um **registry** `Map<portalName, webviewEl>` que o `PortalNode` popula no mount (e limpa no unmount) — o hook lê dele. `PortalNode.tsx`: no `did-finish-load`, `executeJavaScript(snapshotScript())` → `window.orkestra.portalState({name,...})` (novo canal preload → IPC `portal:state` → main guarda por nome).

- [ ] **Step 5: Fiar no `main/index.ts`**

`ipcMain.on('portal:state', (_e, s) => portalStates.set(s.name, s))`; passar `getPortalState: (name)=>portalStates.get(name) ?? null` ao `OrchestrationServer`. Expor `window.orkestra.portalState` no preload.

- [ ] **Step 6: Testes + typecheck + build** — verdes; `out/orq/bin.js` emitido.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: orq portal (open/click/fill/eval/snapshot) + automacao do webview (Fase 9)"`

- [ ] **Step 8: CHECKPOINT VISUAL (humano)** — `npm run dev`. Criar um portal; na barra de URL, abrir `https://example.com` → a página renderiza no nó (pan/zoom movem o webview junto). Num terminal: `orq portal snapshot "Portal 1"` (imprime url/título/texto), `orq portal open "Portal 1" "https://news.ycombinator.com"` (navega), `orq portal click "Portal 1" "a.morelink"` (clica "More"), `orq portal eval "Portal 1" "document.title"` (executa). *(Humano; o implementer para no build. O webview real não roda em teste unitário.)*

---

## Notas de risco
- **`<webview>` é desencorajado pelo Electron** (mas funcional e estável) — escolhido pela integração natural com o canvas React Flow (BrowserView exigiria sincronizar posição/zoom manualmente). Migrar p/ `WebContentsView` é possível depois se necessário.
- **Automação fire-and-forget:** click/fill/eval não confirmam sucesso ao chamador; o `snapshot` (estado do último `did-finish-load`) é o feedback. Ações que não recarregam a página (SPA) podem exigir um `eval` explícito para inspecionar — documentar.
- **Estado só no `did-finish-load`:** SPAs que mudam sem recarregar não atualizam o snapshot automaticamente; `orq portal eval` cobre inspeção sob demanda (mas é fire-and-forget — um eval-com-retorno é refinamento futuro, exigiria round-trip renderer→main→orq).
- **Segurança:** o webview não tem `nodeintegration`; `eval` é confinado à página; valores serializados via `JSON.stringify`. O conteúdo web é tão confiável quanto uma aba de browser comum.
- **cwd/persistência:** o portal persiste `name`+`url` no `data` (o webview recarrega a url ao reabrir). O conteúdo/estado da sessão do webview não é serializado (só a url).
