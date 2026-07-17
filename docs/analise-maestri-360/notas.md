# Notas — Análise 360° (Maestri → Orkestra)

> Documento de referência produzido a partir de duas fontes de verdade: (a) a documentação
> oficial do Maestri em <https://www.themaestri.app/pt-br/docs/notes> (transcrita integralmente
> na seção 7) e (b) o código real do Orkestra em `src/renderer/src/notes`,
> `src/renderer/src/components` e `src/main`. Nada aqui é suposição: onde o Orkestra difere do
> Maestri, o parágrafo aponta o arquivo e a linha que sustentam a afirmação.

---

## 1. Visão geral

No Maestri, uma **Nota** parece um post-it no canvas, mas por baixo é um **arquivo Markdown real
salvo no disco**. O produto embute um motor de Markdown completo com pré-visualização ao vivo, e
os **agentes conseguem ler e escrever** nessas notas através da CLI do Maestri. Ou seja: a nota é,
ao mesmo tempo, um artefato visual no canvas e um arquivo `.md` versionável/portável no sistema de
arquivos do usuário.

As capacidades que o Maestri anuncia para Notas são:

- Criação desenhando um retângulo com a ferramenta **Nota** (gera um `.md` na pasta do Maestri).
- **Dois modos de visualização** por nota: **Raw** (editor de texto puro, escreve-se Markdown) e
  **Formatada** (preview renderizado ao vivo — tabelas, títulos, blocos de código, negrito, etc.).
- **Imagens inline** coladas direto na nota (visíveis também para os agentes conectados).
- **Nome personalizado**, estável, sobrepondo o nome automático derivado da primeira linha.
- **Encadeamento de notas** (nota↔nota) formando uma hierarquia tipo mapa mental que o agente
  conectado à nota de entrada consegue percorrer inteira.
- **Local personalizado do arquivo** ("Mover para…"), permitindo salvar a nota dentro do projeto.
- **Arrastar `.md`, `.markdown` ou `.txt` do Finder** para o canvas, mantendo o arquivo no lugar.
- Remoção com **⌘W** (apaga a nota do canvas **e** o arquivo subjacente).

O Orkestra tem uma feature equivalente (o nó `note`), mas com uma **arquitetura diferente**: a nota
é um editor **rich-text WYSIWYG (TipTap/ProseMirror)** cujo conteúdo é **HTML persistido dentro do
snapshot JSON do canvas** — não um arquivo `.md` no disco. As seções 4 e 5 detalham as
consequências dessa escolha.

---

## 2. Como funciona (no Maestri)

### 2.1 Markdown com preview + imagens

Cada nota do Maestri é um arquivo Markdown com **duas visualizações** alternáveis pela barra de
ferramentas contextual no topo da nota:

- **Raw** — editor de texto simples; o usuário digita a sintaxe Markdown diretamente.
- **Formatada** — preview renderizado em tempo real (tabelas, títulos, blocos de código, negrito,
  itálico, etc.).

Imagens podem ser **coladas direto** na nota. Na visualização formatada elas aparecem como prévia
visual; na Raw aparecem como a sintaxe Markdown (`![...](...)`). Como o arquivo é Markdown real, os
**agentes conectados também "veem" essas imagens**, o que facilita compartilhar contexto visual com
os assistentes de IA.

### 2.2 Toggle raw ↔ formatada

O alternador raw/formatada é a peça central da UX: escreve-se Markdown "à mão" no modo Raw e
confere-se o resultado no modo Formatada, sem sair da nota. Isso mantém o arquivo em disco como
Markdown limpo e legível por humanos e por ferramentas de linha de comando.

### 2.3 Arrastar `.md` do Finder

Além de criar notas em branco, o usuário pode **arrastar arquivos `.md`, `.markdown` ou `.txt`
diretamente do Finder** para o canvas e passar a tratá-los como notas — **mantendo-os no local
original** (o Maestri não copia o arquivo para a pasta interna nesse caso).

### 2.4 Nome e caminho personalizados

- **Nome:** por padrão o nome da nota é derivado da **primeira linha** do texto. Para fixar um nome
  estável que não mude ao editar o conteúdo, dá-se **duplo clique no cabeçalho** da nota ou
  **botão direito → Renomear**. Limpar o nome no popover de renomeação **volta** à nomeação
  automática pela primeira linha.
