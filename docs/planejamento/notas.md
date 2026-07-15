# Plano de Implementação — Notas

> **Origem:** `docs/analise-maestri-360/notas.md` · **Status:** Rascunho pronto para revisão · **Onda(s):** 1 → 3

---

## 1. Objetivo & valor

Elevar o nó **Nota** do Orkestra da paridade "post-it rico" para a paridade estrutural do Maestri,
**sem regredir** os diferenciais que o Orkestra já tem (find/replace testado e 6 cores de post-it).

O modelo atual (verificado no código) é: a nota é um editor **TipTap/ProseMirror WYSIWYG** cujo
conteúdo é **HTML** persistido em `data.html` **dentro do snapshot JSON do canvas** (um arquivo por
projeto em `userData/projects/<id>.json`, gravado pelo `ProjectManager`). **NÃO** existe arquivo `.md`
em disco, **NÃO** existe toggle raw ↔ formatada, **NÃO** existe nome personalizado (o nome do agente
é sempre a 1ª linha), e o `orq context` só enxerga blocos **diretamente** ligados ao terminal (a
cadeia nota→nota não é percorrida).

O valor entregue, em ordem de retorno:

1. **Onda 1 — Nome personalizado + renomear** (`data.name`): melhora imediatamente a resolução por
   `--to` no `orq note write` (hoje casa por prefixo do texto e escreve na nota errada quando há
   duplicatas — ver memória `orq-note-write-targeting`).
2. **Onda 2 — Cadeia navegável de notas, indexação do corpo na Batuta, colar imagem, toggle raw**:
   destrava o "mapa mental de contexto" que o agente percorre sozinho e a edição de Markdown cru.
3. **Onda 3 — Notas `.md` em disco**: transforma a nota em **memória durável, portável e versionável**
   (git, edição externa, leitura pelas ferramentas nativas do agente) — o pilar de "memória
   compartilhada navegável" (§4.2 da análise).

---

## 2. Estado atual no código (verificado)

