# Conexões — Análise 360° (Maestri → Orkestra)

> Documento de pesquisa. Compara a funcionalidade **Conexões** do Maestri
> (fonte: https://www.themaestri.app/pt-br/docs/connections) com o estado atual
> do Orkestra, e propõe um caminho de evolução. Baseado na documentação real do
> Maestri e no código real do repositório `orkestra` (arquivos citados na seção 5).

---

## 1. Visão geral

No Maestri, **conexões são um recurso central**: ligam terminais e notas por meio
de "cabos animados com física" e habilitam **comunicação real entre agentes** — com
qualquer CLI (Claude Code, Codex, OpenCode, etc.). A conexão não é apenas um enfeite
visual; ela é o mecanismo que transforma vários terminais isolados em uma equipe que
troca instruções e respostas.

A promessa do Maestri tem duas camadas sobrepostas:

1. **Camada semântica** — o que a ligação *significa* (dois agentes podem conversar;
   um agente pode ler/editar uma nota; um agente pode dirigir um navegador).
2. **Camada visual/física** — como a ligação *aparece* no canvas (cordas que pendem
   e balançam, ou trilhos de "circuito" mais limpos), além dos afetos de inspeção
   (badge, popover, navegação até o outro lado).

O Orkestra já implementa boa parte da camada visual/física com fidelidade alta
(cordas com barriga por gravidade, balanço amortecido, estilo "circuito" ortogonal,
badge por aresta, ponto viajante na conexão entre agentes) e implementa a camada
semântica por um caminho **diferente** do Maestri: em vez de instalar uma "skill" no
ato da conexão, o Orkestra deixa a CLI `orq` sempre disponível e usa as arestas
apenas como fonte de **contexto** e como espelho topológico. Essa diferença de modelo
é o ponto mais importante deste documento (seções 4 e 5).

---

## 2. Como funciona

### 2.1 Comunicação entre agentes (terminal ↔ terminal)

No Maestri, ao conectar **dois terminais**, o app **instala uma "Maestri Agent Skill"
em cada um**. Essa skill dá ao agente a capacidade de *enviar instruções para* e
*receber respostas de* qualquer outro agente conectado. Como a skill opera no nível
de CLI, ela é **independente de agente** — Claude Code fala com Codex, OpenCode fala
com Claude, qualquer combinação. O usuário pode simplesmente instruir em linguagem
natural: *"Peça ao Revisor para analisar a implementação atual."*

Um detalhe operacional relevante do Maestri: **mantenha o agente receptor
desselecionado**. O Maestri só monitora terminais que não estão em foco. Quando o
receptor termina de gerar a resposta, o Maestri detecta a ociosidade e devolve a
resposta ao agente original. Se você selecionar o receptor, o Maestri entende que
*você* está no controle e para de monitorá-lo — e o agente que esperava nunca recebe
a resposta.

No Orkestra, a aresta entre dois terminais é classificada como do tipo `agent`
(ver `deriveEdgeKind`), recebe um **badge "Agentes"** e um **ponto viajante animado**
percorrendo o cabo. Já a mecânica de "um agente pergunta e espera a resposta do
outro" existe, mas é destravada por outro caminho (a CLI `orq ask ... --wait` sobre o
`AgentBus`, seção 4), não pelo ato de conectar.

### 2.2 Conexão terminal ↔ nota (contexto / caderno persistente)

No Maestri, um terminal pode ser conectado a uma **nota**. Uma vez conectado, o agente
pode **ler e editar** o conteúdo da nota pela CLI. A metáfora do Maestri é um "caderno
persistente" — um espaço compartilhado que sobrevive entre sessões e reinícios do
agente.

No Orkestra, a aresta terminal↔nota é do tipo `note` e ganha o badge **"Contexto"**.
O agente lê o conteúdo com `orq context` e escreve com `orq note write`
(que dispara o comando `updateNote`, aplicado de volta no store — ver seção 4).

### 2.3 Conexão terminal ↔ portal (automação de navegador)

No Maestri, um terminal pode ser conectado a um **portal** (um navegador embutido no
canvas). Conectado, o agente **controla o navegador programaticamente**: navega,
clica, preenche formulários, tira capturas de tela, lê o DOM — sem dependências
externas nem configuração.

