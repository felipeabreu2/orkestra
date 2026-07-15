# Árvore de Arquivos — Análise 360° (Maestri → Orkestra)

> Documento de referência interno. Compara a funcionalidade **File Tree** (Árvore de Arquivos)
> do Maestri — o produto que inspira o Orkestra — com o estado atual do nó equivalente no
> Orkestra, e propõe um caminho de evolução. Baseado na documentação pública do Maestri
> (`https://www.themaestri.app/pt-br/docs/file-tree`, transcrita em 2026-07-15) e na leitura do
> código real do repositório.

---

## 1. Visão geral

A **Árvore de Arquivos** é um nó do canvas que funciona como um explorador de arquivos completo,
embutido no espaço de trabalho. A ideia central, tanto no Maestri quanto no Orkestra, é **não
precisar sair do canvas** para navegar pela estrutura do projeto: em vez de alternar para o Finder
ou para uma IDE externa, o desenvolvedor tem a árvore de pastas ali, ao lado dos terminais de
agentes, notas e portais.

No **Maestri**, esse nó é bem mais do que um navegador de pastas: é um mini-IDE. Ele oferece quatro
modos de visualização (lista, grade de ícones com miniaturas, diff de alterações não commitadas e
grafo de commits git), um editor de código nativo embutido, busca fuzzy por arquivo e busca por
conteúdo, operações git completas (commit, push, pull, checkout, branch, merge, fetch, stash) e
integração direta com os agentes (arrastar um arquivo para o terminal de um agente para dar
contexto, ou citar um trecho de código/diff direto no chat do agente). Cada instância da árvore
lembra independentemente o próprio estado — diretório exibido, pastas expandidas e modo de
visualização ativo — e pode haver várias no mesmo canvas.

No **Orkestra**, o nó já existe e cobre o núcleo de um explorador de IDE, porém deliberadamente
**somente-leitura** e num único modo (lista): navegação lazy pela árvore de pastas, overlay de
status git por cor/letra (M/A/D/?), e um preview textual do arquivo selecionado (truncado, com
detecção de binário). O próprio código reconhece, em comentário, que editor embutido e
arrastar-para-terminal são "refinamentos de ondas futuras" (ver
`src/renderer/src/components/FileTreeNode.tsx`, cabeçalho). Ou seja: o Orkestra tem a fundação
sólida e correta, mas ainda está distante da paridade de recursos com o Maestri.

---

## 2. Como funciona (no Maestri)

Esta seção descreve o comportamento documentado do Maestri — o alvo de referência.

### 2.1 Inserção e múltiplas instâncias

Seleciona-se a ferramenta **Árvore de Arquivos** na barra de ferramentas superior e clica-se/
arrasta-se no canvas para posicioná-la. A árvore abre por padrão no diretório de trabalho do
workspace. Pode haver **múltiplas árvores** no mesmo canvas, cada uma lembrando de forma
independente o próprio diretório, quais pastas estão expandidas e qual modo de visualização está
ativo.

### 2.2 Modos de visualização

A barra de ferramentas no topo do nó alterna entre quatro visualizações:

- **Lista** — Outline hierárquico, semelhante à visualização em lista do Finder do macOS. Suporta
  navegação para frente/trás e "Recolher Tudo".
- **Grade de ícones** — Visualização baseada em miniaturas. Imagens, PDFs e vídeos exibem
  pré-visualizações do Quick Look em vez de ícones genéricos.
- **Diff** — Alterações não commitadas lado a lado com o original (ver §2.7).
- **Graph** — O grafo de commits do repositório do workspace, com lanes de branch e as mesmas
  referências que se veria em `git log --graph`. Disponível quando o diretório da árvore está
  dentro de um repositório git.

### 2.3 Navegação e menu de contexto

A barra de ferramentas permite mudar o diretório raiz dinamicamente. Clicar com o botão direito em
um arquivo ou pasta abre um menu de contexto com operações de **criar, renomear, mover e excluir**.

### 2.4 Arrastar arquivos (para terminal ou canvas)

Arrastar um arquivo da árvore permite dois destinos:

- **Terminal de um agente** — compartilha o arquivo como **contexto** com o agente (na prática,
  insere o caminho no prompt/terminal do agente).
- **O canvas** — posiciona o arquivo como um **nó de pré-visualização nativo** (imagens, PDFs e
  vídeos são suportados).

Além disso, é possível arrastar arquivos **externos do Finder** diretamente sobre o terminal de um
agente ou sobre o canvas — sem precisar passar pela árvore.

