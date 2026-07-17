# Portais — Análise 360° (Maestri → Orkestra)

> Documento de pesquisa. Compara a funcionalidade **Portais** (navegador embutido e dirigível no
> canvas) da referência **Maestri** (`themaestri.app`) com a implementação atual no **Orkestra**.
> Baseado na documentação oficial do Maestri e no código-fonte real do repositório (caminhos citados
> na seção 5). Fonte da doc: <https://www.themaestri.app/pt-br/docs/portals> (consultada em 2026-07-15).

---

## 1. Visão geral

Um **Portal** é uma "janela de navegador embutida que vive diretamente no canvas". Em vez de o
usuário sair do app para abrir um navegador, o site fica ali, como mais um nó do canvas, ao lado dos
terminais de agentes, notas e arquivos. O portal serve a três propósitos:

1. **Navegar** — abrir sites, revisar uma página, acompanhar um dashboard, visualizar arquivos.
2. **Compartilhar sessão** — vários portais podem apontar para o mesmo serviço com contas diferentes
   (sessões isoladas) ou compartilhar a mesma sessão logada entre si (portais "linkados").
3. **Ser dirigido por um agente de IA** — quando um agente é conectado a um portal, ele controla a
   página programaticamente (navegar, clicar, preencher, inspecionar), sem depender de servidores MCP
   ou ferramentas externas.

A ideia central é fechar o loop "agente + web" dentro do próprio canvas: o agente não só raciocina
sobre texto, mas também **age** sobre páginas reais (preencher um formulário, extrair o conteúdo de
um site, clicar num botão) e o resultado fica visível para o humano no mesmo espaço de trabalho.

No Maestri, o portal é apresentado como um recurso "plug and play": não exige configuração de
servidores externos nem dependências — o agente descobre e usa os comandos automaticamente. O
Orkestra segue exatamente essa filosofia: injeta no *system prompt* de cada agente um texto de
*onboarding* que ensina os comandos `orq portal` (ver `src/main/orchestration/installOrq.ts`).

---

## 2. Como funciona

### 2.1. Webview dirigível

Cada portal é um navegador de verdade renderizado dentro do nó do canvas. O agente (ou o humano)
pode navegar por URL, e um agente conectado pode automatizar a página.

- **No Maestri:** cada portal "roda uma instância isolada do WebKit (Safari) com seu próprio
  armazenamento". Suporte a Chrome está "planejado para o futuro". A criação é feita pelo botão
  **Portal** na barra de ferramentas (ícone de globo) ou pela tecla **P**, digitando uma URL.
- **No Orkestra:** o portal é a tag `<webview>` do Electron (Chromium), hospedada pelo componente
  `PortalNode`. O nó tem uma barra de URL própria e um botão "ir" para navegar manualmente.

### 2.2. Sessões isoladas por portal (multi-conta)

Por padrão, cada portal tem **armazenamento próprio** (cookies, localStorage, sessão de login
separados). Isso permite o cenário destacado na "dica" do Maestri:

> "Como portais rodam instâncias isoladas de navegador, você pode ter múltiplas sessões logadas no
> mesmo serviço simultaneamente."

Ou seja: dois portais apontando para o mesmo Gmail/GitHub/etc, cada um com uma conta diferente,
lado a lado. No Orkestra isso é implementado com **partições de sessão persistentes** do Electron:
cada portal recebe uma partição `persist:portal-<id>` própria (ver `partitionForPortal`).

### 2.3. Portais linkáveis que compartilham sessão

Portais podem ser **conectados/linkados** para compartilhar a mesma sessão de armazenamento — assim
um portal enxerga os cookies e o estado de autenticação do outro. Caso de uso típico: logar uma vez
num portal e reaproveitar essa sessão em outro portal que abre uma página interna do mesmo serviço.

- **No Maestri:** usa-se "a ferramenta de conexão para vincular portais".
- **No Orkestra:** o compartilhamento é feito pelo **seletor de sessão** no cabeçalho do nó
  (`PortalFlowNode`): a opção "Sessão isolada" usa a partição própria; "Compartilhar: <Portal>" faz
  o portal usar a **mesma partição** de outro portal. Internamente isso grava `data.linkedTo` com o
  `nodeId` do portal-fonte, e `partitionForPortal` retorna a partição do fonte em vez da própria.

