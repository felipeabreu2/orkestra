# Plano de Implementação — Conexões
> **Origem:** `docs/analise-maestri-360/conexoes.md` · **Status:** proposto · **Onda(s):** 1–2 (Onda 3 referenciada)

## 1. Objetivo & valor

As **Conexões** são as arestas tipadas do canvas (`agent` · `chain` · `note` · `portal` · `link`) e o mecanismo que transforma vários terminais isolados numa equipe: elas alimentam a resolução de **contexto** (`orq context`) e servem de espelho topológico para a orquestração. O Orkestra já tem a camada visual/física com fidelidade alta (corda com barriga por gravidade, balanço amortecido, circuito ortogonal, badge tipado, **ponto viajante** SMIL exclusivo da aresta `agent`) e a camada semântica por um caminho próprio (CLI `orq` sempre disponível + pull de contexto pelo espelho).

Este plano fecha os gaps de **maior valor por esforço**:

1. **Travessia transitiva da cadeia de notas** no `/context` — hoje o servidor resolve **1 salto só** (vizinhos diretos). Uma cadeia nota-raiz → filha → neta ligada a um terminal entrega ao agente **só a raiz**. Entregar a árvore inteira (BFS/DFS com guarda anti-ciclo) destrava o "mapa mental navegável pelo agente" quase de graça, reaproveitando o espelho que já existe. **É o item de maior valor e é TDD puro** (função de travessia sobre um grafo em memória).
2. **Popover de inspeção por nó** — evoluir o contador do `NodeToolbar` (que diz *quantas*, não *quais*) para um popover que lista cada conexão, o que está do outro lado, com **×** por linha e **clique = navegar/selecionar** o alvo.
3. **Estilo por conexão** e **aresta `agent` "carregada"** (topologia para priorizar `orq ask`) — acabamento e semântica, Onda 2.

A cadeia de notas como **memória compartilhada persistente** (enquadramento de produto "caderno do agente") é **Onda 3** e pertence ao plano de **Notas** (`docs/analise-maestri-360/notas.md` → `docs/planejamento/notas.md`) — aqui só entregamos a *travessia estrutural* que ela vai reusar; não duplicamos o enquadramento.

## 2. Estado atual no código (verificado)

Verificado lendo os arquivos reais (não apenas o doc de origem). Todos os caminhos abaixo foram conferidos; os apontamentos de linha do doc de origem batem com o código atual.