| Arquivo real | O que já faz | Relevância |
| --- | --- | --- |
| `src/renderer/src/components/NoteNode.tsx` | Monta o editor TipTap (`NOTE_EXTENSIONS` na linha 21: `StarterKit, TextStyle, Color, FontSize, FontFamily, Image, SearchReplace`). `onUpdate` (l. 36) persiste `editor.getHTML()` via `updateNoteHtml`. Migração lazy Markdown→HTML (l. 30, 42). Sync externo do agente (l. 55-60, `setContent(..., {emitUpdate:false})`). Cmd+F abre `NoteFindBar` (l. 64-69) + botão lupa (l. 89-100). | **Núcleo.** Onde entram: `data.name`, toggle raw, colar imagem. |
| `src/renderer/src/components/NoteFormatBar.tsx` | Barra de formatação no `NodeToolbar`: 6 swatches de cor (`updateNoteColor`), bold/italic/underline/strike/H1/listas/code, imagem **por URL** (l. 32-36, 63-86). | Ponto de UI para toggle raw e botão de colar imagem. |
| `src/renderer/src/components/NoteFindBar.tsx` | Localizar/substituir: contador `n/total`, próximo/anterior, Substituir, Tudo. Fonte da verdade é o componente (`collectMatches`). | **Diferencial — NÃO reimplementar.** Base p/ expor toggle case/acento. |
| `src/renderer/src/notes/findMatches.ts` (+ `.test.ts`) | Busca **pura e testada**: `findMatches(segments, term, caseSensitive)` → ranges `{from,to}`. Limitação v1: não cruza fronteira de formatação. | **Diferencial — NÃO reimplementar.** Modelo de "helper puro + teste" a seguir nas novas tasks. |
| `src/renderer/src/notes/searchReplaceExtension.ts` | Extensão ProseMirror que só **desenha** o destaque; `collectMatches(doc, term)` percorre nós de texto. | Diferencial existente; referência de padrão de extensão TipTap. |
| `src/renderer/src/notes/noteColors.ts` | 6 cores (`amarelo/rosa/azul/verde/roxo/laranja`) → tokens `--note-*`. `noteColorBg(color)`. | **Diferencial — NÃO reimplementar.** |
| `src/renderer/src/notes/noteEditorRegistry.ts` / `useNoteEditor.ts` | Registry editor↔barra (a barra alcança o editor da nota selecionada). | Reuso para toggle raw e colar imagem. |
| `src/renderer/src/markdown/markdown.ts` / `markdownToHtml.ts` | Parser Markdown próprio + serializador **Markdown→HTML** (usado só na migração e no texto do agente). **Não existe HTML→Markdown** (confirmado por grep: sem `turndown`/`toMarkdown`). | **Bloqueador** de toggle raw e `.md` em disco → precisa do serializador inverso. |
| `src/renderer/src/store/canvasStore.ts` | Ações `addNoteNode` (l. ~497: `data:{html:'',color:undefined}`, 240×180), `updateNoteContent`, `updateNoteHtml`, `updateNoteColor`. | Onde entra `updateNoteName`. |
| `src/renderer/src/hooks/useOrchestrationSync.ts` | Espelho do canvas p/ o main: nome da nota = `htmlToText(html).slice(0,40)` (l. 40-43), content = `htmlToText(html)` (l. 47-54). Aplica `updateNote`: resolve alvo por id **ou prefixo do texto** (l. 83-88), senão nota ligada à saída do `from`, senão `notes[0]` (l. 89-94). | **Núcleo** da resolução `--to` (Onda 1) e da indexação do corpo. |
| `src/renderer/src/context/contextBlock.ts` | `htmlToText(html)` via **DOMParser inerte** (SEC-1: nunca `innerHTML` — o HTML vem do disco sem sanitização e o renderer é privilegiado). `buildContextBlock(label, content)`. | Helper seguro reusado em nome/busca/serialização. |
| `src/main/orchestration/OrchestrationServer.ts` | `POST /note` (l. ~151-161) → emite `updateNote`. `GET /context` (l. ~333-357): monta `linked` **só com edges que tocam o terminal `from`** — **não percorre nota→nota**. | **Gap da cadeia** vive aqui. |
| `src/orq/orq.ts` | CLI: `orq note write [--to "<nome/id>"] "<conteúdo>"` (l. 56-74; parsing do `--to` l. 59-65); `orq context` (l. 45-55). | Superfície do agente; `--to` melhora com `data.name`. |
| `src/shared/orchestration.ts` | Tipo `updateNote { target; content; from? }` (l. 35). | Contrato do comando. |
| `src/main/projects/ProjectManager.ts` | Persiste `{version, nodes, edges}` inteiro via `JSON.stringify` (gravação atômica tmp+rename+fsync, self-heal). | `data.name` **persiste automaticamente** (é parte de `node.data`). |
| `src/renderer/src/components/TerminalNode.tsx` | Drop de arquivos do Finder (l. ~180-215): `dragover.preventDefault`, `window.orkestra.getPathForFile(f)`. | **Referência** p/ arrastar `.md` → nota. |
| `src/renderer/src/palette/paletteCommands.ts` (+ Batuta) | `buildPaletteItems` (puro, testado) gera os `PaletteItem`; hoje a nota vira `Nota: <primeiros chars>` e a busca só olha `label`. | **Cruza com o plano da Batuta** — indexar o corpo é feito lá; aqui só o helper de texto. |

---

## 3. Gaps priorizados