No Orkestra, a aresta com um portal é do tipo `portal` (badge **"Portal"**), e a
automação existe como comandos `portalOpen/portalClick/portalFill/portalEval`
aplicados sobre o `<webview>` do portal (`orq portal open|click|fill|eval|snapshot`).

### 2.4 Encadeamento de notas (nota ↔ nota = cadeia/árvore)

No Maestri, notas podem ser conectadas a **outras notas**, formando uma **cadeia (ou
árvore)** — semelhante a um mapa mental. O ponto-chave da documentação: *"Você só
precisa conectar a nota de entrada ao agente — o agente pode então percorrer a cadeia
inteira"* e *"entende a hierarquia automaticamente"*. Ou seja, o Maestri faz uma
**travessia transitiva** da estrutura de notas.

No Orkestra, a aresta nota↔nota é do tipo `chain` (badge **"Cadeia"**). Porém a
resolução de contexto atual é **de um salto só** (vizinhos diretos) — a travessia
transitiva ainda não existe (gap detalhado na seção 5).

### 2.5 Badge com popover (inspeção)

No Maestri, o usuário clica no **badge de conexões de um nó** para abrir o **popover
de conexões**. Cada linha mostra o que está do outro lado (outro terminal, nota,
portal, ou até um nó **em outro andar**); clicar na linha **desloca o canvas até esse
elemento e o seleciona**, trocando de andar se preciso; o botão **×** remove a conexão
sem sair do popover.

No Orkestra há **dois artefatos parciais** que juntos ainda não cobrem esse popover:
- Um **badge por aresta** (no meio do cabo) que, ao clicar, abre um popover com um
  único botão **"Desconectar"** (`TypedEdge.tsx`).
- Um **contador de conexões por nó** (ícone `GitBranch` + número, apenas tooltip) na
  barra de ações do nó (`NodeToolbar.tsx`) — informa *quantas*, mas não *quais*, e não
  navega até o outro lado.

### 2.6 Estilo do cabo: corda vs. circuito

O Maestri oferece **dois estilos**, alternáveis **por conexão** via o popover:
- **Corda** (padrão) — cabos pendem e balançam com física; "vivos" ao arrastar/
  reorganizar.
- **Circuito** — conectores desenhados como **trilhos alinhados aos eixos**, com no
  máximo duas curvas de 90° arredondadas; sem física; mais limpo para canvases densos.

O Orkestra implementa **três** estilos — `corda` (padrão), `circuito` e `curva`
(bezier) — porém a escolha é **global** (uma preferência para o canvas inteiro,
persistida em `localStorage`), e não por conexão como no Maestri.

### 2.7 Criação de uma conexão

No Maestri há **dois métodos**: (1) selecionar um terminal e clicar na ferramenta
**Conexão** na barra de ferramentas — uma linha segue o cursor até clicar no segundo
nó; (2) **atalho de teclado `L`** com um terminal selecionado. Um mesmo terminal pode
ter **múltiplas conexões**.

No Orkestra, a criação é por **arrastar de um handle a outro** (React Flow):
saída na direita/base, entrada na esquerda/topo (`NodeHandles.tsx`). Não há (ainda)
a ferramenta de barra nem o atalho `L`.

---

## 3. Pontos interessantes / diferenciais