| Arquivo real | O que já faz | Relevância |
|---|---|---|
| `src/renderer/src/edges/edgeKind.ts` | `EdgeKind`; `deriveEdgeKind(a,b)` (terminal+terminal→`agent`, note+note→`chain`, terminal+note→`note`, `*`+portal→`portal`, resto→`link`); `EDGE_KIND_META` (rótulos Agentes/Cadeia/Contexto/Portal/Link). Simétrico via `Set`. | Fonte da tipagem; reusável para rotular linhas do popover (T3). |
| `src/renderer/src/store/canvasStore.ts` | `onConnect` (L867–877) deriva `kind` dos **tipos dos nós** (não da connection) → cria `{ type:'typed', data:{ kind }, className:'ork-edge--<kind>' }`; `removeEdge` (L921); `removeEdgesForNode` (L922); rehidratação de arestas (~L990–1010). | Alvo de T4 (guardar `data.style`); `removeEdge` reusado por T3. |
| `src/renderer/src/components/TypedEdge.tsx` | Desenha o cabo por `edgeStyle` **global** (`corda`→`ropePath`, `circuito`→`getSmoothStepPath` r=8, `curva`→`getBezierPath`); **ponto viajante** `<animateMotion>`+`<mpath href="#id">` **só** para `kind==='agent'` (L47–53); **badge por aresta** com popover de **um** botão "Desconectar" (L64–76). | Alvo de T4 (preferir `data.style ?? global`) e do botão de estilo no popover. |
| `src/renderer/src/edges/edgeStyle.ts` | `EdgeStyle='curva'|'circuito'|'corda'`; padrão `corda`; **preferência global** em `localStorage` (`orkestra-edge-style`); `nextEdgeStyle`. | Alvo de T4 (adicionar `resolveEdgeStyle(dataStyle, global)`). |
| `src/renderer/src/edges/ropePath.ts` · `useRopeSwing.ts` · `ropeSwing.ts` | Geometria da corda (barriga por gravidade) e balanço amortecido via rAF. | Inalterado; contexto físico já pronto. |
| `src/renderer/src/components/NodeToolbar.tsx` | `linkCount = edges.filter(source|target===node.id).length`; ícone `GitBranch` + número, **só tooltip** ("N conexão(ões)"). | Alvo de T3 (virar popover de inspeção real). |
| `src/renderer/src/components/NodeHandles.tsx` | Handles entrada (esq/topo) / saída (dir/base). | Criação por arrastar; fora do escopo deste plano. |
| `src/main/orchestration/OrchestrationServer.ts` | HTTP local (auth por token constante; escopo de projeto por `x-orkestra-project`→409). **`GET /context`** (L332–354): lê `getMirror()`, monta `linked` com **vizinhos diretos** (`e.source===from` ou `e.target===from`), filtra `n.type!=='terminal'` **e** `content` não-vazio, formata `"[contexto — <label>: <name>]\n<content>"`. | **Coração do T1/T2**: hoje é 1-salto e a lógica está **inline**. Extrair p/ função pura e trocar por BFS transitivo. |
| `src/shared/orchestration.ts` | `MirrorNode {id,type,name,content?,role?,preset?,monitor?}`; `MirrorEdge {source,target}` (**sem `kind`**); `CanvasMirror`; união `OrchestrationCommand`. | `MirrorEdge` **não carrega `kind`** → a travessia deriva "chain" de `node.type==='note'` nas duas pontas (sem importar renderer no main). |
| `src/renderer/src/hooks/useOrchestrationSync.ts` | Monta o mirror (nome/`content` legível por tipo: nota→`htmlToText`, file→path, portal→url) e envia ao main; aplica comandos de volta (`connect` resolve terminais **por nome**→`onConnect`; `updateNote` resolve a nota pela aresta `from→nota`). Arestas viram `{source,target}` (L60). | Produtor do espelho que T1 consome; ponto onde `MirrorEdge.kind` entraria se um dia for necessário (não é para T1). |
| `src/orq/orq.ts` | CLI: `context` faz `GET /context?from=$ORKESTRA_NODE_ID`; `ask` (`--wait/--raw/--batch`); `note write --to`; `connect`; `portal *`. Uso/ajuda no rodapé. | `context` é transparente à mudança do T1 (mesma resposta `{context}`); alvo do T5 (priorizar alvos de `ask`). |
| `src/main/orchestration/AgentBus.ts` | `track/read/ask/writeRaw/waitForIdle/clearAttention` + `onAttention/onBusyChange`. | Plumbing de mensagens; base do T5 (fallback por nome mantido). |
| `src/main/index.ts` | Instancia `new OrchestrationServer({ getMirror: () => mirror, … })` (L76–77). | Onde o `/context` roda de fato; nenhuma mudança de fiação para T1. |
| `src/renderer/src/context/contextBlock.ts` | `buildContextBlock` (legado, testado) + `htmlToText` (via `DOMParser` inerte, SEC-1). | `htmlToText` já é usado no produtor do mirror; a formatação do `/context` é análoga mas vive no main. |

**Testes existentes relevantes:** `src/main/orchestration/OrchestrationServer.test.ts` (cobre `/list`, `/note`, `/ask`, `/recruit`, `/connect`, `/portal*`, escopo de projeto — **mas NÃO tem nenhum teste de `/context`**; o helper `makeServer` já aceita `edges`). `src/renderer/src/edges/edgeKind.test.ts` (estilo de teste tabelado). `src/orq/orq.test.ts` (cobre `context` de projeto não-ativo). `vitest.config.ts` roda `src/**/*.test.ts` em `environment: 'node'` (não há `.test.tsx`; testes puros rodam sem DOM — `htmlToText` é a única dependência de `DOMParser`, e não é tocada por T1).