- **Caminho (local do arquivo):** por padrão a nota vive na pasta interna do Maestri. Pela barra
  contextual, **Mover para…** escolhe um caminho arbitrário (ex.: dentro do projeto). Detalhe
  importante de semântica: se depois a nota for **excluída do canvas**, o arquivo em local
  personalizado **NÃO** é removido do disco (só o vínculo com o canvas some).

### 2.5 Cadeia de notas (nota ↔ nota)

Notas podem ser **conectadas a outras notas** usando a **mesma ferramenta de Conexão** dos
terminais — um "cabo" une as notas. Quando um agente está conectado à **nota de entrada** da cadeia,
ele consegue **acessar a cadeia inteira**. É o mecanismo do Maestri para organizar grandes volumes
de contexto numa estrutura de mapa mental que o agente navega sozinho.

### 2.6 Busca / find-replace e cores

A documentação pública transcrita (seção 7) **não descreve** uma barra de busca/find-replace nem um
seletor de cores para notas — esses dois itens fazem parte do escopo do Orkestra (ver seção 5) e
entram aqui como paralelo de análise, não como recurso documentado do Maestri.

### 2.7 Remoção

Selecionar a nota e apertar **⌘W** remove a nota do canvas **e apaga o arquivo `.md` subjacente**
(exceto o caso do local personalizado descrito em 2.4).

---

## 3. Pontos interessantes / diferenciais

1. **Nota = arquivo de verdade.** O grande diferencial do Maestri é que a nota não é um blob preso
   dentro do estado do app: é um `.md` no disco. Isso a torna portável, versionável (git), editável
   por qualquer editor externo, e — crucialmente — **legível/escrevível pelos agentes com suas
   próprias ferramentas de arquivo**, não só por uma API do app.

2. **Preview ao vivo com toggle raw.** Manter Markdown cru como fonte da verdade (e não HTML) é o
   que permite que o conteúdo continue limpo para humanos e para a CLI. O toggle raw/formatada é o
   que casa "arquivo limpo em disco" com "conforto de WYSIWYG".

3. **Imagens que o agente enxerga.** Colar imagem e o agente conseguir "ver" transforma a nota num
   canal de contexto multimodal, não só textual.

4. **Cadeia de notas navegável pelo agente.** Conectar notas entre si e o agente percorrer a cadeia
   inteira a partir da nota de entrada é um padrão poderoso de "mapa mental de contexto" — escala
   contexto grande sem estufar um único prompt.

5. **Nome estável desacoplado do conteúdo.** Nome automático pela primeira linha é ótimo para
   rascunhos; poder fixar um nome estável (e reverter limpando o campo) é o refinamento que evita que
   o rótulo "dance" enquanto se edita o corpo.

6. **Semântica cuidadosa de exclusão.** A distinção "excluir do canvas ≠ apagar o arquivo" no caso
   do local personalizado mostra respeito pelo dado do usuário — evita perda acidental de arquivos
   que vivem dentro do projeto dele.

---

## 4. Como seria o backend

Comparando os dois modelos possíveis (o do Maestri e o atual do Orkestra):

### 4.1 Persistência: disco vs. estado

- **Modelo Maestri (arquivos `.md` no disco):** cada nota é um arquivo. Cria → grava `.md`; edita →
  reescreve o arquivo; "Mover para…" → move/realoca o arquivo; arrastar do Finder → aponta para um
  arquivo existente sem copiar. Vantagens: portabilidade, git, edição externa, e agentes lendo com
  ferramentas nativas de arquivo. Custo: precisa de um **watcher** (fs.watch) para refletir edições
  externas no canvas, precisa lidar com renomeação/movimentação/exclusão de arquivos e com conflitos
  de escrita simultânea (app × agente × editor externo).

- **Modelo Orkestra (HTML no snapshot do canvas):** o conteúdo da nota é HTML dentro de `data.html`
  do nó, e todo o canvas é serializado num único JSON por projeto. Vantagens: simplicidade, undo/redo
  unificado, um único ponto de gravação atômica. Custo: a nota **não existe como arquivo** — não é
  portável nem versionável isoladamente, o agente não a lê com ferramentas de arquivo (só via a
  ponte `orq context`/`orq note write`), e não dá para "arrastar um `.md` do Finder" nem "Mover
  para…".

### 4.2 Editor: Markdown/raw vs. TipTap/CodeMirror

- O Maestri usa **Markdown como fonte da verdade** com toggle raw ↔ preview. Um backend nesse estilo
  normalmente combina um editor de texto (ex.: **CodeMirror** no modo raw) com um renderizador
  Markdown para o preview — mantendo o `.md` limpo.