| Gap | Prioridade | Valor | Esforço | Onda |
| --- | --- | --- | --- | --- |
| Nome personalizado (`data.name`) + duplo-clique/menu Renomear | **P0** | Alto (paridade barata; melhora `--to`) | **S** | 1 |
| Resolução de `--to` por `data.name` (id → nome exato → prefixo do texto) | **P0** | Alto (corrige nota errada em duplicatas) | **S** | 1 |
| Serializador **HTML→Markdown** (habilitador de toggle raw e `.md` em disco) | **P1** | Alto (destrava 2 gaps) | **M** | 2 |
| Cadeia de notas navegável pelo agente (`orq context` percorre nota→nota) | **P1** | Alto ("mapa mental") | **M** | 2 |
| Indexar o **corpo** das notas na Batuta (cruza com plano da Batuta) | **P1** | Médio-alto | **S** (lado nota) | 2 |
| Colar imagem inline (data URI) | **P2** | Médio-alto (agente "vê") | **M** | 2 |
| Toggle raw ↔ formatada (ver HTML/Markdown) | **P2** | Médio | **M** | 2 |
| Arrastar `.md`/`.markdown`/`.txt` do Finder → nota | **P2** | Médio | **M** | 2-3 |
| Notas `.md` em disco (memória durável/versionável + watcher) | **P3** | Alto (estrutural) | **L** | 3 |
| Expor toggle case/acento na `NoteFindBar` (`findMatches` já aceita) | **P3** | Baixo | **S** | 2 |

---

## 4. Tarefas de implementação (TDD, em ordem)

> Convenção de teste: o projeto **não** tem React Testing Library. Toda lógica nova é extraída em
> **helpers puros** com teste `vitest`; o comportamento de componente é validado por **checklist
> manual** (`npm run dev`). Comandos: `npx vitest run <arquivo>`, `npm run typecheck`, `npm run lint`.

---

### T1 — Nome personalizado da nota (`data.name`) + derivação pura  [P0 · S · Onda 1]

- **Arquivos a tocar:**
  - `src/renderer/src/notes/noteName.ts` (novo)
  - `src/renderer/src/notes/noteName.test.ts` (novo)
  - `src/renderer/src/store/canvasStore.ts` (nova ação `updateNoteName`; tipo do store)
  - `src/renderer/src/hooks/useOrchestrationSync.ts` (usar o helper na derivação do nome do mirror, l. 40-43)
- **Passos TDD:**
  1. **Teste que falha** — `noteName.test.ts`, função `deriveNoteName(data)`:
     - `deriveNoteName({ name: 'Roadmap', html: '<p>outra coisa</p>' })` → `'Roadmap'` (nome fixo vence).
     - `deriveNoteName({ name: '  ', html: '<p>Primeira linha\nsegunda</p>' })` → `'Primeira linha'` (nome em branco → 1ª linha).
     - `deriveNoteName({ html: '' })` → `'Nota'` (fallback estável).
     - Trunca em 40 chars (paridade com o mirror atual).
  2. **Implementação** — `deriveNoteName(data: { name?: string; html?: string }): string`: se `data.name?.trim()` existir, retorna-o (truncado); senão `htmlToText(data.html ?? '')` → 1ª linha → truncada em 40 → ou `'Nota'`. Adicionar `updateNoteName(id, name)` no `canvasStore` (espelhar `updateNoteColor`, com `histPatch('notename:'+id)`; string vazia → apaga `data.name` para voltar à 1ª linha). Trocar a expressão inline de `useOrchestrationSync.ts` l. 40-43 por `deriveNoteName(n.data)`.
  3. **Verde** — `npx vitest run src/renderer/src/notes/noteName.test.ts` + `npm run typecheck`.
- **Critérios de aceite:**
  - `data.name` presente vence a 1ª linha em toda derivação de nome (mirror + `orq list`).
  - Limpar o nome (string vazia) volta à nomeação automática pela 1ª linha.
  - `data.name` persiste no `<id>.json` (é parte de `node.data`; nenhum código extra de serialização).
- **Notas:** manter o teto de 40 chars idêntico ao atual para não mudar o `orq list`. `htmlToText` já colapsa quebras — a "1ª linha" é o 1º trecho até `\n`.

---