## 3. Gaps priorizados

| Gap | Prioridade | Valor | Esforço | Onda |
|---|---|---|---|---|
| Travessia transitiva da cadeia de notas no `/context` (BFS/DFS + anti-ciclo + limite de profundidade) | **P0** | Alto | **S** | 1 |
| Popover de inspeção por nó (lista + rótulo do outro lado + × por linha + navegar/selecionar) | P1 | Alto | M | 1 |
| Estilo por conexão (`edge.data.style` sobrepõe o global; alternância no popover da aresta) | P2 | Médio | M | 2 |
| Aresta `agent` "carregada": topologia prioriza/restringe alvos de `orq ask` + onboarding "conectado a X, Y" (§4.1) | P2 | Médio | M | 2 |
| Cadeia de notas como **memória compartilhada persistente** (§4.2) | P3 | Médio | L | **3 — ver plano de Notas** |
| Ferramenta "Conexão" na barra + atalho `L`; navegação entre "andares" | P3 | Médio | M/L | 2–3 (fora do foco) |

## 4. Tarefas de implementação (TDD, em ordem)

### T1 — Resolver puro de contexto com travessia transitiva da cadeia de notas  [P0 · S · Onda 1]

O item de maior valor e **TDD puro**: uma função sobre um grafo em memória (`CanvasMirror`), sem HTTP, sem DOM, sem React. Isola a regra "o que este terminal enxerga" da mecânica do servidor.

- **Arquivos a tocar:**
  - `src/shared/contextResolver.ts` *(novo)* — mora em `shared/` porque é importado pelo **main** (`OrchestrationServer`) e é agnóstico de processo (o main já importa `../../shared/orchestration`). **Não** importa `src/renderer/**` (evita cruzar o bundle renderer→main) — deriva "chain" de `node.type==='note'` nas duas pontas.
  - `src/shared/contextResolver.test.ts` *(novo)*

- **Passos TDD:**
  1) **Teste que falha** (`src/shared/contextResolver.test.ts`). Casos concretos sobre `resolveContextNodes(mirror, from, opts?)` (retorna `MirrorNode[]`, sem o próprio `from`, sem terminais, dedup, **ordem raiz-primeiro/BFS**):
     - **Cadeia linear A→B→C, terminal T ligado a A** ⇒ `[A, B, C]` (todas as notas da cadeia, raiz primeiro). *(este é o caso central: hoje o `/context` devolveria só A.)*
     - **Ciclo A↔B (chain) com T→A** ⇒ `[A, B]` **sem loop infinito** (guarda por `visited`).
     - **Ciclo profundo A→B→C→A com T→A** ⇒ `[A, B, C]` (cada nota uma vez).
     - **Direção invertida:** aresta guardada como `{source:B, target:A}` ainda é percorrida (grafo tratado como **não-direcional** para contexto, igual ao `/context` atual).
     - **Raiz vazia, filha com conteúdo:** A com `content:''` (ou ausente), B com conteúdo, T→A, A—B (chain) ⇒ o resultado **inclui B** (a travessia é *estrutural*; o filtro de `content` vazio é responsabilidade do formatador, T2 — travessar *através* de uma nota-índice vazia é requisito).
     - **Vizinhos não-nota são 1-salto:** T ligado a um `file` F e a um `portal` P (além da nota A) ⇒ inclui F e P, **mas não** segue arestas a partir de F/P (só `note↔note` é transitivo).
     - **Terminal quebra a cadeia:** A—T2—D (nota D só alcançável passando por outro terminal T2) ⇒ D **não** entra no contexto de T.
     - **Isolamento entre terminais:** T1→(A→B) e T2→(C→D) no mesmo mirror ⇒ contexto de T1 = `[A,B]`, sem vazar C/D.
     - **Sem vizinhos:** `from` sem arestas ⇒ `[]`.
     - **Limite de profundidade:** cadeia com > `maxDepth` saltos ⇒ trunca no teto (default sugerido `maxDepth = 64`; parametrizável via `opts`), sem estourar pilha nem loopar.
  2) **Implementação** — `export function resolveContextNodes(mirror: CanvasMirror, from: string, opts?: { maxDepth?: number }): MirrorNode[]`:
     - Indexar nós por id (`Map<string, MirrorNode>`) e montar adjacência **não-direcional** a partir de `mirror.edges` (`Map<string, Set<string>>`, inserindo os dois sentidos).
     - `isNote(id) = byId.get(id)?.type === 'note'`.
     - **BFS em duas etapas.** Fila inicial = vizinhos diretos de `from`. Para cada nó `n` desenfileirado (marcar em `visited`, ignorar `from` e terminais): incluir `n` no resultado; **se `isNote(n)`**, enfileirar seus vizinhos **que também sejam nota** (`isNote(viz)`) e ainda não visitados — assim a transitividade percorre **só** arestas `note↔note` (chain), enquanto file/portal entram como folha de 1 salto. Respeitar `maxDepth` por nível.
     - Retornar os `MirrorNode` na ordem de descoberta (BFS ⇒ raiz antes das descendentes), sem duplicatas.
     - *(Símbolo auxiliar opcional, também exportado e testável:* `export function formatContextBlocks(nodes: MirrorNode[]): string` *— filtra `content` vazio, mapeia label por tipo (`note→'nota'`, `file→'arquivo'`, `portal→'site'`, senão `type`) e junta com `\n\n`, replicando byte-a-byte o formato atual do `/context`. Extrair aqui deixa o T2 quase mecânico e testa o filtro-de-vazio isolado.)*
  3) **Verde:** `npx vitest run src/shared/contextResolver.test.ts`

