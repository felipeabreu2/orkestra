# Batuta Search — Análise 360° (Maestri → Orkestra)

> Documento de pesquisa comparativa entre a funcionalidade **Batuta Search** do
> Maestri (themaestri.app) e o seu equivalente no **Orkestra** (o
> `CommandPalette`). Base factual: documentação oficial em
> <https://www.themaestri.app/pt-br/docs/batuta-search> e o código real do
> Orkestra citado na seção 5.

---

## 1. Visão geral

A **Batuta Search** é a *command palette* / busca universal do Maestri. A
metáfora é a **batuta do maestro**: uma única superfície, pensada para o teclado,
para **buscar, navegar e agir** em qualquer lugar do app sem tocar no mouse. Ela
concentra três papéis que normalmente estariam espalhados pela interface:

1. **Navegação** — pular para qualquer terminal, nota, bloco de texto, arquivo,
   link, árvore de arquivos, portal ou espaço de trabalho, inclusive trocando de
   espaço de trabalho ou de andar quando necessário.
2. **Ações** — criar nós, alternar painéis, abrir na IDE, salvar, dar zoom,
   trocar de espaço de trabalho, abrir Rotinas etc.
3. **Interação com agentes** — os fluxos **Pedir** (enviar mensagem a um
   terminal, com pré-visualização ao vivo do stream) e **Verificar** (acompanhar
   a saída de um terminal em modo somente-leitura), sem tirar as mãos do teclado.

O objetivo de design é claro: manter o fluxo de quem orquestra muitos agentes ao
mesmo tempo, permitindo saltar entre contextos e disparar ações a partir de um só
campo de texto. O Orkestra já implementa o núcleo dessa ideia — um *command
palette* (Cmd/Ctrl+K) com busca de nós, ações de criação, ações contextuais por
seleção, conectar/desconectar e um modo "perguntar ao agente" com preview do
stream — mas com uma cobertura menor do que a do Maestri (ver seções 5 e 6).

---

## 2. Como funciona

### 2.1 Abrir e fechar

No Maestri, a paleta abre com a tecla **P** sobre o canvas e fecha com **P** de
novo, **Esc** ou clique fora. Fechar sem executar nada devolve o foco ao local
anterior. O atalho é personalizável (**Configurações → Atalhos**) e também há
entrada de menu (**Visualizar → Batuta Search**).

### 2.2 Busca fuzzy multi-palavra

A busca do Maestri é **fuzzy**, **ignora maiúsculas/minúsculas e acentos**, e
considera **nome, tipo, espaço de trabalho e apelidos de palavra-chave**. Para
**notas e blocos de texto**, ela busca no **corpo inteiro** do texto, não só no
título. **Múltiplas palavras refinam** o resultado. As regras de ordenação:

- os melhores resultados aparecem primeiro;
- o **espaço de trabalho atual** recebe prioridade;
- **correspondências no nome** precedem as do **corpo do texto**;
- os **caracteres combinados** ficam em **negrito** no resultado.

### 2.3 Pular para qualquer coisa

A Batuta Search **indexa** terminais, notas, blocos de texto, arquivos, links,
árvores de arquivos, portais e espaços de trabalho **em cada espaço de trabalho e
andar**. Selecionar um resultado leva até ele — **trocando de espaço de trabalho
ou andar e deslocando o canvas** conforme necessário. Notas abrem em **modo de
edição**; terminais e portais recebem **foco do teclado**.

### 2.4 Executar ações

Ao **apagar a busca**, a paleta lista as ações disponíveis no momento.

- **Ações globais**: criar terminal, nota, portal, espaço de trabalho ou andar;
  **Pedir** ou **Verificar** um agente; abrir **Rotinas**; alternar o **Ombro**
  ou a **barra lateral**; abrir o espaço de trabalho na **IDE**; **salvá-lo**;
  dar **zoom** ou **trocar** entre espaços de trabalho.
- **Ações contextuais** (aparecem no topo quando um **único nó** está
  selecionado, variando por tipo):
  - **terminal** → Editar, Recarregar, Descarregar, Excluir;
  - **nota adesiva** → Copiar Conteúdo, Conectar a…, Desconectar…;
  - **nó de árvore de arquivos** → Buscar Arquivos.