- O Orkestra usa **TipTap (ProseMirror)** como editor único WYSIWYG, cuja fonte de verdade é **HTML**.
  O Markdown só entra em dois pontos-ponte (ver 5.4): migração de notas antigas e conversão do texto
  que o agente escreve. Para o Orkestra migrar ao modelo "arquivo `.md`", precisaria de um
  serializador **HTML→Markdown** confiável (hoje só existe o caminho inverso, Markdown→HTML) e de um
  editor com toggle raw.

### 4.3 Sincronização (app ↔ agente ↔ arquivo)

- **Maestri:** o arquivo em disco é o ponto de encontro; o app observa o arquivo e o agente
  lê/escreve o arquivo. Sincronização "natural" via filesystem (com os cuidados de watcher/conflito).
- **Orkestra:** a sincronização é **explícita e em memória**, por um servidor de orquestração HTTP
  local. O renderer envia um "espelho" leve do canvas ao main (`useOrchestrationSync`), o agente lê
  via `orq context` (que devolve o texto das notas conectadas) e escreve via `orq note write` →
  `POST /note` → comando `updateNote` → volta ao renderer e atualiza o HTML da nota em tempo real. É
  robusto para o caso app↔agente, mas **não** cobre edição por ferramentas externas de arquivo,
  porque não há arquivo.

---

## 5. Estado atual no Orkestra

Resumo: o Orkestra tem um nó `note` funcional, rico em edição (rich-text, cores, find/replace,
imagem por URL) e integrado aos agentes via a ponte de orquestração — mas persiste **HTML em estado
serializado**, não arquivos `.md`. Vários recursos do Maestri (toggle raw, arrastar `.md`, nome/local
custom, cadeia navegável) **não existem** hoje.

### 5.1 Criação da nota

- Ferramenta **"Nova nota"** na `Topbar` (`src/renderer/src/components/Topbar.tsx:131-133`), modo
  `note`. O usuário desenha o retângulo e `Canvas.tsx` chama `addNoteNode(pos, opts)` com
  largura/altura arrastadas (`src/renderer/src/components/Canvas.tsx:228`). Também há **"Nova nota
  aqui"** no menu de contexto (`Canvas.tsx:267`) e uma ação na `CommandPalette`
  (`src/renderer/src/components/CommandPalette.tsx:127`).
- O nó nasce com `data: { html: '', color: undefined }`, 240×180 por padrão
  (`src/renderer/src/store/canvasStore.ts:497-511`, ação `addNoteNode`).

### 5.2 Editor (TipTap, não Markdown com toggle)

- O componente `NoteNode` (`src/renderer/src/components/NoteNode.tsx`) monta um editor **TipTap**
  com as extensões `StarterKit, TextStyle, Color, FontSize, FontFamily, Image, SearchReplace`
  (`NoteNode.tsx:21`). É **WYSIWYG puro**: **não existe** o toggle **raw ↔ formatada** do Maestri.
- A cada edição, `onUpdate` persiste `editor.getHTML()` via `updateNoteHtml`
  (`NoteNode.tsx:36` → `canvasStore.ts:601-605`).
- **Barra de formatação** (`src/renderer/src/components/NoteFormatBar.tsx`), renderizada no
  `NodeToolbar` e ligada ao editor da nota selecionada via um registry
  (`src/renderer/src/notes/noteEditorRegistry.ts` + `useNoteEditor.ts`): negrito, itálico,
  sublinhado, tachado, título (H1), lista, lista numerada, código, imagem e o seletor de cores.

### 5.3 Cores (post-it)

- 6 cores em `src/renderer/src/notes/noteColors.ts`: amarelo, rosa, azul, verde, roxo, laranja —
  mapeadas para tokens CSS `--note-*` (tints de papel independentes de tema, definidos na
  reformulação de 2026-07-14). Aplicadas por `updateNoteColor`
  (`canvasStore.ts:606-610`) e pelos swatches em `NoteFormatBar.tsx:41-50`.

### 5.4 Markdown: só como ponte (migração + agente)

- Existe um parser Markdown próprio (`src/renderer/src/markdown/markdown.ts`, com
  `parseBlocks`/`parseInline` e `isSafeHref`) e um serializador **Markdown→HTML**
  (`src/renderer/src/markdown/markdownToHtml.ts`). Ele **não** é o editor: é usado apenas em
  (a) **migração** de notas antigas que guardavam `content` em Markdown → HTML na 1ª montagem
  (`NoteNode.tsx:30` e `42`) e (b) conversão do texto que o **agente** escreve
  (`useOrchestrationSync.ts:94`, `markdownToHtml(cmd.content)`).
