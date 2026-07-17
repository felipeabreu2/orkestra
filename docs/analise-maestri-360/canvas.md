# O Canvas — Análise 360° (Maestri → Orkestra)

> Documento de referência técnica e de produto. Compara a funcionalidade **O Canvas** descrita
> na documentação do Maestri com a implementação atual do Orkestra, apontando o estado real do
> código, lacunas e melhorias priorizadas.

---

## 1. Visão geral

O canvas é a superfície central de trabalho do produto: um plano 2D "infinito" onde o usuário
posiciona livremente blocos (nós) e os conecta para orquestrar agentes de IA. Em vez de uma lista
linear de conversas, o trabalho vira um **mapa espacial** — cada terminal (agente), nota, árvore de
arquivos, site incorporado ou desenho ocupa uma posição, tem tamanho próprio e pode ser ligado a
outros blocos por conexões visuais.

A proposta de valor é dupla:

1. **Organização espacial livre** — o usuário arruma os blocos "da forma que parecer mais natural",
   com liberdade de zoom, pan, agrupamento, alinhamento e navegação, como num editor de diagramas
   (Figma/FigJam/Excalidraw como referências mentais).
2. **Contexto vira topologia** — as conexões entre blocos não são só decorativas: elas descrevem
   quem alimenta quem. No Orkestra, essa topologia é lida por um sistema de orquestração (a CLI
   `orq`) para que um agente puxe, sob demanda, o contexto dos blocos ligados a ele.

No Orkestra, o canvas é implementado com **React Flow** (`@xyflow/react` v12) dentro do renderer
Electron (`src/renderer/src/components/Canvas.tsx`), com o estado central em um store Zustand
(`src/renderer/src/store/canvasStore.ts`) e persistência por projeto no processo main
(`src/main/projects/ProjectManager.ts`).

---

## 2. Como funciona

### 2.1 Inserir nós

No Maestri, o fluxo é: escolher uma ferramenta na barra superior e "clicar e arrastar" no canvas
para desenhar o retângulo do novo nó, definindo posição e tamanho de uma vez. Os tipos citados são
Terminal, Nota, Texto, Desenho e Árvore de Arquivos, com tamanho padrão configurável e alinhado a
uma grade de 20pt.