### T2 — UI de renomear a nota (duplo-clique + menu)  [P0 · S · Onda 1]

- **Arquivos a tocar:**
  - `src/renderer/src/components/NoteNode.tsx` (input de nome oculto/condicional no topo do nó)
  - `src/renderer/src/components/NoteFormatBar.tsx` **ou** `NodeToolbar.tsx` (botão "Renomear" para a nota — hoje `rename()` no `NodeToolbar` só existe para terminal, l. 23-27, 37-41)
  - `src/renderer/src/components/nodes.css` (estilo do input de nome da nota)
  - `src/renderer/src/components/noteRename.ts` (novo) + `noteRename.test.ts` (novo) — helper puro se houver lógica de normalização
- **Passos TDD:**
  1. **Teste que falha** — `noteRename.test.ts`, `normalizeNoteName(raw)`: apara pontas, colapsa espaços internos, corta em 40, e string vazia → `''` (sinal de "voltar ao automático"). Caso: `normalizeNoteName('  Meu   Plano  ')` → `'Meu Plano'`.
  2. **Implementação** — em `NoteNode.tsx`, faixa de cabeçalho com um `<input class="ork-note-name-input nodrag">` (na `ork-note-drag` atual) que ao commit chama `updateNoteName(id, normalizeNoteName(v))`; abrir por **duplo-clique** no cabeçalho (`onDoubleClick`) e por um botão **Renomear** na barra da nota. Enter/blur confirma, Esc cancela.
  3. **Verde** — `npx vitest run src/renderer/src/components/noteRename.test.ts`.
- **Critérios de aceite (checklist manual `npm run dev`):**
  - Duplo-clique no cabeçalho da nota abre a edição do nome; Enter grava; o nome aparece no `orq list`.
  - Botão Renomear na barra faz o mesmo.
  - Apagar o texto e confirmar → nome volta a ser a 1ª linha.
- **Notas:** cuidar para o input ser `nodrag`/`nowheel` (senão o React Flow arrasta o nó ao selecionar texto — mesmo motivo do editor). Não colidir com o Cmd+F do editor.

---

### T3 — Serializador HTML→Markdown (habilitador)  [P1 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/markdown/htmlToMarkdown.ts` (novo)
  - `src/renderer/src/markdown/htmlToMarkdown.test.ts` (novo)
- **Passos TDD:**
  1. **Teste que falha** — cobre o subconjunto que o editor produz (o inverso de `markdownToHtml`):
     - `<h1>Título</h1>` → `# Título`
     - `<p>a <strong>b</strong> <em>c</em> <code>d</code></p>` → `a **b** *c* \`d\``
     - `<ul><li>x</li><li>y</li></ul>` → `- x\n- y`; `<ol><li>x</li></ol>` → `1. x`
     - `<a href="https://x">t</a>` → `[t](https://x)` (só href seguro, reusar `isSafeHref`)
     - **Round-trip fraco:** `htmlToMarkdown(markdownToHtml(src)).trim() === src.trim()` para amostras simples.
  2. **Implementação** — percorrer o DOM via **DOMParser inerte** (mesmo padrão SEC-1 de `contextBlock.ts` — nunca `innerHTML`); mapear tags → Markdown. Escopo v1 = o que o `StarterKit`+extensões emitem (heading, p, strong/em, code, ul/ol/li, a, br, `<img>` → `![](src)`). Nós desconhecidos → texto.
  3. **Verde** — `npx vitest run src/renderer/src/markdown/htmlToMarkdown.test.ts`.
- **Critérios de aceite:**
  - Round-trip estável para as marcas suportadas pela barra de formatação.
  - Nunca emite HTML cru nem href inseguro (paridade com `markdownToHtml`).
- **Notas:** documentar o subconjunto suportado no cabeçalho (como `findMatches.ts` documenta a limitação v1). Este helper é **pré-requisito** de T7 (toggle raw) e T9 (`.md` em disco).

---