- **Não existe** o caminho inverso (HTML→Markdown); logo, hoje o Orkestra não conseguiria exportar a
  nota como `.md` limpo sem escrever esse serializador.

### 5.5 Busca / find-replace (existe — diferencial do Orkestra)

- **⌘F** abre a `NoteFindBar` (`src/renderer/src/components/NoteFindBar.tsx`), disparado pelo
  keydown do editor (`NoteNode.tsx:64-69`) ou por um botão de lupa quando a nota está selecionada
  (`NoteNode.tsx:89-100`).
- A lógica de match é pura e testada: `findMatches` sobre os segmentos de texto do documento
  (`src/renderer/src/notes/findMatches.ts`, testes em `findMatches.test.ts`), e o destaque é uma
  extensão ProseMirror `SearchReplace` que desenha as decorations (`ork-find-current`/`ork-find-match`)
  a partir do termo + índice atual (`src/renderer/src/notes/searchReplaceExtension.ts`).
- Suporta próximo/anterior, contador `n/total`, **Substituir** e **Substituir tudo**
  (`NoteFindBar.tsx`). **Limitação conhecida (v1):** um match que atravessa uma fronteira de
  formatação (ex.: `he**ll**o` procurando `hello`) **não** é encontrado — está documentado no
  cabeçalho de `findMatches.ts`.

### 5.6 Imagens

- Inserção de imagem é **por URL**, via um campo inline na barra de formatação
  (`NoteFormatBar.tsx:63-86`, extensão `Image` do TipTap). **Não** há **colar imagem** direto na nota
  como no Maestri, nem armazenamento/embed do binário — só a URL.

### 5.7 Integração com agentes (leitura/escrita)

- **Leitura:** o renderer envia um espelho do canvas ao main (`useOrchestrationSync.ts:36-65`); para
  notas, `name` = texto da 1ª linha (`htmlToText(html)`, cortado em 40 chars) e `content` = texto
  legível da nota (`htmlToText`). O agente puxa isso com `orq context`, que reúne o conteúdo dos
  blocos **conectados ao terminal** (`src/main/orchestration/OrchestrationServer.ts:345-349`).
- **Escrita:** `orq note write [--to "<nome/id>"] "<conteúdo>"` (`src/orq/orq.ts:56-69`) →
  `POST /note` (`OrchestrationServer.ts:151-161`) → comando `updateNote`
  (`src/shared/orchestration.ts:35`) → `useOrchestrationSync.ts:78-94` resolve a nota-alvo (por
  id/nome, ou a nota ligada à saída do terminal `from`, ou a primeira nota) e aplica
  `updateNoteHtml(markdownToHtml(cmd.content))`. A mudança externa é refletida no editor em tempo real
  (`NoteNode.tsx:55-60`, `editor.commands.setContent(..., { emitUpdate: false })`).

### 5.8 Persistência

- Não há arquivos `.md`. A nota vive no snapshot do canvas, persistido por projeto em
  `userData/projects/<id>.json` pelo `ProjectManager` (`src/main/projects/ProjectManager.ts`), com
  gravação atômica (tmp + rename + fsync) e self-heal/backup de canvases corrompidos. O conteúdo da
  nota (`data.html`, `data.color`) segue o mesmo `serialize()` genérico dos demais nós.

### 5.9 Gaps do Orkestra vs. Maestri (checklist)

| Recurso do Maestri | Estado no Orkestra |
| --- | --- |
| Nota = arquivo `.md` no disco | **Ausente** — HTML no snapshot do canvas |
| Toggle raw ↔ formatada | **Ausente** — só WYSIWYG (TipTap) |
| Colar imagem inline (agente vê) | **Parcial** — só imagem por URL, sem paste |
| Nome personalizado / renomear nota | **Ausente** — nome sempre = 1ª linha |
| Local personalizado ("Mover para…") | **Ausente** — não há arquivo |
| Arrastar `.md`/`.markdown`/`.txt` do Finder | **Ausente** para notas (existe drop de arquivos em terminal) |
| Cadeia de notas navegável pelo agente | **Ausente** — `orq context` só pega blocos diretamente ligados ao terminal, sem percorrer nota→nota |
| Remover apaga o arquivo | **N/A** — remove só do canvas (não há arquivo) |
| Busca / find-replace na nota | **Presente** (diferencial do Orkestra) |
| Cores de post-it | **Presente** (6 cores) |
| Agente lê/escreve a nota | **Presente** via `orq context` / `orq note write` |