- **Conexão como "instalação de capacidade" (Maestri).** O gesto de conectar dois
  terminais *instala uma skill* em cada agente. A ligação é o interruptor que liga a
  comunicação. Isso é elegante porque o modelo mental do usuário ("liguei A em B, logo
  A e B conversam") casa exatamente com o comportamento.
- **Independência de agente.** Por operar no nível de CLI, a mesma skill serve a
  qualquer ferramenta — a interoperabilidade Claude↔Codex↔OpenCode "sai de graça". O
  Orkestra compartilha essa virtude: `orq` é uma CLI genérica, então também é
  agnóstica de agente.
- **A regra "receptor desselecionado".** É uma consequência engenhosa (e um pouco
  frágil) de o Maestri detectar a resposta por **ociosidade do terminal**: o foco do
  usuário desliga o monitoramento. É simples, mas exige que o usuário *saiba* dessa
  regra — um ponto de atrito documentado explicitamente. O Orkestra evita esse atrito
  ao rotear a resposta por `orq ask --wait` (bloqueio explícito no `AgentBus`,
  independente de foco).
- **Nota como caderno persistente.** Enquadrar a nota conectada como memória
  compartilhada que "sobrevive a noites de sono e reinícios do agente" é um
  enquadramento forte de produto — mais do que "anexar um arquivo".
- **Cadeia/árvore de notas com travessia automática.** Conectar só a "raiz" ao agente
  e deixá-lo percorrer a hierarquia é um recurso de organização de contexto poderoso
  (mapa mental navegável pelo agente).
- **Popover de inspeção com "teletransporte".** Clicar numa linha e o canvas voar até
  o outro lado (inclusive trocando de "andar") é ótima ergonomia para grafos grandes.
- **Estilo por conexão.** Deixar o usuário misturar cordas (expressivas) e circuitos
  (limpos) no mesmo canvas é um detalhe de acabamento que o Orkestra ainda não tem
  (só global).
- **Diferencial já do Orkestra:** o **ponto viajante** animado exclusivo da aresta
  `agent` (SMIL `animateMotion` reusando o mesmo path do cabo) e o **badge tipado**
  (Agentes/Cadeia/Contexto/Portal/Link) dão uma leitura semântica que o Maestri
  transmite mais pela cor/forma do que por rótulo textual.

---

## 4. Como seria o backend

### 4.1 Modelo de arestas

Uma aresta é minimamente `{ source, target }` mais um **tipo derivado dos tipos dos
nós nas pontas**. No Orkestra o tipo (`EdgeKind`) já é derivado assim:

| Pontas | `EdgeKind` | Badge |
|---|---|---|
| terminal + terminal | `agent` | Agentes |
| nota + nota | `chain` | Cadeia |
| terminal + nota | `note` | Contexto |
| qualquer + portal | `portal` | Portal |
| demais | `link` | Link |

Direção da aresta importa pouco para *contexto* (um bloco ligado em qualquer ponta é
legível), mas pode importar para *fluxo* (quem pergunta a quem). No modelo atual do
Orkestra a direção é registrada (handles de saída/entrada), mas o contexto é
resolvido de forma **não-direcional**.

### 4.2 Semântica por tipo

- **`agent` (terminal↔terminal):** habilita mensagens entre agentes. No Maestri isto
  é a "skill" instalada; no Orkestra é a CLI `orq ask "<nome>" "<prompt>"`, que
  resolve o terminal-alvo por **nome** e escreve no PTY dele. Com `--wait`, bloqueia
  até o agente ficar ocioso e devolve o output; com `--raw`, envia bytes crus
  (Ctrl+C, setas) para controlar TUIs; com `--batch`, envia o mesmo prompt a vários.
- **`note` (terminal↔nota):** leitura via `orq context` (o servidor reúne o conteúdo
  das notas ligadas) e escrita via `orq note write` (comando `updateNote` aplicado no
  store, convertendo markdown→HTML do editor TipTap).
- **`chain` (nota↔nota):** deveria permitir a um agente ligado à raiz **percorrer a
  árvore** de notas. Hoje o backend resolve apenas o vizinho direto (ver 4.3 e gap na
  seção 5).
- **`portal` (terminal↔portal):** automação do `<webview>` (open/click/fill/eval) e
  leitura de estado (`snapshot` → `{url,title,text}`).

### 4.3 Roteamento de mensagens/contexto entre nós conectados

Dois canais coexistem no Orkestra:

1. **Contexto (pull, sob demanda).** O agente chama `orq context`, que faz
   `GET /context?from=<NODE_ID>` no servidor de orquestração. O servidor lê o
   **espelho do canvas** (mirror), acha os nós **ligados diretamente** ao `from`
   (arestas onde `source===from` ou `target===from`), filtra os não-terminais com
   conteúdo, e devolve blocos rotulados `"[contexto — nota/arquivo/site: <nome>]\n
   <conteúdo>"`. É **sempre atual** (reflete conectar/desconectar/editar no momento da
   chamada) — por isso o Orkestra abandonou a antiga injeção de texto no PTY no ato da
   conexão.
2. **Mensagens (push, fire-and-forget ou bloqueante).** `orq ask` → `POST /ask` →
   `AgentBus.ask()`/`askWait()`. O `ask` escreve `prompt + '\n'` no PTY do alvo; o
   `askWait` usa `waitForIdle` (resolve quando o PTY fica `idleMs` sem output, ou no
   teto `timeoutMs`) para devolver a resposta. Note que esse roteamento é por **nome**,
   não pela existência de uma aresta — a conexão é dica visual/topológica, não
   pré-condição.

O modelo ideal (aproximando o Maestri) uniria os dois: a **aresta** seria a fonte de
verdade tanto para "quem pode falar com quem" quanto para "qual contexto é visível", e
a resolução de `chain` faria **BFS/DFS transitivo** a partir da nota-raiz ligada ao
terminal, montando a árvore inteira em vez de um salto.

---

## 5. Estado atual no Orkestra

Legenda: ✅ existe · 🟡 parcial · ❌ ausente. Todos os caminhos são reais.

### O que existe

**Tipagem e semântica de arestas**
- ✅ `src/renderer/src/edges/edgeKind.ts` — `EdgeKind = 'agent' | 'chain' | 'note' |
  'portal' | 'link'`; `deriveEdgeKind(a, b)` (terminal+terminal→`agent`,
  note+note→`chain`, terminal+note→`note`, qualquer+portal→`portal`, resto→`link`);
  `EDGE_KIND_META` com rótulos (Agentes/Cadeia/Contexto/Portal/Link).
- ✅ `src/renderer/src/store/canvasStore.ts` — `onConnect` (por volta da linha 867)
  deriva o `kind` dos tipos dos nós e cria a aresta `{ type: 'typed', data: { kind },
  className }`; `removeEdge` e `removeEdgesForNode`. Arestas entram no snapshot
  serializado (persistência).

**Render dos cabos**
- ✅ `src/renderer/src/components/TypedEdge.tsx` — desenha o cabo conforme o estilo
  (`corda`→`ropePath`, `circuito`→`getSmoothStepPath` com cantos de 8px, `curva`→
  `getBezierPath`); **ponto viajante** (`<animateMotion>`+`<mpath>`) exclusivo da
  aresta `agent`; **badge por aresta** com popover de **"Desconectar"** (`removeEdge`).
- ✅ `src/renderer/src/edges/edgeStyle.ts` — `EdgeStyle = 'curva' | 'circuito' |
  'corda'`, padrão `corda`, **preferência global** persistida em `localStorage`
  (`orkestra-edge-style`), com ciclo `nextEdgeStyle`.
- ✅ `src/renderer/src/edges/ropePath.ts` — bezier quadrático com **barriga por
  gravidade** (`ropeSag`, `MIN_SAG=24`, `SAG_FACTOR=0.25`).
- ✅ `src/renderer/src/edges/useRopeSwing.ts` + `ropeSwing.ts` — **balanço amortecido**
  ao arrastar (injeta energia proporcional ao movimento e decai a zero via `rAF`, sem
  loop perpétuo).
- ✅ `src/renderer/src/components/NodeHandles.tsx` — handles de entrada (esquerda/topo)
  e saída (direita/base) em todos os nós.

**Orquestração (o "cérebro" das conexões)**
- ✅ `src/main/orchestration/AgentBus.ts` — `track/read/ask/writeRaw/waitForIdle/
  clearAttention` + watchers `onAttention`/`onBusyChange`. É a plumbing de mensagens
  agente→agente e do sinal "gerando".
- ✅ `src/main/orchestration/OrchestrationServer.ts` — servidor HTTP local (auth por
  token, escopo de projeto via header `x-orkestra-project`): `GET /list` (mirror),
  `POST /note|/recruit|/dismiss|/connect|/portal/*`, `POST /ask` (com `wait`/`raw`),
  `GET /check|/portal|/context`. O **`/context`** (por volta das linhas 332–354)
  resolve os **vizinhos diretos** de `from` e monta os blocos de contexto.
- ✅ `src/shared/orchestration.ts` — `MirrorNode`/`MirrorEdge`/`CanvasMirror` e a união
  `OrchestrationCommand` (inclui `connect`, `updateNote`, `portal*`).
- ✅ `src/renderer/src/hooks/useOrchestrationSync.ts` — envia o mirror ao main quando
  muda e aplica comandos de volta (ex.: `connect` resolve terminais **por nome** e
  chama `onConnect`; `updateNote` resolve a nota pela aresta `from→nota`).
- ✅ `src/orq/orq.ts` — CLI `orq context | connect | ask | note write | portal ...`.
- 🟡 `src/renderer/src/context/contextBlock.ts` — `buildContextBlock` (legado, hoje
  coberto por testes) + `htmlToText` (via `DOMParser` inerte, defesa SEC-1). A injeção
  no ato da conexão foi **removida** de `Canvas.tsx` (`handleConnect` só chama
  `onConnect`; comentário nas linhas ~235–239) em favor do pull por `orq context`.

**Inspeção**
- 🟡 `src/renderer/src/components/NodeToolbar.tsx` — mostra um **contador** de conexões
  do nó (ícone `GitBranch` + número, só tooltip: "N conexão(ões) neste nó").
- 🟡 `src/renderer/src/components/TypedEdge.tsx` — popover por aresta, mas com **apenas**
  "Desconectar".

### Gaps (o que falta para paridade com o Maestri)

1. ❌ **Travessia transitiva de cadeia de notas.** O `/context`
   (`OrchestrationServer.ts`, ~338–343) só considera **vizinhos diretos**. Uma
   estrutura nota-raiz → nota-filha → nota-neta ligada a um terminal entrega ao agente
   **só a raiz**; as descendentes ficam de fora. O Maestri percorre a árvore inteira.
2. ❌ **Popover de inspeção por nó (estilo Maestri).** Não há um popover que **liste
   cada conexão**, diga **o que está do outro lado**, **navegue/selecione** o alvo ao
   clicar, e ofereça **×** por linha. Hoje: contador (sem lista) + desconectar por
   aresta.
3. ❌ **Estilo por conexão.** `edgeStyle` é **global** (`edgeStyle.ts` + store). O
   Maestri alterna corda/circuito **por conexão** pelo popover.
4. 🟡 **Conexão não é pré-condição de mensagem.** `orq ask` roteia por **nome**,
   independente de existir aresta. No Maestri, conectar é o que *instala a skill* e
   habilita a conversa. Vantagem do Orkestra: menos fricção; desvantagem: a aresta
   `agent` é "decorativa" quanto ao envio de mensagens (só o contexto usa a topologia).
5. ❌ **Ferramenta de conexão na barra + atalho `L`.** Criação só por arrastar handles
   (`NodeHandles.tsx`); não há a ferramenta "Conexão" nem o atalho `L`.
6. ❌ **Navegação entre "andares".** O popover do Maestri troca de andar ao navegar; o
   Orkestra organiza por **projetos**, não por andares dentro de um canvas — conceito
   ausente.

---

## 6. Melhorias sugeridas para o Orkestra

Priorizadas por **valor × esforço** (do maior retorno relativo para o menor).

### Prioridade alta (alto valor, baixo/médio esforço)

1. **Travessia transitiva da cadeia de notas no `/context`.**
   *Valor: alto · Esforço: baixo.* Trocar o conjunto de vizinhos diretos por um
   **BFS/DFS** a partir de `from`, incluindo notas alcançáveis por arestas `chain`
   (com guarda anti-ciclo e um limite de profundidade). Entrega o recurso "mapa mental
   navegável" quase de graça, reaproveitando o mirror que já existe. Local:
   `OrchestrationServer.ts` (`/context`).

2. **Popover de conexões por nó (inspeção real).**
   *Valor: alto · Esforço: médio.* Evoluir o contador do `NodeToolbar.tsx` para um
   popover que lista cada aresta do nó, com rótulo do outro lado (nome + tipo), botão
   **×** por linha (reusa `removeEdge`) e **clique = `fitView`/`setCenter` + seleção**
   do alvo. É a maior lacuna de ergonomia em canvases grandes.

3. **Ferramenta "Conexão" + atalho de teclado.**
   *Valor: médio-alto · Esforço: baixo-médio.* Adicionar um modo "conectar" (linha
   segue o cursor, clique no alvo completa) acionável pela barra do nó e por uma tecla
   (ex.: `C`/`L`). Melhora a descoberta — arrastar handle fino é pouco óbvio para novos
   usuários.

### Prioridade média

4. **Estilo por conexão.**
   *Valor: médio · Esforço: médio.* Guardar `style` opcional em `edge.data` e, no
   `TypedEdge.tsx`, preferir `data.style ?? edgeStyle` (mantendo o global como padrão).
   Adicionar a alternância ao popover da aresta. Acabamento visual que aproxima do
   Maestri sem reescrever nada.

5. **Tornar a aresta `agent` "carregada" (semântica de conversa).**
   *Valor: médio · Esforço: médio.* Sem abandonar o roteamento por nome, usar a
   topologia para (a) **restringir/priorizar** os alvos sugeridos de `orq ask` aos
   agentes conectados e (b) exibir no onboarding do agente "você está conectado a X, Y".
   Deixa a aresta `agent` significar algo além de decoração, mantendo a baixa fricção
   atual como fallback.

### Prioridade baixa (bom acabamento / maior esforço)

6. **Roteamento de resposta sem a regra "receptor desselecionado".**
   *Valor: médio · Esforço: alto.* O Orkestra já tem uma base melhor que a do Maestri
   (`waitForIdle` no `AgentBus`, independente de foco). Vale documentar/expor um fluxo
   "A pergunta a B e recebe a resposta de volta" que não dependa do foco do usuário —
   transformando o diferencial técnico já existente em recurso visível.

7. **Nota como caderno persistente (enquadramento de produto).**
   *Valor: baixo-médio · Esforço: baixo.* A capacidade já existe (`orq note write` +
   `orq context`); falta o **enquadramento** na UI (microcopy "caderno compartilhado
   do agente", indicação de que sobrevive a reinícios). Barato e melhora a percepção.

---

## 7. Referência

**Fonte primária (Maestri)**
- Documentação oficial: https://www.themaestri.app/pt-br/docs/connections
  (transcrição integral consultada em 2026-07-15) — seções: Comunicação entre
  agentes; Mantenha o receptor desselecionado; Criando uma conexão (barra / atalho
  `L`); Estilos (corda/circuito); Conexões agente-nota; agente-portal; Encadeamento de
  notas; Inspecionando conexões (badge + popover).

**Código do Orkestra (arquivos reais)**
- `src/renderer/src/edges/edgeKind.ts` — tipos de aresta e derivação.
- `src/renderer/src/edges/edgeStyle.ts` — estilos (corda/circuito/curva), global.
- `src/renderer/src/edges/ropePath.ts` — geometria da corda (barriga por gravidade).
- `src/renderer/src/edges/useRopeSwing.ts`, `ropeSwing.ts` — balanço físico amortecido.
- `src/renderer/src/components/TypedEdge.tsx` — render do cabo, ponto viajante, badge.
- `src/renderer/src/components/NodeHandles.tsx` — handles de entrada/saída.
- `src/renderer/src/components/NodeToolbar.tsx` — contador de conexões por nó.
- `src/renderer/src/components/Canvas.tsx` — `handleConnect` (sem injeção no ato).
- `src/renderer/src/store/canvasStore.ts` — `onConnect`, `removeEdge`,
  `removeEdgesForNode`, persistência.
- `src/renderer/src/hooks/useOrchestrationSync.ts` — mirror ↔ main; comando `connect`.
- `src/renderer/src/context/contextBlock.ts` — `buildContextBlock`, `htmlToText`.
- `src/shared/orchestration.ts` — `CanvasMirror`, `MirrorEdge`, `OrchestrationCommand`.
- `src/shared/roles.ts` — papéis (Líder/Dev/Revisor/Testador) usados nos terminais.
- `src/main/orchestration/AgentBus.ts` — `ask`/`waitForIdle`/atenção/busy.
- `src/main/orchestration/OrchestrationServer.ts` — HTTP; `/context`, `/ask`, `/connect`.
- `src/orq/orq.ts` — CLI `orq context | connect | ask | note write | portal ...`.