### T4 — Cadeia de notas navegável pelo agente (`orq context` percorre nota→nota)  [P1 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/main/orchestration/noteChain.ts` (novo) + `noteChain.test.ts` (novo)
  - `src/main/orchestration/OrchestrationServer.ts` (usar o helper no `GET /context`, l. ~333-357)
- **Passos TDD:**
  1. **Teste que falha** — `collectContextNodeIds(mirror, terminalId)`:
     - Terminal→NotaA, NotaA→NotaB, NotaB→NotaC → retorna `[A, B, C]` (percorre a cadeia inteira).
     - **Sem ciclo infinito:** A→B, B→A → visita cada uma uma vez.
     - Não atravessa terminal→terminal como se fosse cadeia de contexto (só entra em nós não-terminais); arquivos/portais diretos continuam incluídos (paridade com hoje).
     - Direção do edge não importa (paridade com o comportamento atual).
  2. **Implementação** — BFS/DFS sobre `mirror.edges`: começa nos vizinhos diretos do terminal (como hoje), e a partir de cada **nota** visitada expande para outras **notas** ligadas (visitados em `Set` para evitar ciclo). Substituir o cálculo do `linked` inline no `/context` por `collectContextNodeIds`.
  3. **Verde** — `npx vitest run src/main/orchestration/noteChain.test.ts` + `npm run typecheck`.
- **Critérios de aceite:**
  - `orq context` de um terminal ligado à nota de entrada devolve o corpo de toda a cadeia, rotulado `[contexto — nota: <nome>]`, na ordem de travessia.
  - Cadeias com ciclo não travam.
  - Comportamento de arquivos/portais diretamente ligados permanece idêntico.
- **Notas:** manter o escopo de projeto (o servidor já responde 409 p/ projeto não-ativo antes de `/context`). Cuidar da ordem determinística (BFS) para o teste ser estável. Cruza com **`conexoes.md`** (a mesma ferramenta de Conexão liga nota↔nota).

---

### T5 — Indexar o corpo das notas na Batuta (cruza com o plano da Batuta)  [P1 · S (lado nota) · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/notes/noteSearchText.ts` (novo) + `noteSearchText.test.ts` (novo)
  - **NÃO** reimplementar a Batuta aqui — o campo `searchText` no `PaletteItem` e o filtro são do
    **plano da Batuta** (`docs/analise-maestri-360/batuta-search.md`, melhorias 2 e §"Indexar o corpo").
    Esta task entrega só o **helper de texto da nota** que a Batuta consome.
- **Passos TDD:**
  1. **Teste que falha** — `noteSearchText(data)`: devolve `nome + corpo` em texto plano para indexar.
     - Nota com `name: 'Roadmap'` e html com "lançar em agosto" → string contém `Roadmap` **e** `lançar em agosto`.
     - HTML vazio → string vazia (não indexa nó vazio).
  2. **Implementação** — `noteSearchText(data) = [deriveNoteName(data), htmlToText(data.html ?? '')].join(' ').trim()` (reusa T1 + `htmlToText`).
  3. **Verde** — `npx vitest run src/renderer/src/notes/noteSearchText.test.ts`.
- **Critérios de aceite:**
  - O helper expõe nome + corpo em texto plano; a integração de fato (alimentar `PaletteItem.searchText`) fica referenciada no plano da Batuta, sem duplicação aqui.
- **Notas:** **dependência de coordenação** com o plano da Batuta — combinar o nome do campo (`searchText`) para não divergir. Reusa `deriveNoteName` (T1).

---

### T6 — Colar imagem inline (data URI)  [P2 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/notes/imagePaste.ts` (novo) + `imagePaste.test.ts` (novo)
  - `src/renderer/src/components/NoteNode.tsx` (handler de `paste`/`drop` de imagem no editor)