### 2.5 Editor de código embutido

O Maestri traz um **editor de código nativo que vive dentro do próprio nó** de Árvore de Arquivos —
feito sob medida, para uma edição rápida sem sair do canvas nem abrir uma IDE externa. Abre-se de
duas formas: pelo **ícone do editor** ao lado do campo de busca (parte de baixo do nó) ou
escolhendo **Editor** no menu de visualização (topo do nó). Com o painel aberto, seleciona-se um
arquivo na árvore para carregá-lo. Recursos:

- Realce de sintaxe por linguagem;
- Localizar e substituir dentro do arquivo;
- Edição com múltiplos cursores;
- Fechamento automático de colchetes;
- Detecção inteligente de indentação (segue o estilo do arquivo);
- Operações de linha e "ir para a linha".

Fonte, tamanho de tabulação e atalhos são configuráveis nas **Configurações**. Ao selecionar
qualquer texto no editor, aparece um ícone de chat: clicá-lo **cita a seleção e a envia direto para
um agente conectado** — o caminho mais rápido de "dúvida sobre um trecho" para "mudança pronta".

### 2.6 Busca (⌘P e busca por conteúdo)

- **⌘P por nó**: com um nó de Árvore de Arquivos selecionado, pressionar `P` abre a busca restrita
  àquele nó — busca fuzzy em cada arquivo, resultados ordenados por relevância, `Enter` abre o
  melhor resultado direto no editor.
- **Busca por nome / por conteúdo**: o campo de busca na parte de baixo do nó normalmente filtra
  pelo nome do arquivo. Digitar `>` no início alterna para **busca por conteúdo**, varrendo o texto
  dentro dos arquivos do nó. Cada correspondência mostra o arquivo e a linha; clicar abre o arquivo
  no editor já posicionado na linha.

### 2.7 Diff com integração de agentes

A visualização de diff mostra as alterações não commitadas. Além de revisar, ela se integra aos
agentes: ao selecionar qualquer bloco de código no diff, aparece um ícone de chat que abre um
popover para **citar o bloco e pedir ao agente que explique ou refine**.

### 2.8 Consciência git (branch/commit/push/pull e mais)

Quando o workspace é um repositório git, a árvore mostra um **indicador de branch no topo**. Clicá-
lo abre um menu com operações git comuns, executadas **dentro do próprio Maestri** (sem trocar para
terminal ou cliente git externo):

- **Commit** — preparar (stage) e commitar;
- **Pull / Push** — sincronizar com o remoto;
- **Checkout** — mudar de branch;
- **New Branch** — criar branch a partir da atual;
- **Merge** — mesclar outra branch na atual;
- **Fetch** — buscar atualizações sem mesclar;
- **Stash** — guardar alterações não commitadas.

---

## 3. Pontos interessantes / diferenciais

- **Explorador como cidadão de primeira classe do canvas.** A árvore não é uma sidebar fixa: é um
  nó movível, redimensionável e replicável. Dá para ter uma árvore por subprojeto/pasta, cada uma
  com seu próprio estado — algo que uma IDE tradicional (uma única sidebar) não permite.
- **Ponte arquivo → agente.** O diferencial mais alinhado à proposta do produto: arrastar um
  arquivo para o terminal de um agente (contexto) ou citar um trecho do editor/diff direto no chat.
  Transforma o explorador de um utilitário passivo numa ferramenta de orquestração.
- **Quick Look nas miniaturas.** Aproveitar o Quick Look do macOS para renderizar previews de
  imagem/PDF/vídeo na grade de ícones é barato de implementar (API nativa) e de alto impacto visual.
- **Grafo git dentro do nó.** Trazer o `git log --graph` com lanes de branch para dentro do canvas
  reduz a fricção de alternar para um cliente git.
- **Editor nativo com "citar seleção".** O editor embutido fecha o loop: ler → editar → perguntar
  ao agente sem trocar de janela. A seleção-para-chat é o detalhe que amarra tudo.
- **Duas modalidades de busca no mesmo campo.** O toggle por `>` (nome → conteúdo) é uma convenção
  elegante (mesma ergonomia da paleta de comandos), e o ⌘P por nó dá busca fuzzy escopada.
- **Estado por instância.** Cada árvore lembra diretório, expansão e modo — importante para
  persistência ao fechar/reabrir e para múltiplas árvores conviverem sem se sobrescrever.

---

## 4. Como seria o backend