### 2.5 Pedir e Verificar (interação com agentes)

Fluxos curtos dentro da paleta, para não tirar as mãos do teclado:

- **Pedir…** — envia mensagem para **qualquer** terminal, **em qualquer lugar**.
  Aceita mensagem de **várias linhas** (**⇧Enter** para nova linha). Uma
  **pré-visualização ao vivo** permite acompanhar a resposta; **Enter** pula para
  aquele terminal, **Esc** escolhe outro. O agente continua rodando, com você ali
  ou não.
- **Verificar…** — versão **somente-leitura**: escolhe um terminal, acompanha a
  saída ao vivo e pressiona **Enter** para pular até ele.

Ambos **alcançam outros espaços de trabalho** sem precisar trocar.

### 2.6 Conectar e desconectar nós

Com um único nó conectável selecionado, é possível ligá-lo **sem arrastar**:

- **Conectar a…** lista os alvos válidos (notas, terminais e portais do **mesmo
  andar**, além de **terminais em outros andares**) e cria a ligação;
- **Desconectar…** aparece quando já existe uma conexão a remover.

É um **complemento** à conexão por arrasto, não um substituto.

### 2.7 Referência de teclado (Maestri)

| Tecla | Ação |
| --- | --- |
| ↑ / ↓ | movem a seleção |
| Enter | executa o item ou avança um fluxo |
| Esc | volta **um nível** em vez de fechar tudo |
| P | fecha a paleta |
| Pedir | Enter envia · ⇧Enter nova linha · Enter pula para o terminal |

---

## 3. Pontos interessantes / diferenciais

O que torna a Batuta Search mais do que um "filtro de lista":

- **Uma superfície, três verbos** — buscar, navegar e agir convivem no mesmo
  campo. A ausência de query vira lista de ações; a presença vira busca. Não há
  modo separado para "comandos" versus "navegação".
- **Índice que cruza espaços de trabalho e andares** — o alcance não se limita ao
  canvas visível. Você pode saltar para um terminal de outro espaço de trabalho e
  a paleta cuida da troca de contexto e do reposicionamento do canvas.
- **Busca profunda em texto** — para notas e blocos, a busca varre o **corpo
  inteiro**, transformando a paleta numa busca de conteúdo, não só de títulos.
- **Ranqueamento consciente do contexto** — prioriza o espaço de trabalho atual,
  privilegia matches no nome sobre matches no corpo e destaca em negrito os
  caracteres combinados.
- **Ações contextuais por tipo de nó** — o topo da lista muda conforme o que está
  selecionado (terminal, nota, árvore de arquivos), reduzindo ruído.
- **Interagir com agentes sem sair do teclado** — Pedir e Verificar embutem um
  mini-fluxo de conversa/monitoramento com preview ao vivo do stream; o agente
  segue rodando independentemente da paleta.
- **Conectar/desconectar por teclado** — grafo editável sem arrastar, útil para
  quem prefere teclado ou para conexões entre andares (difíceis de arrastar).
- **Esc hierárquico** — Esc "volta um nível" (de um fluxo para a lista) em vez de
  fechar tudo de uma vez; erro de teclado custa menos.
- **Localização completa** — totalmente traduzida para alemão, espanhol, francês,
  japonês e chinês simplificado; a **marca** ("Batuta Search") permanece
  constante em todos os idiomas.

---

## 4. Como seria o backend

A Batuta Search é essencialmente uma camada de **índice + ranqueamento + registro
de comandos + execução**. Um desenho plausível:

**1. Indexação.** Um índice em memória de "coisas alcançáveis" — cada entrada
carrega `{ id, tipo, nome, espacoDeTrabalho, andar, apelidos, corpo? }`. Terminais,
notas, blocos de texto, arquivos, links, árvores de arquivos, portais e espaços de
trabalho viram entradas. Para notas/blocos, o `corpo` inteiro entra no índice (e
não só o título). O índice é reconstruído/atualizado conforme os nós mudam e
abrange **todos os espaços de trabalho e andares**, não apenas o visível — daí o
salto entre contextos "de graça".