- **Passos TDD:**
  1. **Teste que falha** — helper puro `pickImageFile(items)` (recebe uma lista tipo `DataTransferItem[]` simulada): retorna o 1º item de imagem (`type.startsWith('image/')`) ou `null`; e `isImageDataUri(s)` valida `data:image/...;base64,`.
  2. **Implementação** — no `NoteNode`, `editorProps.handlePaste`/`handleDrop`: se houver imagem, ler como `FileReader` → data URI → `editor.chain().focus().setImage({ src }).run()`. Manter o campo "imagem por URL" existente.
  3. **Verde** — `npx vitest run src/renderer/src/notes/imagePaste.test.ts`.
- **Critérios de aceite (checklist manual):**
  - Colar um print na nota insere a imagem inline; ela persiste (data URI no `data.html`).
  - `htmlToText` continua ignorando a imagem (contexto do agente = texto; a imagem "aparece" como no Maestri só quando houver `.md`+arquivo em T9).
- **Notas:** **risco de tamanho** — data URI incha o `<id>.json`; considerar limite de bytes e aviso. Migração real p/ arquivo só em T9 (disco). Não quebrar SEC-1 (a imagem entra por `setImage`, não por `innerHTML`).

---

### T7 — Toggle raw ↔ formatada (ver HTML/Markdown)  [P2 · M · Onda 2 · depende de T3]

- **Arquivos a tocar:**
  - `src/renderer/src/components/NoteNode.tsx` (estado `mode: 'wysiwyg' | 'raw'`; render condicional)
  - `src/renderer/src/components/NoteFormatBar.tsx` (botão de alternância)
  - `src/renderer/src/notes/noteRawSync.ts` (novo) + `noteRawSync.test.ts` (novo)
- **Passos TDD:**
  1. **Teste que falha** — `noteRawSync.test.ts` valida a ida-e-volta pura: `mdToHtml(htmlToMarkdown(html))` estável para as marcas suportadas (usa T3 + `markdownToHtml`); e que texto sem formatação sobrevive intacto.
  2. **Implementação** — no modo `raw`, mostrar um `<textarea nodrag nowheel>` com `htmlToMarkdown(data.html)`; ao voltar p/ formatada (ou onChange debounced), `updateNoteHtml(id, markdownToHtml(raw))`. Botão de toggle na barra.
  3. **Verde** — `npx vitest run src/renderer/src/notes/noteRawSync.test.ts`.
- **Critérios de aceite (checklist manual):**
  - Alternar formatada↔raw preserva o conteúdo das marcas suportadas (sem perda visível).
  - Editar Markdown cru no raw reflete na formatada ao alternar.
- **Notas:** **risco de perda** em marcas fora do subconjunto de T3 — documentar e, idealmente, avisar antes de descartar. Depende de T3.

---

### T8 — Arrastar `.md`/`.markdown`/`.txt` do Finder → nota  [P2 · M · Onda 2-3]

- **Arquivos a tocar:**
  - `src/renderer/src/notes/mdDropToNote.ts` (novo) + `mdDropToNote.test.ts` (novo)
  - `src/renderer/src/components/Canvas.tsx` (handler de drop de arquivo no canvas → cria nota; hoje só cria por ferramenta, l. 224)
  - **Referência de implementação:** o drop de arquivos do `TerminalNode.tsx` (l. ~180-215).
- **Passos TDD:**
  1. **Teste que falha** — `mdFileToNoteData(filename, text)`: `('plano.md', '# Plano\ntexto')` → `{ name: 'plano', html: markdownToHtml('# Plano\ntexto') }`; extensões aceitas `.md/.markdown/.txt`; outras → `null`.
  2. **Implementação** — no `Canvas`, `onDrop` com arquivos: para cada `.md/.markdown/.txt`, ler texto → `mdFileToNoteData` → `addNoteNode(pos, { ... })` populando `data.html`/`data.name`. (No modelo atual **copia o conteúdo**; "manter no local original" só faz sentido após T9.)
  3. **Verde** — `npx vitest run src/renderer/src/notes/mdDropToNote.test.ts`.