- **Critérios de aceite:**
  - Cadeia A→B→C ligada a um terminal retorna as três notas, raiz primeiro.
  - Nenhum ciclo (A↔B, A→B→C→A) causa loop/estouro; cada nó aparece **uma** vez.
  - Notas alcançáveis **apenas** através de outro terminal **não** entram; file/portal entram só como 1-salto.
  - Uma nota-índice vazia é atravessada (suas filhas com conteúdo aparecem).
  - Função pura: sem `fetch`, sem `DOMParser`, sem `window`; determinística para o mesmo mirror.

- **Notas / edge cases:** `MirrorEdge` **não** tem `kind` hoje — não adicionar (evita mexer no produtor `useOrchestrationSync` e no `shared/orchestration.ts`); derivar chain de `node.type` é suficiente e mais robusto a mirrors legados. Arestas com `source`/`target` apontando para ids inexistentes: ignorar (o `byId.get` devolve `undefined` → não-nota → folha ignorada). Multi-arestas entre o mesmo par: o `Set` de adjacência já deduplica.

### T2 — Ligar o resolver ao `GET /context` (integração + testes de servidor)  [P0 · S · Onda 1]

- **Arquivos a tocar:**
  - `src/main/orchestration/OrchestrationServer.ts` (bloco `/context`, L332–354)
  - `src/main/orchestration/OrchestrationServer.test.ts` (adicionar casos de `/context` — hoje **inexistentes**)

- **Passos TDD:**
  1) **Teste que falha** (`OrchestrationServer.test.ts`, reusando `makeServer({ nodes, edges }, …)`):
     - `GET /context?from=T` com mirror `T(terminal) — A(note "raiz") — B(note "filha")` (arestas `T–A`, `A–B`) ⇒ status 200 e `json.context` **contém o bloco de B** (`[contexto — nota: …]` com o conteúdo da filha), provando a travessia transitiva ponta-a-ponta. *(Com o código atual — 1 salto — B ficaria de fora: o teste falha antes do fix.)*
     - `GET /context?from=T` sem nada ligado ⇒ `{ context: '' }`.
     - Nota-raiz vazia + filha com conteúdo ⇒ `context` traz só a filha (filtro de vazio preservado).
     - Escopo de projeto: `/context` com `x-orkestra-project` divergente ⇒ 409 (herda `isForeignProject`, já testado para `/list`; um caso curto confirma que `/context` também é coberto).
  2) **Implementação** — no bloco `/context`, substituir o `for`/`linked`/`filter`/`map` inline por:
     ```ts
     const nodes = resolveContextNodes(this.opts.getMirror(), from)
     res.end(JSON.stringify({ context: formatContextBlocks(nodes) }))
     ```
     (importa de `../../shared/contextResolver`). Nenhuma mudança em `Opts`, na assinatura HTTP nem no `orq.ts` — a resposta continua `{ context: string }`.
  3) **Verde:** `npx vitest run src/main/orchestration/OrchestrationServer.test.ts` e re-rodar `src/shared/contextResolver.test.ts`.