### 2.4. O agente controla o portal via CLI

Quando um agente precisa dirigir a página, ele usa a CLI de orquestração. No Maestri é o binário
`maestri`; no Orkestra é o `orq`. A doc do Maestri lista as capacidades do agente:

- **Clicar, digitar e rolar** — interagir com elementos.
- **Navegar** — URLs, voltar, atualizar.
- **Tirar screenshots** — visualizar páginas.
- **Executar JavaScript** — rodar scripts customizados.
- **Ler o DOM** — inspecionar a estrutura.
- **Ver o console do navegador** — capturar erros.

Além disso, no Maestri "agentes podem criar novos portais independentemente" e "conectar agentes e
portais permite controle encadeado".

No Orkestra, o conjunto equivalente de comandos é (ver `src/orq/orq.ts`):

```
orq portal open|navigate "<nome>" "<url>"     # navega o portal para uma URL
orq portal click "<nome>" "<seletor>"          # clica no primeiro elemento que casa o seletor CSS
orq portal fill "<nome>" "<seletor>" "<texto>" # foca o campo e escreve o texto
orq portal eval "<nome>" "<js>"                # executa JavaScript arbitrário na página
orq portal snapshot "<nome>"                   # devolve url + title + texto visível da página
```

O fluxo ponta a ponta no Orkestra é:

1. O agente roda `orq portal ...` dentro do seu terminal.
2. O `orq` faz um HTTP POST/GET para o servidor de orquestração local
   (`127.0.0.1:$ORKESTRA_PORT`, autenticado por token).
3. O servidor (`OrchestrationServer`) valida o corpo e emite um comando (`portalOpen`,
   `portalClick`, `portalFill`, `portalEval`) para o renderer via IPC — ou, no caso do `snapshot`,
   responde com o último estado guardado do portal.
4. No renderer, o hook `useOrchestrationSync` resolve o portal pelo **nome** → `nodeId` → elemento
   `<webview>` (via `portalRegistry`) e executa a ação (`loadURL`, `executeJavaScript(...)`).

Importante: no Orkestra a automação de portal é **fire-and-forget** — `open/click/fill/eval` não
confirmam sucesso; o feedback do agente é rodar `orq portal snapshot` depois para inspecionar o
estado resultante.

---

## 3. Pontos interessantes / diferenciais

- **Web como cidadã de primeira classe do canvas.** O site não é um link nem uma captura estática:
  é um navegador vivo, ao lado do agente, que ambos (humano e IA) enxergam e manipulam. Isso torna
  tangível o resultado da automação — o humano vê a página mudar enquanto o agente age.

- **Multi-conta simultânea sem malabarismo de perfis.** Sessões isoladas por portal resolvem, de
  graça, um problema real (várias contas do mesmo serviço abertas ao mesmo tempo) que num navegador
  comum exigiria perfis separados ou janelas anônimas.

- **Sessões compartilháveis sob demanda.** O par "isolado por padrão / compartilhado quando linkado"
  cobre os dois cenários opostos (multi-conta vs. reaproveitar login) com um único controle.

- **Automação sem MCP.** O Maestri vende o portal como "plug and play, sem dependências externas nem
  servidores MCP". O Orkestra entrega o mesmo espírito: o agente ganha a habilidade de dirigir a web
  só por estar num terminal do Orkestra, com o *onboarding* injetado automaticamente — não é preciso
  configurar Playwright, Puppeteer, um servidor MCP de browser, nem chaves de API.

- **Controle encadeado (agente → agente → portal).** Como um agente pode acionar outro (`orq ask`) e
  qualquer agente pode dirigir portais, dá para montar pipelines onde um agente pesquisa na web e
  passa o resultado a outro — tudo dentro do mesmo canvas.

- **`eval` como escape hatch.** O comando `orq portal eval` executa JavaScript arbitrário na página,
  o que cobre o que `click`/`fill` não alcançam (ler atributos, disparar eventos customizados,
  extrair dados estruturados via `querySelectorAll`, etc.).

---

## 4. Como seria o backend

Esta seção descreve o desenho técnico de um recurso de portais em Electron — em parte é o que o
Orkestra já faz, em parte é o alvo ideal.