- **Critérios de aceite (checklist manual):**
  - Arrastar um `.md` do Finder para o canvas cria uma nota com o conteúdo renderizado e nome = arquivo.
- **Notas:** enquanto não houver disco (T9), o vínculo com o arquivo original **não** é mantido (diverge do Maestri, que aponta para o arquivo). Deixar claro na UI.

---

### T9 — Notas `.md` em disco (memória durável/versionável)  [P3 · L · Onda 3 · depende de T3]

- **Arquivos a tocar:**
  - `src/main/notes/NoteFileStore.ts` (novo) + `NoteFileStore.test.ts` (novo) — CRUD de `.md` na pasta do projeto, gravação atômica (espelhar `ProjectManager`), watcher (`fs.watch`) com debounce.
  - `src/main/notes/noteMarkdown.ts` (novo) — reuso do serializador (T3 no renderer; extrair o núcleo puro p/ compartilhar main/renderer se necessário) + parser Markdown já existente.
  - `src/shared/orchestration.ts` (novo campo `filePath?` no nó/nota, se optar por vínculo a arquivo)
  - `src/main/orchestration/OrchestrationServer.ts` (ler/gravar arquivo em vez de só espelho)
  - `src/renderer/src/components/NoteNode.tsx` / `NoteFormatBar.tsx` ("Mover para…", indicador de arquivo)
- **Passos TDD:**
  1. **Teste que falha** — `NoteFileStore.test.ts` (usa `os.tmpdir()`): `write(id, md)` grava o arquivo; `read(id)` devolve o conteúdo; edição externa do arquivo dispara callback do watcher; `move(id, newPath)` realoca; **semântica de exclusão**: `deleteFromCanvas(id)` com local personalizado **NÃO** apaga o arquivo (paridade Maestri).
  2. **Implementação** — gravar cada nota como `.md` (via T3 HTML→Markdown) na pasta do projeto; watcher reflete edição externa no canvas; tratar conflito de escrita (app × agente × editor externo) com "última escrita coordenada"/mtime. `orq context` passa a poder devolver o **caminho** (o agente lê com sua ferramenta nativa) — habilita o "agente vê a imagem".
  3. **Verde** — `npx vitest run src/main/notes/NoteFileStore.test.ts` + `npm run typecheck`.
- **Critérios de aceite:**
  - Uma nota vira um `.md` portável/versionável; editar o arquivo por fora reflete no canvas.
  - "Mover para…" realoca o arquivo; excluir a nota do canvas **não** apaga o arquivo em local personalizado.
  - Round-trip HTML↔Markdown sem perda para as marcas suportadas.
- **Notas:** **maior risco do plano** — conflito de escrita concorrente, watcher em loop, migração das notas legadas (HTML-no-JSON → `.md`), e imagens (data URI → arquivo ao lado). Provável **projeto próprio**; fatiar por incrementos (só leitura de disco → depois escrita → depois watcher → depois "Mover para…"). Cruza com **`arvore-arquivos.md`** e **`solucao-problemas.md`** (backup/self-heal).

---

### T10 (refino) — Expor toggle case/acento na `NoteFindBar`  [P3 · S · Onda 2]

- **Arquivos a tocar:** `src/renderer/src/components/NoteFindBar.tsx`, `src/renderer/src/notes/searchReplaceExtension.ts` (passar `caseSensitive` a `collectMatches`).
- **Passos TDD:** `findMatches` **já** cobre `caseSensitive` (ver `findMatches.test.ts`) — nenhum teste novo de lógica; adicionar 1 caso em `searchReplaceExtension` se o parâmetro passar a fluir. Checklist manual: toggle Aa liga/desliga sensibilidade e o contador reflete.
- **Critérios de aceite:** botão Aa na barra alterna `caseSensitive`; contador e destaque respeitam. **Não** reescrever a busca — só expor o parâmetro existente.
- **Notas:** barato; encosta no diferencial existente sem tocar a lógica pura.