- **Critérios de aceite:**
  - `/context` de um terminal ligado à raiz de uma cadeia devolve o conteúdo de **toda** a cadeia, raiz primeiro.
  - Formato do bloco **idêntico** ao atual (`[contexto — <label>: <name>]\n<content>`, blocos separados por `\n\n`).
  - Testes de `/context` novos verdes; toda a suíte existente do servidor segue verde (nada de regressão em `/list`, escopo de projeto etc.).

- **Notas:** O `orq context` (`src/orq/orq.ts`) é transparente — não precisa de mudança. Ganho de performance imperceptível (o mirror é leve); o limite de profundidade do T1 é a única salvaguarda necessária.

### T3 — Popover de inspeção de conexões por nó  [P1 · M · Onda 1]

Evolui o **contador** do `NodeToolbar` para o popover estilo Maestri: lista cada conexão, diz o que há do outro lado, **×** por linha, e **clique = navegar+selecionar** o alvo.

- **Arquivos a tocar:**
  - `src/renderer/src/components/nodeConnections.ts` *(novo)* — helper **puro** (sem React) para montar as linhas.
  - `src/renderer/src/components/nodeConnections.test.ts` *(novo)*
  - `src/renderer/src/components/NodeConnectionsPopover.tsx` *(novo)* — UI do popover.
  - `src/renderer/src/components/NodeToolbar.tsx` — trocar o `<span>` contador por um botão que abre o popover.
  - `src/renderer/src/components/nodes.css` (ou CSS existente do toolbar) — estilos do popover/linhas.
  - `src/renderer/src/store/canvasStore.ts` — **se não existir**, ação `focusNode(id)` (seleciona o nó e limpa a seleção dos demais); a centralização usa `useReactFlow().setCenter`/`fitView` no componente.

- **Passos TDD:**
  1) **Teste que falha** (`nodeConnections.test.ts`) sobre `describeNodeConnections(nodeId, nodes, edges)` ⇒ `ConnectionRow[]` (`{ edgeId, otherId, otherName, otherType, kind }`):
     - Nó T com arestas para A(note) e P(portal) ⇒ 2 linhas, com `otherName`/`otherType` corretos e `kind` via `deriveEdgeKind(nodeType, otherType)` (`note` e `portal`).
     - Resolve o "outro lado" **independe de direção** (`source===nodeId` → usa `target`; `target===nodeId` → usa `source`).
     - Nó sem arestas ⇒ `[]`.
     - Ordena de forma estável (ex.: por `otherName`) para um popover previsível.
  2) **Implementação:**
     - `describeNodeConnections` (puro; reusa `deriveEdgeKind` e `EDGE_KIND_META` de `edges/edgeKind`, ambos no mesmo processo renderer).
     - `NodeConnectionsPopover.tsx`: renderiza as linhas (rótulo = `otherName` + badge `EDGE_KIND_META[kind].label`); **×** por linha chama `removeEdge(edgeId)` (store, já existe); clique na linha chama `focusNode(otherId)` + `useReactFlow().setCenter(x, y, { zoom, duration })` mirando a posição do nó alvo.
     - `NodeToolbar.tsx`: o `<span>` de `linkCount` vira `<button>` que abre/fecha o popover (mantém o número e o ícone `GitBranch`).
  3) **Verde:** `npx vitest run src/renderer/src/components/nodeConnections.test.ts` (a UI é validada manualmente — sem `.test.tsx`/DOM na suíte).