**2. Fuzzy match.** Uma função pura recebe a query e o índice e devolve os
candidatos ordenados. Passos típicos:
   - **normalização** — `toLowerCase()` + remoção de acentos (`normalize('NFD')`
     removendo diacríticos), aplicada tanto à query quanto aos campos;
   - **tokenização multi-palavra** — a query é quebrada em termos; um item só
     passa se **todos** os termos casarem (refino AND);
   - **scoring** — subsequência fuzzy (ex.: estilo Fuse.js / fzf) que pontua
     match no início, contiguidade e cobertura; bônus por match no **nome** vs.
     **corpo**, e por **espaço de trabalho atual**;
   - **realce** — as posições dos caracteres combinados voltam junto com o
     resultado para o front pôr em negrito.

**3. Registro de comandos/ações.** Um registro declarativo de ações onde cada uma
sabe **quando** aparece (sempre / com um único nó selecionado / por tipo de nó) e
**o que faz**. Ações globais são estáticas; ações contextuais são geradas a partir
da seleção corrente. Fluxos como Pedir/Verificar são ações que **abrem um
sub-modo** dentro da paleta em vez de executar e fechar.

**4. Execução.** Selecionar um item de **navegação** dispara troca de espaço de
trabalho/andar + `panTo`/`setCenter` no nó. Um item de **ação** chama o comando
correspondente. Um item de **fluxo** (Pedir/Verificar) troca a UI da paleta para o
sub-painel, que escreve no PTY do terminal (Pedir) e/ou assina o stream de saída
para o preview ao vivo, mantendo o processo rodando após fechar.

Esse mesmo esqueleto (índice → ranking puro → registro de itens → execução) é
exatamente o que o Orkestra já adota em menor escala (ver seção 5): `search.ts`
é o ranking puro, `paletteCommands.ts` é o registro de itens, e o
`CommandPalette.tsx` faz a execução e o sub-modo.

---

## 5. Estado atual no Orkestra

O Orkestra já tem um *command palette* funcional e razoavelmente bem fatorado,
com **ranking puro testado** e **montagem de itens pura testada**. Arquivos reais:

- **`src/renderer/src/components/CommandPalette.tsx`** — o componente da paleta.
  Faz o teclado (↑/↓ navegam, Enter executa, Esc/clique-fora fecham), o
  agrupamento visual por `kind` (`Ações`, `Ir para`, `Contexto`, `Conectar`,
  `Desconectar` — ver `KIND_GROUP_LABELS`), o **modo input** (segunda tela de
  texto para itens que pedem um valor, já que o Electron bloqueia
  `window.prompt`) e o **modo "perguntar ao agente"** (delega ao `AskAgentPanel`).
  `focusNode` centraliza o viewport no nó via `useReactFlow().setCenter`.
- **`src/renderer/src/palette/paletteCommands.ts`** — `buildPaletteItems(ctx)`,
  função **pura** que monta a lista de `PaletteItem[]`. Produz:
  - **ações globais**: `Criar Terminal`, `Criar Nota`, `Criar Portal`, `Criar
    Árvore de Arquivos`, `Criar terminal SSH remoto` (via `input`), e
    `Estilo de conexão: … → …` (alternância);
  - **ações contextuais** por nó selecionado: `Focar`, `Remover`, `Remover todas
    as conexões` (só se houver edges); e, **só para terminal**: `Renomear`
    (input), `Definir papel` (input) e `Perguntar ao agente` (abre o
    `AskAgentPanel` via campo `ask`);
  - **conectar/desconectar**: `Conectar A → B` para cada nó ainda não conectado
    (nunca a si mesmo) e `Desconectar A ↔ B` para cada edge existente;
  - **navegação**: um item `node:<id>` por nó do canvas, que chama `focusNode`.
  - `nodeLabel(n)` gera o rótulo por tipo (terminal/portal/nota/filetree/group).
- **`src/renderer/src/palette/paletteCommands.test.ts`** — cobre as 4 ações de
  criação, o item SSH com `input`, ausência de contexto sem seleção, itens de
  terminal (focar/remover/renomear/papel/perguntar), conectar apenas a
  não-conectados, desconectar por edge, alternância de estilo, "remover todas as
  conexões" só com edges, e unicidade de ids.
- **`src/renderer/src/search.ts`** — `rankItems(query, items)`, o ranking **puro**
  usado como filtro (`filtered = rankItems(query, items)` no componente). É
  **substring case-insensitive**: ordena pela **posição do match** e, no empate,
  pelo **label mais curto**. Testado em **`src/renderer/src/search.test.ts`**.