Independente de UI, os recursos acima se decompõem em quatro capacidades de processo principal
(main) expostas por IPC ao renderer. O Orkestra já implementa a primeira; as demais são o caminho
de evolução.

### 4.1 Leitura de filesystem (processo main)

O renderer nunca deve tocar `fs`/`child_process` diretamente (isolamento do Electron). O main expõe:

- `list(dir)` — leitura **não-recursiva** de um diretório (a árvore expande sob demanda no
  renderer), com pastas antes de arquivos e ordenação alfabética case-insensitive.
- `read(path)` — leitura **limitada** (ex.: primeiros 256 KB), com detecção de binário por byte NUL
  e flag de truncamento baseada no tamanho real do arquivo. Evita carregar arquivos gigantes em
  memória.
- Operações de **mutação** (para o menu de contexto): `create`, `rename`, `move`, `delete` —
  ausentes num explorador somente-leitura, necessárias para paridade. Exigem cuidado com caminhos
  (validar que estão dentro da raiz permitida) e confirmação para exclusão.

### 4.2 Watch de mudanças

Para a árvore refletir alterações feitas pelos agentes/editor em tempo real, o main precisa
observar o filesystem — via `chokidar` ou `fs.watch` — e emitir eventos IPC ("diretório X mudou")
para o renderer invalidar o cache daquele nível e recarregar. Pontos de atenção: **debounce** (build
tools geram rajadas de eventos), **ignorar** `node_modules`/`.git`/diretórios de saída, e escopar o
watcher ao diretório visível/expandido para não observar a árvore inteira.

### 4.3 Integração git

Tudo via `execFile('git', [...])` no main (sem shell, argumentos como allowlist):

- **Leitura**: `git status --porcelain` (overlay de status — já existe), `git log --graph`/
  `--pretty` (para o modo Graph), `git diff`/`git diff --cached` (para o modo Diff), `git branch`
  (indicador de branch atual e lista).
- **Escrita**: `commit`, `push`, `pull`, `checkout`, `branch`, `merge`, `fetch`, `stash`. As
  operações de rede (push/pull/fetch) dependem de **credenciais** — credential helper do git, chave
  SSH via ssh-agent — e podem exigir tratamento de prompts. Operações destrutivas (checkout com
  alterações pendentes, merge com conflito) precisam de confirmação e de reportar erro de forma
  legível.

Detalhe já resolvido no Orkestra e que deve ser mantido: rodar git com `-c core.quotePath=false`
para receber paths UTF-8 crus (senão nomes acentuados voltam C-escapados em octal e não casam com o
path real).

### 4.4 IPC

Cada capacidade vira um handler `ipcMain.handle(...)` no main e um método correspondente no bridge
do preload (`window.orkestra.*`). Erros de fs/git propagam como **rejeição** da Promise — o renderer
os recebe no `.catch()` e decide a recuperação (mostrar erro na árvore, toast etc.). O watch é a
exceção ao padrão request/response: usa `ipcRenderer.on(...)` (evento push do main → renderer) em
vez de `invoke`.

---

## 5. Estado atual no Orkestra

### 5.1 O que existe (com caminhos reais)

**Nó da árvore (renderer)** — `src/renderer/src/components/FileTreeNode.tsx` (~413 linhas) e
`src/renderer/src/components/FileTreeNode.css`:

- Navegação **lazy** por diretório: cada pasta expandida chama `window.orkestra.filetree.list(dir)`
  sob demanda; o resultado fica em `childrenCache` (Map) e a expansão em `expanded` (Set). Só existe
  entrada no cache depois que o usuário clica na pasta.
- **Overlay de status git** por cor + letra: `gitMarker()` mapeia o código do porcelain para
  `M` (modificado, `--warn`), `A` (adicionado, `--ok`), `D` (removido, `--err`) e `??` (untracked,
  `--text-3`, neutro). Códigos de rename/copy/conflito caem num marcador neutro em vez de serem
  ignorados.
- **Preview do arquivo**: clicar num arquivo substitui a árvore por um painel com o conteúdo textual
  (`filetree.read`), com estados de "carregando", "binário", "truncado" e "erro", além de botão
  "copiar caminho" e voltar (←).
- **Resolução da raiz**: usa `data.rootPath` se fixado; senão faz fallback para o `cwd` do **projeto
  ativo** (via `window.orkestra.projects.list()`), sem persistir esse fallback — ele "segue" o
  projeto ativo até o usuário fixar uma pasta pelo botão de pasta (`handleChooseFolder` →
  `updateFileTreeRoot`).