- **Critérios de aceite:**
  - O popover lista **cada** conexão do nó com nome + tipo do outro lado.
  - **×** por linha remove só aquela aresta (reusa `removeEdge`) sem fechar o popover.
  - Clique na linha centraliza o canvas no alvo e o seleciona.
  - `describeNodeConnections` é puro e coberto por testes.

- **Notas / riscos:** navegação "entre andares" (Maestri) **não** se aplica (Orkestra separa por projetos) — a linha aponta só para nós do canvas atual. Posição do alvo vem de `node.position` (React Flow); cuidar de nós dentro de grupos (posição pode ser relativa — usar a posição absoluta que o React Flow expõe).

### T4 — Estilo por conexão (override em `edge.data.style`)  [P2 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/edges/edgeStyle.ts` — `resolveEdgeStyle(dataStyle, global)` (puro).
  - `src/renderer/src/edges/edgeStyle.test.ts` — casos do resolver.
  - `src/renderer/src/components/TypedEdge.tsx` — usar `resolveEdgeStyle(data?.style, edgeStyle)`; adicionar botão de alternância de estilo no popover da aresta.
  - `src/renderer/src/store/canvasStore.ts` — ação `setEdgeStyle(id, style)` gravando em `edge.data.style` (entra no histórico como `removeEdge`).

- **Passos TDD:**
  1) **Teste que falha** (`edgeStyle.test.ts`): `resolveEdgeStyle('circuito', 'corda') === 'circuito'` (override); `resolveEdgeStyle(undefined, 'corda') === 'corda'` (fallback global); valor inválido em `data.style` cai no global.
  2) **Implementação:** `resolveEdgeStyle`; `TypedEdge` computa o estilo por aresta antes de escolher o path; popover ganha "Estilo: <atual>" que chama `setEdgeStyle(id, nextEdgeStyle(atual))`.
  3) **Verde:** `npx vitest run src/renderer/src/edges/edgeStyle.test.ts`

- **Critérios de aceite:** uma aresta com `data.style` desenha nesse estilo mesmo com o global diferente; arestas sem `data.style` seguem o global; a preferência por-aresta persiste no snapshot (já que `data` entra na serialização das arestas).

- **Notas:** confirmar que `serialize()`/rehidratação preservam `edge.data.style` (a rehidratação ~L990–1010 recompõe `data` a partir do `kind` — **incluir `style`** ao reconstruir, senão o override some ao recarregar).

### T5 — Aresta `agent` "carregada": topologia prioriza `orq ask`  [P2 · M · Onda 2 · §4.1]

Sem abandonar o roteamento por **nome** (baixa fricção, é o fallback), usar a topologia para (a) **priorizar/limitar** os alvos sugeridos e (b) o onboarding "você está conectado a X, Y".

- **Arquivos a tocar:**
  - `src/shared/contextResolver.ts` *(estende)* ou `src/shared/agentTopology.ts` *(novo)* — `connectedAgentNames(mirror, from): string[]` (terminais ligados a `from` por aresta `agent`, i.e. as duas pontas `type==='terminal'`).
  - teste correspondente *(novo)*.
  - Consumidor (a definir na Onda 2): `orq ask` sem alvo claro sugere os conectados; onboarding do terminal exibe os vizinhos `agent`.

- **Passos TDD:**
  1) **Teste que falha:** mirror com T1—T2 (agent) e T1—A(note); `connectedAgentNames(mirror, T1)` ⇒ `['T2']` (só terminais, exclui a nota); T sem vizinhos-terminal ⇒ `[]`; não-direcional.
  2) **Implementação:** filtra vizinhos diretos de `from` onde ambos os nós são `terminal`, devolve os `name`.
  3) **Verde:** `npx vitest run src/shared/agentTopology.test.ts`

- **Critérios de aceite:** `connectedAgentNames` lista exatamente os terminais conectados por aresta `agent`, por nome, sem duplicatas; roteamento por nome permanece como fallback (não vira pré-condição).

- **Notas:** decisão de produto (Onda 2): a topologia **prioriza/sugere**, não **bloqueia** `orq ask` (preserva a vantagem de baixa fricção do Orkestra). A UI de sugestão/onboarding é o grosso do esforço; a função pura é a fundação.