- **`src/renderer/src/components/AskAgentPanel.tsx`** — o fluxo "Perguntar ao
  agente". Fase `input` (digitar a pergunta) → fase `preview`: escreve
  `prompt + '\n'` no PTY (`window.orkestra.pty.write`), assina `pty.onData` para
  o **preview ao vivo** (mantém os últimos 8000 chars, limpa ANSI via
  `stripAnsi`), acompanha status (`waiting`/`done`/`timeout` de 60 s/`error`) via
  `onAgentAttention`, e oferece **"Ir ao terminal"** (centraliza o nó) ou
  **Fechar**.
- **`src/renderer/src/components/Canvas.tsx`** — a paleta é acionada por
  **Cmd/Ctrl+K** (toggle) no handler de teclado (`e.key.toLowerCase() === 'k'`,
  ~linha 289), guarda o estado `paletteOpen` (~linha 140) e renderiza
  `{paletteOpen && <CommandPalette onClose=… />}` (~linha 491).
- **`src/main/projects/ProjectManager.ts`** — o Orkestra tem **múltiplos
  projetos** (índice `projects.json` + `projects/<id>.json`, com `activeId`), mas
  **só um** fica carregado no `canvasStore` por vez.

### Lacunas em relação ao Maestri

1. **Busca não é fuzzy nem multi-palavra e não ignora acentos.** `rankItems`
   (`search.ts`) é substring simples e case-insensitive apenas; não faz
   subsequência fuzzy, não divide a query em termos (multi-palavra) e não
   normaliza diacríticos. O Maestri faz os três.
2. **Não busca no corpo das notas.** O filtro só olha para `label`, e
   `nodeLabel` trunca a nota para `Nota: <24 primeiros chars>`. Notas longas são
   praticamente inalcançáveis por conteúdo. O Maestri indexa o **corpo inteiro**.
3. **Escopo limitado ao projeto/canvas atual.** `buildPaletteItems` só enxerga os
   `nodes`/`edges` do `canvasStore` ativo. Não há índice **cross-projeto** e não
   existe o conceito de **andares** (floors) do Maestri. A paleta não salta entre
   espaços de trabalho.
4. **Falta o modo "Verificar" (somente-leitura).** Existe apenas "Perguntar"
   (Ask). Não há o fluxo de monitorar um terminal em modo read-only.
5. **"Perguntar" é de linha única.** O `AskAgentPanel` usa `<input>` simples; não
   há textarea multi-linha nem **⇧Enter** para nova linha como no "Pedir" do
   Maestri.
6. **Sem realce dos caracteres combinados** (negrito) e **sem prioridade de
   contexto** (ex.: projeto atual) no ranqueamento.
7. **Ações globais mais enxutas.** Faltam à paleta: criar espaço de trabalho,
   abrir Rotinas, alternar Ombro/barra lateral, abrir na IDE, salvar, dar zoom e
   trocar de espaço de trabalho. (Algumas já existem no app — ex.: "Abrir no
   editor" e "Novo projeto" no `Topbar.tsx` — mas **não** estão expostas na
   paleta.)
8. **Ações contextuais por tipo mais rasas.** O terminal tem
   focar/remover/renomear/papel/perguntar (o Maestri fala em Editar/Recarregar/
   Descarregar/Excluir); a **nota** não tem "Copiar Conteúdo" nem conectar/
   desconectar dedicados; a **árvore de arquivos** não tem "Buscar Arquivos".
9. **Atalho fixo e sem entrada de menu.** É Cmd/Ctrl+K fixo; não há
   personalização de atalho nem "Visualizar → Batuta Search".
10. **Sem localização.** Strings são PT-BR hard-coded; o Maestri é totalmente
    localizado em 5 idiomas.

---

## 6. Melhorias sugeridas para o Orkestra

Priorizadas por **valor × esforço** (começando pelo maior retorno com menor
custo). Todas cabem na arquitetura atual (`search.ts` puro + `paletteCommands.ts`
puro + `CommandPalette.tsx`).

### Quick wins (alto valor, baixo esforço)