---

## 5. Dependências & riscos

- **Ordem de habilitação:** T3 (HTML→Markdown) é pré-requisito de T7 (toggle raw) e T9 (`.md` disco).
  T1 (deriveNoteName) é reusado por T2, T5 e o mirror.
- **`--to` no `orq note write`:** hoje casa por **prefixo do texto** (`useOrchestrationSync.ts` l. 83-88)
  e retorna `ok` mesmo escrevendo na nota errada (memória `orq-note-write-targeting`). T1+T2 dão o
  `data.name` estável; recomenda-se, junto de T1, ajustar a resolução para **id → nome exato →
  prefixo do texto** (ordem determinística) — 1 caso de teste no helper de resolução.
- **Escopo de projeto:** todo comando `orq` é carimbado por projeto (`x-orkestra-project`, 409 se não
  ativo). Qualquer task no main (T4, T9) deve preservar esse gate — não regredir o incidente de
  corrupção cross-project.
- **Segurança (SEC-1):** o HTML da nota vem do disco **sem sanitização** e o renderer é privilegiado.
  Toda leitura de HTML (nome, busca, HTML→Markdown, colar imagem) usa **DOMParser inerte** — nunca
  `el.innerHTML`. T3/T6/T7 devem seguir isso à risca.
- **Inchaço do snapshot:** colar imagem como data URI (T6) engorda o `<id>.json`; mitigar com limite e
  migrar para arquivo em T9.
- **Concorrência de arquivo (T9):** app × agente × editor externo — maior risco; fatiar e adiar.
- **Cross-team:** T5 depende de alinhar o nome do campo `searchText` com o plano da **Batuta**.
- **Sem RTL:** componentes (T2, T6, T7, T8) validados por **checklist manual** (`npm run dev`); toda a
  lógica testável foi extraída em helpers puros.

---

## 6. Referências

- **Origem:** `docs/analise-maestri-360/notas.md` (seções 5 estado atual, 5.9 checklist de gaps, 6 melhorias).
- **Cruzamentos:** `docs/analise-maestri-360/batuta-search.md` (indexar o corpo das notas — T5),
  `docs/analise-maestri-360/conexoes.md` (ferramenta de Conexão nota↔nota — T4),
  `docs/analise-maestri-360/arvore-arquivos.md` e `solucao-problemas.md` (persistência/backup — T9),
  `docs/analise-maestri-360/ALEM-DO-MAESTRI-oportunidades.md` (§4.2 memória compartilhada navegável).
- **Código real citado (verificado neste plano):** `NoteNode.tsx`, `NoteFormatBar.tsx`,
  `NoteFindBar.tsx`, `notes/findMatches.ts` (+ `.test.ts`), `notes/searchReplaceExtension.ts`,
  `notes/noteColors.ts`, `notes/noteEditorRegistry.ts`/`useNoteEditor.ts`,
  `markdown/markdown.ts`/`markdownToHtml.ts` (só Markdown→HTML; sem inverso — confirmado),
  `store/canvasStore.ts`, `hooks/useOrchestrationSync.ts`, `context/contextBlock.ts` (`htmlToText`,
  SEC-1), `main/orchestration/OrchestrationServer.ts` (`POST /note`, `GET /context`), `orq/orq.ts`,
  `shared/orchestration.ts`, `main/projects/ProjectManager.ts`, `components/TerminalNode.tsx`
  (drop de arquivos), `components/NodeToolbar.tsx`, `palette/paletteCommands.ts`.
- **Memórias relevantes:** `orq-note-write-targeting` (resolução por `--to`),
  `incidente-corrupcao-cross-project` (escopo de projeto), `design-system-reformulacao` (tokens `--note-*`).
- **Comandos de verificação:** `npx vitest run <arquivo>`, `npm run typecheck`, `npm run lint`,
  app manual `npm run dev`.