No Orkestra, esse fluxo "arrastar para criar" existe em `CreateOverlay.tsx`. A barra superior
(`Topbar.tsx`) "arma" uma ferramenta pendente (`pendingTool`: `note` / `portal` / `filetree` /
`draw`); enquanto ela está armada, o `CreateOverlay` cobre o canvas e captura o gesto: arrastar
desenha o retângulo (posição + tamanho, convertidos para coordenadas do canvas via
`screenToFlowPosition`), e um clique simples (arraste menor que 12px) cria com o tamanho padrão.
Terminais têm um fluxo próprio (`NewTerminalModal.tsx`), e "anexar arquivo" usa o seletor nativo do
sistema. Também há um caminho por **menu de contexto** (botão direito no vazio → "Novo terminal
aqui", "Nova nota aqui", etc.), com a posição ancorada no cursor.

Tipos de nó registrados hoje (`nodeTypes` em `Canvas.tsx`): `terminal`, `note`, `portal` (site em
webview), `filetree` (explorador de arquivos), `file` (arquivo avulso), `draw` (Excalidraw) e
`group` (contêiner). Os tamanhos padrão de cada tipo estão embutidos no store (ex.: terminal
480×320, nota 240×180, portal 480×320, filetree 300×360).

### 2.2 Mover e redimensionar

Movimentação é delegada ao React Flow (arrastar o nó). O **snap à grade** está ativo no componente
`ReactFlow` com `snapToGrid` e `snapGrid={[20, 20]}` — os nós encaixam numa grade de 20px ao mover
e ao criar. Curiosidade: a grade **visual** de pontos usa `gap=22` (token de design), independente
do passo de snap de 20 — o espaçamento dos pontos é puramente estético.

O redimensionamento usa a maquinaria de largura/altura do React Flow (cada nó carrega `width`/
`height` no store). Há também um atalho de conveniência no store: `toggleMaximizeNode` maximiza para
um tamanho grande e guarda o tamanho anterior em `data._restore` para restaurar depois.

### 2.3 Seleção, ações e menu de contexto

- **Seleção** é a padrão do React Flow (clique, seleção por caixa). Com **1 nó** selecionado abre a
  `NodeToolbar` (renomear, contador de conexões, reverter, apagar); com **2+ nós** abre a barra de
  alinhar/distribuir/organizar.
- **Menu de contexto** (`CanvasContextMenu.tsx`): botão direito num nó dá Copiar / Duplicar /
  Remover todas as conexões / Excluir; num nó que faz parte da seleção, as ações agem sobre a
  **seleção inteira** (ex.: "Copiar (3 nós)"). Botão direito no vazio dá as opções de criar bloco
  ali + "Colar aqui".
- **Copiar / Colar / Duplicar** (`Cmd/Ctrl+C` / `V` / `D`): um clipboard interno de widgets que
  **sobrevive à troca de projeto** — dá para copiar num projeto e colar em outro. Terminais colados
  nascem com shell próprio (id novo); nomes que colidem ganham sufixo "(cópia)". Colagens
  consecutivas via `Cmd+V` deslocam +32px a cada vez.
- **Excluir**: `Backspace`/`Delete` (`deleteKeyCode`). Há um guard importante (`onBeforeDelete`):
  apagar um grupo **desagrupa antes** e remove só o contêiner vazio, evitando apagar em cascata todo
  o conteúdo de dentro.

### 2.4 Grupos

Grupos usam o mecanismo parent/child do React Flow v12. `groupSelected` (`Cmd/Ctrl+G`) transforma
2+ nós selecionados num nó `group` posicionado na bounding box da seleção; cada filho recebe
`parentId` + `extent:'parent'` e tem a posição reescrita de absoluta para relativa ao topo-esquerda
do grupo. `ungroupSelected` (`Cmd/Ctrl+Shift+G`) desfaz, restaurando posições absolutas.

Detalhe de UX fiel à ideia de "grupo é rótulo, não barreira": o grupo só é arrastável pelo
cabeçalho (`dragHandle: '.ork-group-header'`), e os nós-filhos são elementos irmãos por cima do
frame — cliques e seleção passam pelo corpo do grupo até o conteúdo. A composição do grupo é
preservada por copiar/colar, duplicar e pela persistência (`captureWidgets`/`materializeWidgets` no
store; `parentId`/`extent` no snapshot). Toda a matemática cuida da conversão absoluto↔relativo para
que a seleção possa misturar filhos de grupo com nós soltos sem "saltos".

### 2.5 Alinhar, distribuir e organizar em grade

Toda a geometria vive em funções puras testáveis (`src/renderer/src/layout/arrange.ts`), e a barra
que aparece com 2+ nós selecionados (`ork-arrange-toolbar` em `Canvas.tsx`) só faz a ponte
store↔arrange:

- **Alinhar** (`alignNodes`): Esquerda, Centro H, Direita, Topo, Centro V, Base — usando a bounding
  box da seleção como referência.
- **Distribuir** (`distributeNodes`): Horizontal e Vertical, com espaçamento igual entre bordas; os
  extremos ficam parados.
- **Organizar em grade** (`gridArrange`): arruma a seleção numa grade de `ceil(sqrt(n))` colunas,
  passo pela maior dimensão + gap, ancorada no canto superior-esquerdo. Exposto pelo botão "Grade".

Importante: essas operações passam posições **absolutas** ao arrange (resolvendo `parentId` de
filhos de grupo) e são reconvertidas para relativo ao aplicar (`setNodePositions`) — e entram no
histórico de undo.

### 2.6 Zoom, minimapa e navegação

- **Zoom**: `minZoom={0.2}`, `maxZoom={2}`. Os controles padrão do React Flow (`<Controls>`) ficam
  no canto inferior esquerdo.
- **Minimapa** (`<MiniMap>`): canto inferior direito, `pannable` e `zoomable`, com máscara e cor de
  nó **tema-aware** (a cor da máscara é derivada em runtime do fundo `--bg-0` e re-derivada quando o
  tema muda, via `MutationObserver` no `data-theme`).
- **Atalhos de viewport** (em `Canvas.tsx`, `handleKeyDown`):
  - `Shift+1` → `fitView` (enquadra todo o canvas).
  - `Shift+2` → `fitView` da seleção (zoom para a seleção).
  - `Shift+M` → liga/desliga o minimapa.
  - `Shift+A` → foca o **próximo agente que precisa de atenção** (cicla entre terminais ociosos que
    produziram saída e aguardam o usuário), selecionando e enquadrando o nó.
  - `Cmd/Ctrl+K` → command palette.
  - `Cmd/Ctrl+Z` → desfazer.
- O pan/zoom por trackpad, mouse e teclado (+/-) segue os comportamentos padrão do React Flow.

### 2.7 Conexões (arestas)

Cada nó expõe 4 handles (`NodeHandles.tsx`): entradas na esquerda e no topo (`target`), saídas na
direita e embaixo (`source`) — uma saída sempre liga a uma entrada. As arestas são tipadas
(`TypedEdge.tsx` + `edges/edgeKind.ts`): o "kind" é derivado dos tipos dos dois nós extremos —
`agent` (terminal↔terminal), `chain` (nota↔nota), `note` (terminal↔nota, contexto), `portal` e
`link` — cada um com rótulo/cor próprios. O traçado tem três estilos globais persistidos
(`edges/edgeStyle.ts`): `curva` (bezier), `circuito` (trilhos ortogonais) e `corda` (padrão — bezier
com "barriga" por gravidade e balanço; `edges/ropePath.ts`). Conexões de agente ganham um ponto
viajante animado ao longo do fio; um badge na aresta permite desconectar.

### 2.8 Reversão de ferramenta e desfazer

- Ferramentas "armadas" (nota/site/arquivos/desenho) voltam para o modo Selecionar após a criação
  ou com `Esc`. Terminal e "anexar arquivo" são disparos únicos, não modos.
- Undo (`Cmd/Ctrl+Z`) desfaz mutações **estruturais** (criar/remover/agrupar/colar/alinhar), com
  histórico limitado a 50 passos e coalescing por tag dentro de uma janela de 1s (ex.: digitar num
  nome vira um único passo). Mudanças de posição/seleção não poluem o histórico. Não há redo (v1).

---

## 3. Pontos interessantes / diferenciais

- **Contexto por topologia, não por injeção**: em vez de "empurrar" texto no prompt do agente ao
  conectar blocos, o Orkestra deixa o agente **puxar** o contexto com `orq context`, sempre
  refletindo o estado atual do canvas (`useOrchestrationSync.ts`). Isso torna a conexão visual uma
  fonte de verdade viva.
- **Atenção do agente (`Shift+A`)**: terminais cujo agente produziu saída e ficou ocioso acendem um
  indicador; o atalho cicla por eles. É um recurso "de sala de controle" que casa exatamente com a
  ideia de "próximo agente que precisa de atenção" da referência.
- **Sinal `generating` por conteúdo de tela**: um border-beam pulsa enquanto o agente gera resposta,
  detectado pela marca "esc to interrupt" no buffer visível do terminal (`terminal/generatingSignal.ts`)
  — uma heurística robusta que substituiu tentativas frágeis baseadas em silêncio do stream.
- **Clipboard entre projetos**: copiar num projeto e colar em outro funciona, porque o clipboard
  vive no módulo (não no state) e sobrevive à re-hidratação do canvas.
- **Conexões "corda"**: tratamento estético com física leve (barriga por gravidade + balanço ao
  arrastar) que dá personalidade ao canvas sem custo em repouso.
- **Robustez contra corrupção**: isolamento por `ErrorBoundary` por nó (um nó com dado corrompido
  não derruba a UI inteira), escrita atômica com fsync na persistência, e descarte de arestas órfãs
  na hidratação.

---

## 4. Como seria o backend (arquitetura técnica provável)

O "backend" do canvas aqui é local (Electron), dividido entre renderer (estado/render) e main
(persistência/processos):

- **Modelo de estado (fonte da verdade em runtime)**: um store Zustand único
  (`canvasStore.ts`) guarda `nodes: Node[]` e `edges: Edge[]` no formato do React Flow. Cada nó tem
  `id`, `type`, `position {x,y}`, `width`, `height`, `data` (payload específico do tipo) e,
  opcionalmente, `parentId` + `extent:'parent'` para grupos. Estados efêmeros de UI (seleção,
  `attention`, `generating`, histórico de undo) vivem no store mas **não** são persistidos.

- **Coordenadas**: um único sistema cartesiano do "mundo" do canvas. Posições de nós soltos são
  absolutas; posições de filhos de grupo são **relativas ao grupo**. Utilitários
  (`absolutePosition`/`absolutePositionOf`) resolvem a cadeia de ancestrais para operações que
  exigem coordenadas absolutas (agrupar, alinhar, distribuir), reconvertendo para relativo ao aplicar.

- **Render**: React Flow cuida de viewport (pan/zoom), hit-testing, arraste, handles e desenho de
  arestas via SVG. Os nós são componentes React customizados (terminal com xterm.js, nota com
  TipTap, portal com `<webview>`, desenho com Excalidraw), registrados em `nodeTypes`/`edgeTypes`
  como constantes de módulo (identidade estável para o React Flow não "thrashear").

- **Persistência (snapshot)**: `serialize()` produz um `CanvasSnapshot` enxuto (`version`, `nodes`,
  `edges`) — ver `src/shared/canvasSnapshot.ts`. Campos derivados (kind da aresta, `dragHandle`,
  `className`) **não** são salvos; são recalculados na hidratação (`hydrate()`). Autosave é
  debounced (500ms) e escreve **por id de projeto explícito** (`useCanvasPersistence.ts`), nunca "no
  projeto ativo do main", para evitar corrupção cross-project. Há flush síncrono no `beforeunload`.

- **Armazenamento em disco (main)**: `ProjectManager.ts` grava um arquivo JSON por projeto em
  `projects/<id>.json` (sob o `userData` do Electron), com índice em `projects.json`. A escrita é
  **atômica e endurecida**: `tmp` + `fsync` + `rename` + `fsync` do diretório, com backup de
  arquivos corrompidos e self-heal (re-adoção de canvases órfãos se o índice sumir).

- **React Flow vs. custom**: a escolha é React Flow para o motor de grafo (viewport, nós, arestas,
  parent/child) + camadas próprias para tudo que é específico do produto (geometria de arranjo em
  `arrange.ts`, arestas tipadas/corda, grupos, undo, clipboard, orquestração). A geometria "de
  negócio" é isolada em funções puras, o que a mantém testável fora do React.

---

## 5. Estado atual no Orkestra (com caminhos reais)

Já implementado:

- **Canvas e motor**: `src/renderer/src/components/Canvas.tsx` (React Flow, snap de grade, minimapa,
  controles, menus de contexto, atalhos, guard de deleção de grupo).
- **Estado central**: `src/renderer/src/store/canvasStore.ts` (nós/arestas, add* por tipo, grupos,
  undo com coalescing, clipboard cross-project, serialize/hydrate).
- **Inserir arrastando**: `src/renderer/src/components/CreateOverlay.tsx`;
  barra de ferramentas em `src/renderer/src/components/Topbar.tsx`.
- **Grupos**: `src/renderer/src/components/GroupNode.tsx` + lógica em `canvasStore.ts`
  (`groupSelected`/`ungroupSelected`/`ungroupGroupsById`).
- **Alinhar/distribuir/grade**: `src/renderer/src/layout/arrange.ts` (+ `arrange.test.ts`), barra
  em `Canvas.tsx`.
- **Menu de contexto**: `src/renderer/src/components/CanvasContextMenu.tsx`.
- **Conexões**: `src/renderer/src/components/NodeHandles.tsx`,
  `src/renderer/src/components/TypedEdge.tsx`, `src/renderer/src/edges/*`
  (`edgeKind.ts`, `edgeStyle.ts`, `ropePath.ts`, `ropeSwing.ts`, `useRopeSwing.ts`).
- **Persistência**: `src/renderer/src/hooks/useCanvasPersistence.ts`,
  `src/shared/canvasSnapshot.ts`, `src/main/projects/ProjectManager.ts`,
  `src/main/persistence/registerPersistenceIpc.ts`.
- **Orquestração/atenção/generating**: `src/renderer/src/hooks/useOrchestrationSync.ts`,
  `src/renderer/src/components/nodeState.ts`, sinal em `src/renderer/src/terminal/`.

Lacunas em relação ao que a doc da referência descreve:

| Recurso da referência | Estado no Orkestra |
| --- | --- |
| Encaixe magnético tipo mosaico (alinhar parede, preencher espaço, sem grade fixa) | **Ausente**. Só há snap de grade fixo `[20,20]` no `ReactFlow`. |
| Andar por conexão com `→/←` (próximo/anterior nó conectado) | **Ausente**. Não há navegação por adjacência de arestas. |
| Organizar em grade por atalho `⇧T` | **Parcial**. `gridArrange` existe, mas só via botão "Grade"; sem atalho. |
| Renomear grupo com duplo clique no cabeçalho | **Ausente**. `GroupNode.tsx` só exibe o nome; não há input de edição. |
| Duplicar "segurando ao arrastar" (Alt-drag) | **Parcial**. Há `Cmd+D` e "Duplicar" no menu; falta o gesto de arrastar-duplicando. |
| Tamanho padrão de nó configurável em Configurações | **Ausente**. Defaults embutidos no store; não há tela de Configurações → Geral. |
| Auto-reversão de ferramenta por inatividade | **Parcial**. Reverte após criar/`Esc`, não por timeout de inatividade. |
| Auto-dissolver grupo quando sobra 1 membro | **Ausente**. Exige 2+ para criar, mas não dissolve automaticamente ao esvaziar. |
| Foco de viewport / zoom-para-seleção na tecla `\` | **Divergente**. Existe como `Shift+2` (não `\`). |
| Excluir com `W` | **Divergente**. Usa `Backspace`/`Delete`. |
| Tipo de nó "Texto" puro | **Ausente/desabilitado** ("em breve" na Topbar). Há nota rica, arquivo, portal, desenho. |

Convergências fortes (já batem com a referência): `⇧A` (próximo agente com atenção), `⇧M` (minimapa),
alinhar/distribuir completos, agrupar/desagrupar, grupo como rótulo (seleção passa pelo frame),
inserir arrastando um retângulo, minimapa no canto inferior direito e borda de seleção tracejada.

---

## 6. Melhorias sugeridas (priorizadas por valor × esforço)

**Ganhos rápidos (alto valor, baixo esforço):**

1. **Atalho `⇧T` para "Organizar em grade"** — a função `gridArrange` já existe; basta ligar a tecla
   no `handleKeyDown` (grupo `Shift+…`), reaproveitando `toPosNodes()`. (Esforço: baixo.)
2. **Renomear grupo com duplo clique no cabeçalho** — adicionar um input inline em `GroupNode.tsx`
   ligado a uma ação `updateGroupName` no store (o payload `data.name` já existe). (Esforço: baixo.)
3. **Auto-dissolver grupo com <2 membros** — ao remover/desagrupar um filho, se o grupo ficar com 1,
   desagrupar automaticamente (reusar `ungroupGroupsById`). (Esforço: baixo.)

**Diferenciadores de UX (alto valor, esforço médio):**

4. **Navegação por conexão (`→/←`)** — selecionar/enquadrar o próximo/anterior nó adjacente pelas
   arestas, partindo da seleção atual. Casa com o modelo "contexto é topologia" e reforça a marca de
   "sala de controle" (semelhante ao `Shift+A`, mas por grafo). (Esforço: médio.)
5. **Duplicar arrastando (Alt-drag)** — interceptar o início do arraste com Alt/Option para
   materializar uma cópia (reusar `duplicateNodes`/`materializeWidgets`). Gesto muito esperado por
   quem vem de Figma. (Esforço: médio.)
6. **Encaixe magnético tipo mosaico** — ao segurar um modificador durante o arraste, sugerir
   encaixes contra bordas de nós vizinhos e preencher lacunas (guias/linhas de alinhamento em tempo
   real). É o maior diferencial visual ainda ausente. (Esforço: médio-alto — provavelmente uma
   camada de "snapping" própria por cima do drag do React Flow.)

**Estruturais (valor médio-alto, esforço maior):**

7. **Configurações → Geral (tamanho padrão de nó, passo de grade, estilo de conexão)** — centralizar
   defaults hoje embutidos no store; melhora consistência e dá controle ao usuário. (Esforço: médio.)
8. **Redo (`Shift+Cmd+Z`)** — o histórico já guarda snapshots; falta a pilha de "futuro". Fecha uma
   lacuna óbvia do undo v1. (Esforço: médio.)
9. **Nó de "Texto" puro** — completar o conjunto de tipos da referência (rótulos/anotações leves sem
   o peso do editor rico). (Esforço: baixo-médio.)

**Sugestão de sequência**: fazer 1–3 juntos (limpeza de paridade barata), depois 4 e 5 (grandes
ganhos de fluidez), e planejar 6 como um épico próprio. 7–9 entram conforme surgir a tela de
Configurações.

---

## 7. Referência

- Documentação "O Canvas" do Maestri: <https://www.themaestri.app/pt-br/docs/canvas>
- Data desta análise: 2026-07-15. Baseada no código do Orkestra no branch `feat/designcode-ui`.