### Fora do escopo (referências, não implementar aqui)

- **Cadeia de notas como memória compartilhada persistente** (Onda 3, §4.2): a *travessia* já sai pronta em T1; o **enquadramento** ("caderno do agente", persistência entre reinícios, escrita colaborativa) pertence ao **plano de Notas** — ver `docs/analise-maestri-360/notas.md` e o futuro `docs/planejamento/notas.md`. **Não duplicar aqui.**
- **Ferramenta "Conexão" na barra + atalho `L`** e **navegação entre "andares"**: gaps reais (§5, itens 5–6), mas de menor retorno e/ou conceito ausente no Orkestra (andares ≈ projetos). Fora deste plano.

## 5. Dependências & riscos

- **Ordem:** T1 → T2 (T2 consome o resolver de T1). T3, T4, T5 são independentes entre si e podem ir em paralelo depois do T1/T2.
- **Fronteira de bundles:** o resolver vive em `src/shared/` **de propósito** — o main não pode importar `src/renderer/**`. Por isso T1 deriva "chain" de `node.type`, sem reusar `deriveEdgeKind` (que é do renderer). T3/T5 no renderer podem reusar `edges/edgeKind` livremente.
- **`MirrorEdge` sem `kind`:** decisão consciente de **não** adicionar — evita alterar o produtor (`useOrchestrationSync`) e o contrato `shared/orchestration.ts`; a derivação por tipo é suficiente e resiliente a snapshots legados.
- **Persistência do estilo por-aresta (T4):** risco de o override sumir no reload se a rehidratação recompuser `data` só a partir do `kind` — mitigar incluindo `style` na reconstrução (~`canvasStore` L990–1010).
- **Sem cobertura de DOM na suíte:** `vitest` roda em `environment: 'node'` e só `*.test.ts`. As partes puras (T1/T3-helper/T4/T5) são 100% testáveis; a UI (popover, botão de estilo) é verificada manualmente. Manter a lógica **fora** dos componentes (helpers puros) para maximizar cobertura.
- **Guarda anti-ciclo e profundidade (T1):** sem `visited` e sem `maxDepth`, um ciclo de notas trava o servidor local — os testes de ciclo e de profundidade são **obrigatórios**, não opcionais.

## 6. Referências

- **Origem:** `docs/analise-maestri-360/conexoes.md` (seções 4.3 roteamento/contexto, 5 gaps, 6 melhorias).
- **Código (verificado):**
  - `src/main/orchestration/OrchestrationServer.ts` — `GET /context` (L332–354, 1-salto → alvo do T1/T2).
  - `src/shared/orchestration.ts` — `CanvasMirror`/`MirrorNode`/`MirrorEdge` (sem `kind`).
  - `src/renderer/src/hooks/useOrchestrationSync.ts` — produtor do mirror (arestas→`{source,target}`).
  - `src/renderer/src/edges/edgeKind.ts` — `deriveEdgeKind`/`EDGE_KIND_META` (T3/T5).
  - `src/renderer/src/edges/edgeStyle.ts` — estilo global (T4).
  - `src/renderer/src/components/TypedEdge.tsx` — cabo, ponto viajante `agent`, badge/popover (T3/T4).
  - `src/renderer/src/components/NodeToolbar.tsx` — contador de conexões (T3).
  - `src/renderer/src/store/canvasStore.ts` — `onConnect`/`removeEdge`/rehidratação (T3/T4).
  - `src/orq/orq.ts` — CLI `context`/`ask` (T2 transparente; T5).
  - `src/main/orchestration/OrchestrationServer.test.ts` — padrão `makeServer` (T2).
  - `src/renderer/src/edges/edgeKind.test.ts` — estilo de teste tabelado.
- **Onda 3 (Notas):** `docs/analise-maestri-360/notas.md` → `docs/planejamento/notas.md` (memória compartilhada; não duplicar).
- **Comandos de verificação:** `npx vitest run <arquivo>` · `npm run typecheck` · `npm run lint`.