---

## 6. Melhorias sugeridas para o Orkestra

Priorizadas por **valor × esforço** (alto valor / baixo esforço primeiro).

### Prioridade alta (alto valor, esforço baixo–médio)

1. **Nome personalizado + renomear nota (paridade barata).** Hoje o nome é sempre a 1ª linha
   (`useOrchestrationSync.ts:40-43`). Adicionar `data.name` opcional na nota + duplo-clique/menu para
   renomear (e limpar → volta à 1ª linha) replica o comportamento do Maestri com pouco código; melhora
   muito a resolução por `--to` no `orq note write`. *Valor alto, esforço baixo.*

2. **Colar imagem inline.** Estender o `NoteNode`/TipTap para aceitar paste de imagem (handler de
   `paste`), guardando como data URI (ou, quando existir disco, como arquivo). Aproxima do "agente vê
   a imagem" do Maestri. *Valor médio-alto, esforço baixo-médio.*

3. **Cadeia de notas navegável pelo agente.** Fazer o `orq context` **percorrer recursivamente** as
   notas ligadas entre si a partir da nota conectada ao terminal (hoje `OrchestrationServer.ts:345`
   só considera blocos diretamente ligados). É o recurso de "mapa mental" do Maestri e casa
   perfeitamente com o modelo de canvas já existente. *Valor alto, esforço médio.*

### Prioridade média (alto valor, esforço maior)

4. **Persistir notas como arquivos `.md` no disco (o diferencial estrutural do Maestri).** Escrever
   cada nota como `.md` na pasta do projeto/app, com watcher para refletir edições externas. Requer o
   serializador **HTML→Markdown** (inexistente hoje) e tratamento de conflito de escrita
   (app × agente × editor externo). Habilita portabilidade, git e leitura por ferramentas nativas do
   agente. *Valor alto, esforço alto — provável projeto próprio.*

5. **Toggle raw ↔ formatada.** Depende de (4) ou pelo menos de um HTML↔Markdown confiável; oferece um
   modo de edição de Markdown cru ao lado do WYSIWYG. *Valor médio, esforço médio-alto.*

6. **"Mover para…" (local personalizado do arquivo).** Só faz sentido após (4). Incluir a semântica
   cuidadosa do Maestri: excluir a nota do canvas **não** apaga o arquivo em local personalizado.
   *Valor médio, esforço médio (depende de 4).*

7. **Arrastar `.md`/`.markdown`/`.txt` do Finder → nota.** Já existe drop de arquivos no
   `TerminalNode` (`TerminalNode.tsx:188-208`) como referência de implementação; faltaria criar um nó
   `note` apontando para o arquivo (idealmente ligado ao modelo de arquivo real de (4)). *Valor médio,
   esforço médio.*

### Prioridade baixa (refinamentos)

8. **Find/replace que cruza fronteiras de formatação.** Remover a limitação v1 documentada em
   `findMatches.ts` (buscar sobre o texto concatenado do bloco, não segmento a segmento). *Valor
   baixo-médio, esforço médio.*

9. **Busca com sensibilidade a maiúsculas/acento na UI.** `findMatches` já aceita `caseSensitive`,
   mas a `NoteFindBar` não expõe o toggle — expor case/acento é barato. *Valor baixo, esforço baixo.*

10. **Tabelas e blocos de código ricos.** O Maestri renderiza tabelas no preview; o `StarterKit` do
    TipTap não traz tabela por padrão. Adicionar a extensão de tabela aproxima a paridade de
    formatação. *Valor baixo-médio, esforço baixo.*

---

## 7. Referência

### 7.1 Documentação oficial do Maestri (transcrição integral)

Fonte: <https://www.themaestri.app/pt-br/docs/notes>