- **Header** com três botões: atualizar status git (`RefreshCw`), trocar pasta (`Folder`,
  `projects.pickDirectory`) e remover o nó (`X`). Empty-state "Nenhuma pasta. Escolha uma." quando
  não há raiz.
- **Redimensionável** (`NodeResizer`, mín. 220×160) e com `nowheel`/`nodrag` nas áreas roláveis para
  não virar zoom/pan do canvas.

**Backend (main)** — `src/main/filetree/FileTreeService.ts`:

- `list(dir)` — `readdir` não-recursivo, ordenado (pastas primeiro, alfabético case-insensitive).
- `read(path)` — lê no máximo `MAX_READ_BYTES = 256 KB`; detecta binário por byte NUL nos primeiros
  `BINARY_SNIFF_BYTES = 8 KB`; `truncated` reflete o tamanho real via `stat`.
- `gitStatus(dir)` — `git -c core.quotePath=false -C dir status --porcelain`, parseado para
  `{ path: 'M' | 'A' | '??' | ... }`; fora de repo git (ou git ausente) devolve `{}` (não é erro).
  **É a única operação git implementada, e é somente-leitura.**

**IPC e tipos**:

- `src/main/filetree/registerFileTreeIpc.ts` — três handlers: `filetree:list`, `filetree:read`,
  `filetree:gitStatus` (cada um delega 1:1 ao serviço).
- `src/preload/index.ts` — bridge `window.orkestra.filetree.{list, read, gitStatus}`; também expõe
  `window.orkestra.getPathForFile(file)` (via `webUtils`) e `window.orkestra.ide.open(path)`.
- `src/shared/filetree.ts` — tipo `FileEntry { name, path, isDir }`.
- `src/main/index.ts` — instancia `FileTreeService` e chama `registerFileTreeIpc` /
  `registerIdeIpc`.

**Registro no canvas / criação do nó**:

- `src/renderer/src/components/Canvas.tsx` — registra `nodeTypes.filetree` e `nodeTypes.file`; a
  ferramenta `pendingTool === 'filetree'` cria via `addFileTreeNode`; há também item de contexto
  "Árvore de arquivos aqui".
- `src/renderer/src/store/canvasStore.ts` — `addFileTreeNode` (300×360 por padrão), `addFileNode`,
  `updateFileTreeRoot` (persiste `rootPath` via serialize genérico do canvas).
- `src/renderer/src/components/Topbar.tsx` — botão da ferramenta "Árvore de arquivos".
- `src/renderer/src/palette/paletteCommands.ts` — comando "Criar Árvore de Arquivos".

**Nó de arquivo separado (clip)** — `src/renderer/src/components/FileNode.tsx`:

- Nó `type: 'file'` distinto da árvore: anexa **1 arquivo** ao canvas, mostrando nome/caminho e um
  preview textual (via `filetree.read`, cortado em 2000 chars). É o equivalente ao "arrastar arquivo
  para o canvas" do Maestri — mas hoje criado pela toolbar (`onFile`), **não** por arrastar da
  árvore.

**Abrir no editor externo** — `src/main/ide/openInEditor.ts` + `registerIdeIpc.ts`:

- `ide:open` tenta uma allowlist de editores (`code`, `cursor`, `subl`, `zed`, `idea`, `webstorm`,
  `pycharm`) e cai no gerenciador de arquivos do SO se nenhum responder. **Opera no nível de
  pasta**, não de arquivo, e não está conectado às linhas da árvore.

**Arrastar arquivos externos para o terminal** — `src/renderer/src/components/TerminalNode.tsx`
(+ `src/renderer/src/terminal/dropPaths.ts`):

- O `TerminalNode` aceita **drop de arquivos do Finder**: resolve os caminhos com `getPathForFile`,
  os aspa com `pathsToTerminalInput`/`quotePathForShell` e escreve no pty (`pty.write`). É o
  equivalente do "arrastar externo → terminal" do Maestri — mas só funciona para arquivos externos,
  **não** para arrastar de dentro do nó Árvore de Arquivos.

### 5.2 Gaps em relação ao Maestri