### 4.1. Superfície de renderização: `<webview>` vs. `BrowserView`

Há duas formas de embutir um navegador em Electron:

- **Tag `<webview>`** (a escolha atual do Orkestra): um elemento HTML que vira um `WebContents`
  isolado, hospedado dentro do fluxo do DOM do renderer. Vantagem: posiciona-se naturalmente dentro
  do nó do React Flow (segue zoom/pan/resize como qualquer `<div>`). Desvantagem: `<webview>` é uma
  API mais frágil e menos performática, e o Electron desencoraja seu uso para casos pesados.
- **`BrowserView` / `WebContentsView`:** um `WebContents` gerenciado pelo processo *main*, sobreposto
  à janela por coordenadas absolutas. Mais robusto e performático, porém precisa de código extra para
  acompanhar a posição/zoom do nó no canvas (o canvas transforma coordenadas; a view teria que ser
  reposicionada a cada pan/zoom). É o caminho típico quando se quer CDP completo e muitos portais.

### 4.2. Isolamento de sessão por partição

O isolamento multi-conta se apoia nas **partições de sessão** do Electron. Uma partição com prefixo
`persist:` mantém cookies/storage em disco entre reinícios; sem o prefixo, a sessão é efêmera (em
memória). Cada portal recebe uma partição estável derivada do seu id; portais linkados reusam a
partição do fonte. No Orkestra: `persist:portal-<linkedTo || nodeId>` (ver `portalPartition.ts`).

### 4.3. Automação: `executeJavaScript` vs. CDP

Há dois níveis de automação:

- **`executeJavaScript(source)`** (o que o Orkestra usa): injeta uma string de JS no contexto da
  página e resolve com o valor de retorno. Simples, sem dependências. Cobre clicar, preencher e
  ler o DOM com `document.querySelector`. Limitação: roda no *contexto da página*, então não simula
  entrada de teclado/mouse "de verdade" (o que alguns sites com detecção anti-bot exigem), e não dá
  acesso a screenshots, rede ou console.
- **CDP (Chrome DevTools Protocol) / `debugger` API:** o protocolo de baixo nível que expõe
  `Input.dispatchMouseEvent`, `Page.captureScreenshot`, `Runtime.consoleAPICalled`,
  `Network.*`, etc. É o que permite as capacidades que o Maestri anuncia — screenshots, ler console,
  rolar, cliques por coordenada. Em Electron, acessa-se via `webContents.debugger.attach()` +
  `sendCommand(...)`, ou `webContents.capturePage()` para screenshots.

### 4.4. Ponte IPC (navegar/clicar/preencher a partir da CLI)

O caminho de um comando do agente até a página, no desenho do Orkestra:

```
agente (terminal) → `orq portal ...`
   → HTTP (token + escopo de projeto) → OrchestrationServer (processo main)
     → IPC 'orchestration:command' → renderer
       → resolve nome → nodeId → <webview> (portalRegistry)
         → webview.loadURL / webview.executeJavaScript
```

O caminho de volta (estado da página → agente): a cada `did-finish-load`, o `PortalNode` captura
`{url, title, text}` e envia ao *main* por IPC (`portal:state`); o *main* guarda por nome; o
`orq portal snapshot` lê esse estado via `GET /portal?name=...`.

### 4.5. Endurecimento de segurança (obrigatório, pois o portal carrega a web aberta)

Um portal carrega conteúdo hostil arbitrário, então o backend precisa de várias barreiras:

- **Validação de esquema de URL:** só `http`/`https`. Bloquear `file://` (leitura de arquivos
  locais via snapshot), `javascript:` e `data:` (execução de script no contexto autenticado).
- **`will-attach-webview`:** remover `preload`, forçar `nodeIntegration:false` e
  `contextIsolation:true` em todo guest, mesmo que um renderer comprometido tente injetar outro.
- **Handler de permissões:** negar por padrão câmera, microfone, geolocalização, notificações,
  MIDI, HID, serial, USB, Bluetooth e detecção de ociosidade em todas as sessões (inclusive as
  partições de portal).
- **Sanitização dos scripts injetados:** todo valor (seletor/texto) passa por `JSON.stringify`,
  nunca concatenação crua, para não escapar do literal de string e virar injeção.