> **Notas**
>
> "As notas parecem simples post-its no canvas, mas por baixo são arquivos markdown reais salvos no
> disco. O Maestri inclui um motor de markdown completo com pré-visualização ao vivo — e os agentes
> podem ler e escrever nelas através da CLI do Maestri."
>
> [Imagem: Uma nota no canvas do Maestri exibindo conteúdo markdown na visualização formatada]
>
> **Criando uma nota**
>
> Selecione a ferramenta **Nota** na barra de ferramentas superior e desenhe um retângulo no canvas.
> Um novo arquivo `.md` é criado na pasta de armazenamento do Maestri e fixado no canvas.
>
> **Visualizações raw e formatada**
>
> Cada nota tem dois modos de visualização, alternados pela **barra de ferramentas contextual** no
> topo da nota:
>
> - **Raw** — Um editor de texto simples. Escreva markdown diretamente.
> - **Formatada** — Uma pré-visualização renderizada. Tabelas, títulos, blocos de código, negrito,
>   itálico — tudo renderizado em tempo real.
>
> **Imagens inline**
>
> Cole imagens diretamente em uma nota. Na visualização formatada elas são renderizadas como prévia
> visual; na visualização raw aparecem como sintaxe markdown. Agentes conectados também podem ver
> essas imagens, facilitando o compartilhamento de contexto visual com seus assistentes de IA.
>
> **Nomes personalizados para notas**
>
> Por padrão, o nome de uma nota é derivado da sua primeira linha de texto. Para definir um nome
> estável que não mude quando você editar o conteúdo, dê um duplo clique no cabeçalho da nota ou
> clique com o botão direito → **Renomear**.
>
> **Dica**
>
> Limpe um nome personalizado no popover de renomeação para voltar à nomeação automática baseada na
> primeira linha.
>
> **Encadeamento de notas**
>
> Notas podem ser conectadas a outras notas para criar uma hierarquia. Conecte uma nota a outra
> usando a mesma ferramenta de Conexão que você usaria para terminais — um cabo as une.
>
> Quando um agente está conectado à nota de entrada, ele pode acessar a cadeia inteira. Isso é útil
> para organizar grandes quantidades de contexto em uma estrutura de mapa mental que o agente
> consegue navegar.
>
> **Local personalizado para o arquivo**
>
> Por padrão, as notas são armazenadas na pasta interna do Maestri. Para salvar uma nota em um local
> específico no seu projeto:
>
> 1. Abra a barra de ferramentas contextual da nota.
> 2. Selecione **Mover para...** e escolha um caminho.
>
> O arquivo fica naquele local a partir desse momento. Importante: se você excluir a nota do canvas
> depois, o arquivo **não** é removido do local personalizado.
>
> **Nota**
>
> Você também pode arrastar arquivos `.md`, `.markdown` ou `.txt` do Finder diretamente para o canvas
> para trabalhar com eles como notas, mantendo-os no local original.
>
> **Removendo uma nota**
>
> Para remover uma nota do canvas, selecione-a e pressione ⌘W. A nota e o arquivo subjacente são
> excluídos.

### 7.2 Arquivos reais do Orkestra citados

- `src/renderer/src/components/NoteNode.tsx` — nó da nota (editor TipTap, migração, sync do agente, ⌘F).
- `src/renderer/src/components/NoteFormatBar.tsx` — barra de formatação (marcas, cores, imagem por URL).
- `src/renderer/src/components/NoteFindBar.tsx` — barra de localizar/substituir.
- `src/renderer/src/notes/noteColors.ts` — as 6 cores de post-it (tokens `--note-*`).
- `src/renderer/src/notes/findMatches.ts` (+ `findMatches.test.ts`) — busca pura e testada.
- `src/renderer/src/notes/searchReplaceExtension.ts` — extensão ProseMirror do destaque de busca.
- `src/renderer/src/notes/noteEditorRegistry.ts` / `useNoteEditor.ts` — ponte editor ↔ barra de formatação.
- `src/renderer/src/markdown/markdown.ts` / `markdownToHtml.ts` — parser + serializador Markdown→HTML (só ponte/migração).
- `src/renderer/src/store/canvasStore.ts` — ações `addNoteNode`, `updateNoteHtml`, `updateNoteColor`, `updateNoteContent`.
- `src/renderer/src/hooks/useOrchestrationSync.ts` — espelho do canvas + aplicação do comando `updateNote`.
- `src/renderer/src/components/Canvas.tsx` / `Topbar.tsx` / `CommandPalette.tsx` — gatilhos de criação da nota.
- `src/main/orchestration/OrchestrationServer.ts` — `POST /note`, `orq context`, derivação de `nota`.
- `src/orq/orq.ts` — CLI `orq note write`.
- `src/shared/orchestration.ts` — tipo do comando `updateNote`.
- `src/main/projects/ProjectManager.ts` — persistência do canvas (JSON por projeto), onde a nota é salva.