| Recurso do Maestri | Estado no Orkestra |
| --- | --- |
| Modo **Lista** | ✅ Único modo existente |
| Modo **Grade de ícones** (Quick Look) | ❌ Ausente |
| Modo **Diff** | ❌ Ausente |
| Modo **Graph** (git log --graph) | ❌ Ausente |
| **Editor de código embutido** | ❌ Só preview somente-leitura (256 KB, binário); editor externo é a nível de pasta |
| **Menu de contexto** (criar/renomear/mover/excluir) | ❌ Ausente — serviço é read-only |
| **Arrastar da árvore → terminal** | ❌ Só drop de arquivos externos no `TerminalNode` |
| **Arrastar da árvore → canvas** (preview node) | ⚠️ Existe `FileNode`, mas criado pela toolbar, não por drag da árvore |
| **Operações git** (commit/push/pull/checkout/branch/merge/fetch/stash) | ❌ Só `gitStatus` (leitura) |
| **Indicador de branch** no topo | ❌ Ausente (há botão de "atualizar status git") |
| **Watch de mudanças** (auto-refresh) | ❌ Ausente — refresh manual do git status; árvore não reage a mudanças em disco |
| **⌘P busca fuzzy por nó** | ❌ Ausente |
| **Busca por nome / conteúdo** (`>`) | ❌ Ausente (sem campo de busca no nó) |
| **Citar seleção/diff → agente** | ❌ Ausente |
| **Estado por instância** (dir/expansão/modo) | ⚠️ Parcial: `rootPath` persiste; expansão é só em memória; não há "modo" |

Bug conhecido documentado no próprio código: `relativeToRoot()` em `FileTreeNode.tsx` só resolve
corretamente quando a raiz da árvore **é** a raiz do repo; se a raiz for um **subdiretório** do
repo, as chaves do `gitStatus` (relativas à raiz do repo) não casam com os paths absolutos e o
overlay de status somem para arquivos aninhados.

### 5.3 Observações de infraestrutura reaproveitável

- **Não há CodeMirror/Monaco** no projeto (`package.json`): notas usam **TipTap** e terminais usam
  **xterm**. Um editor de código embutido exigiria adicionar CodeMirror (ideal para código). A
  infra de localizar/substituir existente (`src/renderer/src/notes/searchReplaceExtension.ts`,
  `findMatches.ts`, `NoteFindBar.tsx`) é específica de TipTap e **não** se reaproveita diretamente
  para um editor de código — mas o padrão de UI (barra de busca, contador de matches) sim.
- **Não há ripgrep/grep** no main hoje — a busca por conteúdo (`>`) precisaria de implementação
  nova (varrer arquivos do nó, ou integrar `rg`).
- O padrão de **drop → pty** já está pronto (`dropPaths.ts`), o que torna o "arrastar da árvore para
  o terminal" um item de baixo esforço.

---

## 6. Melhorias sugeridas para o Orkestra

Priorizadas por **valor × esforço**. As primeiras são "ganhos rápidos" que aproximam bastante a
experiência do Maestri com pouco código.

### Prioridade 1 — Alto valor, baixo esforço (fazer primeiro)

1. **Arrastar arquivo da árvore → terminal do agente.** Tornar as linhas de arquivo `draggable`,
   colocando o caminho absoluto no `dataTransfer`; o `TerminalNode` já sabe transformar caminhos em
   input de shell (`pathsToTerminalInput` em `dropPaths.ts`). É o diferencial mais alinhado ao
   produto e reaproveita infra existente. **Este é o item de maior ROI.**
2. **Abrir o arquivo selecionado no editor externo.** Estender `ide:open` (ou adicionar
   `ide:openFile`) para aceitar um caminho de arquivo e disparar em duplo-clique numa linha da
   árvore. Hoje `openInEditor` já resolve a allowlist de editores — falta só passar o arquivo em vez
   da pasta.
3. **Campo de busca por nome no rodapé do nó.** Filtro client-side sobre as entradas já carregadas
   (e as expandidas) — trivial, sem backend. Estabelece a UI onde depois entra o toggle `>` de
   conteúdo.
4. **Corrigir `relativeToRoot` para raiz = subdiretório do repo.** Resolver a raiz do repo (via
   `git rev-parse --show-toplevel`) e calcular o path relativo a partir dela, para o overlay de
   status git funcionar quando a árvore aponta para uma subpasta.

### Prioridade 2 — Alto valor, esforço médio

5. **Arrastar arquivo da árvore → canvas (preview node).** Conectar o drag da árvore ao
   `addFileNode` já existente; evoluir o `FileNode` para renderizar imagens/PDFs/vídeos (hoje só
   texto), aproximando do "nó de pré-visualização nativo" do Maestri.
6. **Indicador de branch + operações git de leitura.** Mostrar a branch atual no header (novo
   `git branch --show-current`) e adicionar o modo **Diff** (`git diff`) — leitura pura, mesmo
   padrão seguro de `execFile` já usado em `gitStatus`, sem risco de mutação.