- **Escopo por projeto:** um agente de um projeto que não é o ativo não pode ler nem dirigir os
  portais exibidos (resposta 409).

---

## 5. Estado atual no Orkestra

O Orkestra já tem uma implementação funcional e razoavelmente completa de portais. Mapa dos arquivos
reais:

### 5.1. Renderer (UI e execução)

- **`src/renderer/src/components/PortalNode.tsx`** — hospeda o `<webview>` em si. Registra o
  elemento no `portalRegistry` ao montar (chaveado por `nodeId`) e, a cada `did-finish-load`, captura
  `{url, title, text}` com `snapshotScript()` e reporta ao *main* via `window.orkestra.portalState`
  (canal IPC `portal:state`). Recebe a `partition` já calculada pelo pai e a repassa direto ao
  atributo do `<webview>`.
- **`src/renderer/src/components/PortalFlowNode.tsx`** — o nó React Flow. Contém: cabeçalho com nome
  editável, **seletor de sessão** ("Sessão isolada" vs. "Compartilhar: <Portal>", que grava
  `linkedTo`), barra de URL com botão "ir" (navega só ao confirmar, não a cada tecla),
  `NodeResizer`, e o `PortalNode` com `key={partition}` (trocar a sessão remonta o webview).
- **`src/renderer/src/portalPartition.ts`** — `partitionForPortal(nodeId, linkedTo)` →
  `persist:portal-${linkedTo || nodeId}`. É o coração do isolamento/compartilhamento de sessão.
- **`src/renderer/src/portalRegistry.ts`** — `Map<nodeId, WebviewTag>`; ponte entre o nome do portal
  e o elemento `<webview>` vivo, já que o webview só existe no renderer.
- **`src/renderer/src/hooks/useOrchestrationSync.ts`** — aplica os comandos vindos do agente:
  `portalOpen` (com guarda `isSafePortalUrl`), `portalClick`, `portalFill`, `portalEval`. Resolve o
  portal por nome via `resolvePortalWebview`. Toda automação é `try/catch` silencioso (best-effort).
- **`src/renderer/src/edges/edgeKind.ts`** — define o tipo de aresta `'portal'` (qualquer conexão
  envolvendo um nó portal), com rótulo e título próprios.
- **Criação do nó:** `addPortalNode` no `src/renderer/src/store/canvasStore.ts` (id
  `portal-<uuid>`, nome sequencial "Portal N"); acionável pela ferramenta "Portal" no
  `src/renderer/src/components/Topbar.tsx`, pelo menu de contexto ("Novo portal aqui") e atalho no
  `src/renderer/src/components/Canvas.tsx`, e pelo comando "Criar Portal" no
  `src/renderer/src/palette/paletteCommands.ts`.

### 5.2. Compartilhado (contratos puros e seguros)

- **`src/shared/portalUrl.ts`** (+ `.test.ts`) — `isSafePortalUrl`: aceita `http`/`https` e URLs sem
  esquema; bloqueia `file://`, `javascript:`, `data:` e ofuscação por caracteres de controle
  (mitigação **SEC-3**).
- **`src/shared/portalScripts.ts`** (+ `.test.ts`) — geradores puros de `clickScript`, `fillScript`,
  `snapshotScript`; todos os valores injetados passam por `JSON.stringify` (anti-injeção). O
  `snapshotScript` limita o texto a 4000 caracteres.
- **`src/shared/orchestration.ts`** — tipos: união `OrchestrationCommand` (inclui `portalOpen`,
  `portalClick`, `portalFill`, `portalEval`) e a interface `PortalState` (`{url, title, text}`).

### 5.3. Main (servidor e endurecimento)

- **`src/main/index.ts`** — habilita `webviewTag: true`; `will-attach-webview` remove `preload` e
  força `nodeIntegration:false`/`contextIsolation:true`; `hardenSession` nega o conjunto sensível de
  permissões em toda sessão (inclusive partições de portal — **SEC-6**); mantém o `Map`
  `portalStates` (nome → estado) alimentado pelo IPC `portal:state` e servido em `GET /portal`.