1. **Busca fuzzy + multi-palavra + insensível a acentos em `search.ts`.**
   Evoluir `rankItems` para: normalizar removendo diacríticos (`normalize('NFD')`),
   quebrar a query em termos (todos precisam casar), e trocar substring por
   subsequência com score (match no início + contiguidade). Como é função pura e
   já tem `search.test.ts`, dá para fazer via TDD sem tocar na UI. **Maior
   retorno isolado.**
2. **Indexar o corpo das notas.** Dar a cada `PaletteItem` um campo opcional de
   texto de busca (ex.: `searchText`) alimentado pelo conteúdo completo da nota, e
   fazer `rankItems` casar contra `label + searchText` (mantendo o rótulo curto
   para exibição). Resolve a lacuna nº 2 sem inflar a UI.
3. **Expor ações globais que já existem no app.** Adicionar a `buildPaletteItems`
   itens como "Abrir no editor", "Novo projeto", "Salvar", "Ajustar zoom",
   reutilizando os callbacks que o `Topbar.tsx`/store já oferecem. Barato e
   aproxima a paridade de ações.
4. **Realce dos caracteres combinados.** Fazer o ranking devolver as posições do
   match e o `CommandPalette` renderizar os trechos em `<b>`. Puramente cosmético,
   mas melhora muito a leitura da lista.

### Médio prazo (valor alto, esforço médio)

5. **Ações contextuais por tipo mais completas.** Nota → "Copiar Conteúdo";
   árvore de arquivos → "Buscar Arquivos"; terminal → "Recarregar"/"Descarregar"
   se/quando esses conceitos existirem. Amplia o "topo contextual" da lista.
6. **Modo "Verificar" (somente-leitura).** Reaproveitar o `AskAgentPanel` numa
   variante que **só assina** `pty.onData` (sem `pty.write`), com Enter para pular
   ao terminal. Reuso quase total do que já existe.
7. **"Perguntar" multi-linha.** Trocar o `<input>` do `AskAgentPanel` por
   `<textarea>` com **⇧Enter = nova linha** e **Enter = enviar**, alinhando ao
   "Pedir" do Maestri.
8. **Prioridade de contexto no ranking.** Dar bônus a matches no nome sobre corpo
   e (quando houver índice cross-projeto) ao projeto atual.

### Longo prazo (valor alto, esforço alto)

9. **Índice cross-projeto.** Permitir buscar e saltar para nós de **outros
   projetos** (o `ProjectManager` já lista todos), trocando o projeto ativo e
   centralizando o nó ao selecionar. É o maior salto de capacidade, mas exige
   índice fora do `canvasStore` ativo e orquestração de troca de projeto.
10. **Atalho personalizável + entrada de menu** e, eventualmente,
    **localização** das strings da paleta (i18n), se/quando o app for
    internacionalizado.

---

## 7. Referência

- **Documentação oficial (Maestri):** Batuta Search —
  <https://www.themaestri.app/pt-br/docs/batuta-search> (transcrição integral
  incorporada nas seções 1–2 e 3).
- **Código do Orkestra (caminhos reais):**
  - `src/renderer/src/components/CommandPalette.tsx` — componente da paleta,
    teclado, modo input, integração com o `AskAgentPanel`.
  - `src/renderer/src/palette/paletteCommands.ts` — `buildPaletteItems`
    (registro puro de itens: ações, contexto, conectar/desconectar, navegação) e
    `nodeLabel`.
  - `src/renderer/src/palette/paletteCommands.test.ts` — testes do registro.
  - `src/renderer/src/search.ts` — `rankItems` (ranking/filtragem pura).
  - `src/renderer/src/search.test.ts` — testes do ranking.
  - `src/renderer/src/components/AskAgentPanel.tsx` — fluxo "Perguntar ao agente"
    com preview ao vivo do stream.
  - `src/renderer/src/components/Canvas.tsx` — atalho Cmd/Ctrl+K, estado
    `paletteOpen` e montagem do `CommandPalette`.
  - `src/main/projects/ProjectManager.ts` — múltiplos projetos (contexto para a
    lacuna de escopo).
- **Nota de método:** este documento descreve o comportamento do Maestri a partir
  da documentação pública e o do Orkestra a partir do código real; nenhuma
  afirmação de implementação do Orkestra foi inferida sem arquivo correspondente.