7. **Watch de filesystem com auto-refresh.** `chokidar`/`fs.watch` no main emitindo eventos IPC para
   invalidar o cache do diretório afetado. Fecha o loop "agente editou → árvore reflete" sem refresh
   manual. Escopar aos diretórios expandidos e ignorar `node_modules`/`.git`.
8. **Persistir expansão por instância.** Salvar `expanded`/`childrenCache` (ou ao menos o conjunto
   de pastas abertas) em `data`, para a árvore reabrir no mesmo estado — o Maestri destaca "cada
   árvore lembra seu estado".

### Prioridade 3 — Alto valor, alto esforço

9. **Menu de contexto com mutação (criar/renomear/mover/excluir).** Requer novos métodos de escrita
   no `FileTreeService` + IPC + validação de caminho (dentro da raiz) + confirmação de exclusão.
   Rompe o design "read-only" atual, então precisa de cuidado com segurança.
10. **Editor de código embutido.** Adicionar CodeMirror ao projeto e um painel de editor dentro do
    nó (realce de sintaxe, find/replace, múltiplos cursores, auto-close, ir-para-linha). É o recurso
    mais caro, mas o que mais transforma o nó num mini-IDE.
11. **Operações git de escrita** (commit/push/pull/checkout/branch/merge/fetch/stash) via menu do
    indicador de branch. Alto valor, mas exige tratar credenciais (push/pull), conflitos e erros de
    forma legível.
12. **Citar seleção/diff → agente.** Depende do editor embutido e/ou do modo Diff; ao selecionar
    texto, oferecer "enviar ao agente conectado" (escreve a citação no pty do terminal ligado por
    edge). Amarra o explorador à orquestração de agentes — a essência do produto.

### Prioridade 4 — Valor incremental / cosmético

13. **Grade de ícones com Quick Look** (miniaturas de imagem/PDF/vídeo) — bom impacto visual, mas
    específico de macOS e não essencial ao fluxo de agentes.
14. **Modo Graph** (`git log --graph` com lanes de branch) — sofisticado; deixar por último.
15. **⌘P busca fuzzy por nó** e **busca por conteúdo** (`>`) — depende de indexar/varrer arquivos do
    nó (potencialmente via `rg`); ergonomia excelente, mas não bloqueante.

---

## 7. Referência

**Documentação Maestri (fonte primária):**

- Árvore de Arquivos — `https://www.themaestri.app/pt-br/docs/file-tree` (transcrita em 2026-07-15).

**Código do Orkestra citado (caminhos reais):**

- `src/renderer/src/components/FileTreeNode.tsx` — nó explorador (lazy, overlay git, preview).
- `src/renderer/src/components/FileTreeNode.css` — estilos do nó.
- `src/renderer/src/components/FileNode.tsx` — nó "clip" de arquivo único no canvas.
- `src/main/filetree/FileTreeService.ts` — `list` / `read` / `gitStatus` (somente-leitura).
- `src/main/filetree/registerFileTreeIpc.ts` — handlers `filetree:list|read|gitStatus`.
- `src/shared/filetree.ts` — tipo `FileEntry`.
- `src/preload/index.ts` — bridge `window.orkestra.filetree.*`, `ide.open`, `getPathForFile`.
- `src/main/ide/openInEditor.ts` + `src/main/ide/registerIdeIpc.ts` — abrir pasta no editor externo.
- `src/main/index.ts` — wiring do `FileTreeService` e dos IPCs.
- `src/renderer/src/components/Canvas.tsx` — registro dos `nodeTypes` (`filetree`, `file`).
- `src/renderer/src/store/canvasStore.ts` — `addFileTreeNode` / `addFileNode` / `updateFileTreeRoot`.
- `src/renderer/src/components/Topbar.tsx` — ferramenta "Árvore de arquivos".
- `src/renderer/src/palette/paletteCommands.ts` — comando "Criar Árvore de Arquivos".
- `src/renderer/src/components/TerminalNode.tsx` — drop de arquivos externos no terminal.
- `src/renderer/src/terminal/dropPaths.ts` — `quotePathForShell` / `pathsToTerminalInput`.

**Testes relacionados (leitura de apoio):**

- `src/main/filetree/FileTreeService.test.ts`, `src/main/filetree/registerFileTreeIpc.test.ts`,
  `src/main/ide/openInEditor.test.ts`.