- **`src/main/orchestration/OrchestrationServer.ts`** — endpoints `POST /portal/open`,
  `/portal/click`, `/portal/fill`, `/portal/eval` (com validação de tipos → 400) e
  `GET /portal?name=` (404 se não houver estado). Aplica escopo de projeto (409) antes de qualquer
  rota, inclusive nas leituras.
- **`src/main/orchestration/installOrq.ts`** — o *onboarding* injetado no *system prompt* de cada
  agente menciona explicitamente `orq portal navigate/click/fill/snapshot`, tornando o recurso
  autodescoberto pelo agente.

### 5.4. CLI

- **`src/orq/orq.ts`** (+ `orq.test.ts`) — o comando `portal` com subcomandos `open`/`navigate`,
  `click`, `fill`, `eval`, `snapshot`, além do texto de ajuda que documenta o modelo
  fire-and-forget e aponta o `snapshot` como forma de inspecionar o resultado.

### 5.5. Gaps observados (frente ao que o Maestri anuncia)

1. **Sem screenshot.** O Maestri lista "tirar screenshots"; o Orkestra só devolve texto
   (`snapshot` = url/title/innerText). Um agente não "vê" a página visualmente.
2. **Sem leitura de console nem de rede.** O Maestri lista "ver console do navegador"; o Orkestra
   não expõe console nem requisições de rede ao agente.
3. **Sem `scroll`, `voltar`, `atualizar` pela CLI.** O Maestri cita rolar e navegação (voltar,
   atualizar); no Orkestra o agente só tem `open/navigate` (URL direta), `click`, `fill`, `eval`.
   Rolar/voltar são possíveis via `eval` (`window.scrollBy`, `history.back()`), mas não há comando
   dedicado.
4. **Agente não cria portais.** No Maestri "agentes podem criar novos portais independentemente";
   no Orkestra `orq portal open` exige um portal **já existente** com aquele nome — não há
   `orq portal create`.
5. **Automação é fire-and-forget.** `click`/`fill` executam `clickScript`/`fillScript`, que retornam
   um booleano de sucesso, mas esse retorno **não é propagado** ao agente (o `.catch()` engole tudo).
   O agente precisa de um `snapshot` extra para inferir se a ação funcionou — mais lento e ambíguo.
6. **Sem gate por conexão.** No Maestri, o agente controla o portal ao qual está **conectado**. No
   Orkestra, `orq portal <ação> "<nome>"` resolve o portal só pelo **nome**, independentemente de
   haver uma aresta ligando o terminal ao portal — a aresta `'portal'` existe visualmente, mas não
   restringe quem pode dirigir o quê.
7. **Engine diferente.** Maestri usa WebKit (Safari) isolado; Orkestra usa `<webview>` do Chromium
   (Electron). Não é um gap funcional, mas muda comportamento/compatibilidade de sites e sessões.
8. **Estado do portal é global por nome no *main*.** O `portalStates` é um `Map` chaveado só por
   nome (não por projeto). O escopo de projeto (409) protege o acesso, mas entradas de um projeto
   anterior podem ficar residuais no mapa até serem sobrescritas.

---

## 6. Melhorias sugeridas para o Orkestra

Priorizadas por **valor × esforço** (começando pelo maior retorno com menor custo).

### Prioridade alta (alto valor, baixo/médio esforço)

- **[A1] `snapshot` com feedback de sucesso em `click`/`fill`.** Propagar o booleano que
  `clickScript`/`fillScript` já retornam de volta ao agente (mudar de fire-and-forget para retornar
  `ok:true/false`, como o `ask --wait` faz). Elimina a rodada extra de `snapshot` e remove a
  ambiguidade "cliquei em nada". *Baixo esforço:* o valor de retorno já existe, falta só encaminhá-lo
  pela ponte IPC/HTTP.
- **[A2] Comandos `orq portal back|forward|reload|scroll`.** Cobrir a navegação que o Maestri
  anuncia. `back/forward/reload` mapeiam direto para métodos do `<webview>`; `scroll` pode ser
  `executeJavaScript('window.scrollBy(...)')`. *Baixo esforço,* alto ganho de paridade.
- **[A3] `orq portal snapshot --html` (ou `--dom`).** Além do `innerText`, oferecer o HTML/estrutura
  (talvez um resumo dos elementos interativos com seus seletores). Hoje o agente "lê texto" mas tem
  que adivinhar seletores para `click`/`fill`. Expor o DOM fecha o loop "ler → agir". *Médio esforço.*

### Prioridade média (alto valor, esforço maior)

- **[B1] Screenshot para o agente (`orq portal screenshot`).** Usar `webContents.capturePage()` e
  devolver a imagem (arquivo temporário ou base64) para o agente multimodal "ver" a página. É a
  capacidade mais visível que falta frente ao Maestri. *Médio/alto esforço* (captura + transporte da
  imagem pela ponte, que hoje só carrega texto/JSON pequeno).
- **[B2] `orq portal create "<nome>" "<url>"`.** Deixar o agente criar portais sozinho (o Maestri
  permite). Reaproveita `addPortalNode`; some com o pré-requisito "o humano precisa criar o portal
  antes". *Médio esforço.*
- **[B3] Leitura de console/erros (`orq portal console`).** Assinar `console-message` do `<webview>`,
  bufferizar por portal e expor ao agente — útil para depurar páginas/apps. *Médio esforço.*

### Prioridade a avaliar (decisão de produto / maior esforço)

- **[C1] Gate por conexão.** Opcionalmente exigir que o terminal esteja conectado (aresta) ao portal
  para dirigi-lo, alinhando com o modelo mental do Maestri e reduzindo o risco de um agente mexer no
  portal errado. Trade-off: mais fricção; talvez melhor como *modo* configurável do que padrão.
- **[C2] Entrada "real" via CDP (cliques por coordenada, teclado).** Para sites com detecção
  anti-bot que ignoram `.click()`/`dispatchEvent`, anexar o `debugger` e usar
  `Input.dispatchMouseEvent`/`dispatchKeyEvent`. Aumenta muito a robustez, mas é o item de maior
  complexidade e manutenção. *Alto esforço.*
- **[C3] Escopar `portalStates` por projeto.** Chavear o estado por `(projectId, nome)` e limpar ao
  trocar de projeto, eliminando o resíduo cross-project descrito no gap 8. *Baixo/médio esforço,*
  valor sobretudo de robustez.
- **[C4] Indicador visual de "agente dirigindo".** Realce no nó do portal enquanto um comando está
  sendo aplicado (coerente com o `border-beam` de "gerando" já usado nos terminais), para o humano
  perceber a automação em curso. *Baixo esforço,* ganho de UX.

---

## 7. Referência

**Documentação Maestri**
- Portais — <https://www.themaestri.app/pt-br/docs/portals> (consultada em 2026-07-15).

**Código-fonte Orkestra (caminhos reais)**
- `src/renderer/src/components/PortalNode.tsx` — hospeda o `<webview>`, registry, report de estado.
- `src/renderer/src/components/PortalFlowNode.tsx` — nó do canvas, barra de URL, seletor de sessão.
- `src/renderer/src/portalPartition.ts` — cálculo da partição de sessão (isolar/compartilhar).
- `src/renderer/src/portalRegistry.ts` — mapa `nodeId → <webview>`.
- `src/renderer/src/hooks/useOrchestrationSync.ts` — aplica os comandos de portal no webview.
- `src/renderer/src/edges/edgeKind.ts` — tipo de aresta `'portal'`.
- `src/shared/portalUrl.ts` (+ `.test.ts`) — `isSafePortalUrl` (SEC-3).
- `src/shared/portalScripts.ts` (+ `.test.ts`) — `clickScript`/`fillScript`/`snapshotScript`.
- `src/shared/orchestration.ts` — tipos `OrchestrationCommand` e `PortalState`.
- `src/orq/orq.ts` (+ `orq.test.ts`) — CLI `orq portal open|navigate|click|fill|eval|snapshot`.
- `src/main/orchestration/OrchestrationServer.ts` — endpoints HTTP de portal + escopo de projeto.
- `src/main/orchestration/installOrq.ts` — onboarding do agente com os comandos de portal.
- `src/main/index.ts` — `webviewTag`, `will-attach-webview`, `hardenSession` (SEC-6), `portalStates`.
- `src/preload/index.ts` — canal IPC `portal:state`.
