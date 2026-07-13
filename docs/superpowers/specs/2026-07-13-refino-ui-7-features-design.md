# Refino de UI — 7 features (barra, cordas, barras contextuais, notas ricas, terminal, novos nós, contexto)

- **Data:** 2026-07-13
- **Origem:** `docs/features.md` + referências visuais `docs/images/1.png`–`7.png`
- **Objetivo:** aproximar a UI do Orkestra do design de referência (o "novo sistema" mostrado nas imagens), copiando layout e comportamento, e implementando de fato as funções novas que a barra sugere.

## Contexto

O Orkestra já é um app Electron completo: canvas React Flow (`Canvas.tsx`) com nós `terminal`/`note`/`portal`/`filetree`/`group`, barra superior (`Topbar`, Fase 30), notas Markdown (`NoteNode` + `MarkdownView`), terminais xterm (`TerminalFlowNode` + `TerminalNode`), conexões tipadas (`TypedEdge`, estilos `curva`/`circuito`) e store zustand (`canvasStore`) com persistência por projeto (`serialize`/`hydrate`, snapshot `version: 2`).

Stack relevante: React 18.3.1, `@xyflow/react` 12, `@xterm/xterm` 5, zustand 5, Electron 33. Licença MIT.

Este trabalho é um **refino/expansão de UI**, não uma reescrita. Reaproveita os padrões existentes (nós como `data` no store, barra contextual que já aparece com 2+ nós selecionados, edges customizadas, persistência derivada).

## Decisões travadas (brainstorming 2026-07-13)

1. **Entrega em ondas** — visual primeiro, lógica de contexto por último. Cada onda é validável isoladamente.
2. **Notas em rich-text WYSIWYG com TipTap** (ProseMirror), persistidas como **HTML**, migrando o Markdown atual no primeiro load.
3. **Implementar as funções novas da barra de verdade** (não só o visual): anexar arquivo, desenhar.
4. **Injeção de contexto automática** ao ligar/criar terminal ligado — porém **sem dar Enter sozinho** (o texto fica no prompt para o usuário revisar e enviar).
5. **Desenho = Excalidraw embutido** (MIT, compatível com o Orkestra) — descartado o tldraw por exigir marca d'água/licença comercial.
6. **Undo = global do canvas** (pilha de snapshots + `Cmd+Z`); o botão "reverter" da barra do terminal aciona o mesmo undo.
7. Ícones `{}` e `⬆ share` da barra ficam **adiados** (placeholders inertes); `Aa` cria um **nó de texto leve** (sem chrome de card).

## Visão geral da arquitetura

Nenhuma mudança de paradigma. Adições:

- **Novos tipos de nó:** `file` (arquivo anexado), `draw` (Excalidraw), `text` (texto leve). Somam-se ao `nodeTypes` de `Canvas.tsx` e ao `serialize`/`hydrate`.
- **Novo estilo de edge:** `corda` — path com "barriga" por gravidade + animação de balanço. Entra em `EdgeStyle` e em `TypedEdge`.
- **Novo componente `NodeToolbar`:** barra contextual que abre abaixo da `Topbar` quando **exatamente 1** nó está selecionado; conteúdo varia por tipo de nó (terminal → F04/F05; nota → F06/F07). Convive com a barra de alinhar (2+ nós).
- **Histórico de undo** no `canvasStore` (pilha de snapshots de `nodes`/`edges`).
- **Injeção de contexto:** ao criar edge `nota|file|portal → terminal` (ou terminal criado já ligado), o conteúdo textual dos nós-fonte é escrito no pty do terminal-alvo, sem Enter.
- **Persistência:** snapshot sobe para `version: 3`; `hydrate` migra `note.data.content` (Markdown) → `note.data.html`. Novos campos de `data` (cor da nota, elementos do desenho, caminho do arquivo) entram no `serialize` genérico já existente.

Cada onda abaixo é um incremento independente com seus próprios testes.

---

## Onda 1 — Barra superior (F01, imagem 1)

**Objetivo:** `Topbar` idêntica à imagem 1, em 3 grupos.

**Layout:**
- **Esquerda:** `+` (novo projeto — dispara `projects.pickDirectory` + `create`, mesmo fluxo da sidebar) · botão painel (toggle da `ProjectsSidebar`) · "My Workspace" (basename de `activeCwd`, ou "My Workspace" sem pasta).
- **Centro:** cursor (modo navegar/selecionar, ativo por padrão) · terminal · nota · clip (nó `file`) · pasta (`filetree`) · globo (`portal`) · `Aa` (nó `text`) · desenhar (nó `draw`).
- **Direita:** `{}` (placeholder inerte, `disabled`) · `</>` ▾ (abrir no editor, com dropdown de escolha VS Code/Cursor/…) · `⬆` share (placeholder inerte).

**Mudanças:**
- `Topbar.tsx`: reescrever a árvore de ícones + novas props (`onNewProject`, `onToggleSidebar`, `onFile`, `onText`, `onDraw`, `sidebarCollapsed`). Ícones SVG inline seguindo o conjunto atual (stroke 1.8).
- `Topbar.css`: 3 grupos com `justify-content: space-between`; grupo central centralizado; separadores.
- `Canvas.tsx`/`App.tsx`: estado `sidebarCollapsed` (elevar para `App` ou store, já que a `ProjectsSidebar` é irmã do `Canvas`). Colapsar aplica `width: 0`/`display:none` na sidebar.
- Dropdown do `</>`: pequeno popover reusando o padrão do `CanvasContextMenu`.

**Modo cursor:** por ora é indicador visual do modo padrão do React Flow (seleção/pan). Um "modo desenho global" NÃO entra aqui (desenho é nó, Onda 7).

**Testes:** render da `Topbar` com/sem `cwd`; cada botão chama seu handler; toggle de sidebar alterna `sidebarCollapsed`.

---

## Onda 2 — Conexões "corda" (F02, imagens 2 e 7)

**Objetivo:** estilo de conexão que parece uma corda pendurada, pontilhado grosso/comprido, que **balança** quando um nó ligado é arrastado e solto.

**Mudanças:**
- `edgeStyle.ts`: `EdgeStyle` passa a `'curva' | 'circuito' | 'corda'`; `resolveInitialEdgeStyle`/`nextEdgeStyle` cobrem o terceiro valor (ciclo curva→circuito→corda→curva).
- `TypedEdge.tsx`: quando `edgeStyle === 'corda'`, gerar um path próprio com **sag** (barriga) — quadrática/catenária aproximada: ponto de controle no meio deslocado para baixo por um fator da distância horizontal. `strokeDasharray` grosso e comprido (ex.: `2 10`, `stroke-width` ~3), `stroke-linecap: round`.
- **Balanço:** ao mover o nó, o sag oscila. Implementação simples e barata: uma pequena animação CSS de `d`/transform amortecida disparada quando as coordenadas mudam bruscamente (ex.: classe `swinging` por ~600ms via `requestAnimationFrame` com decaimento senoidal aplicado ao offset vertical do ponto de controle). Sem lib de física.
- Conector "haltere" (imagem 7): estilizar os `Handle` do topo/da corda como um pino arredondado (osso). CSS em `nodes.css`.
- Look "Claude Code" do terminal (destaque de status): tratado no visual do terminal, refinado na Onda 6; aqui só o que toca a corda/edge.

**Persistência:** `edgeStyle` continua preferência global em localStorage (não entra no snapshot).

**Testes:** `edgeStyle` — ciclo dos 3 valores e `resolveInitialEdgeStyle('corda')`; função pura do cálculo do path da corda (dado source/target → path com sag esperado), extraída para um módulo testável (ex.: `edges/ropePath.ts`).

---

## Onda 3 — Barra contextual de nó (F04/F05, imagens 4 e 5)

**Objetivo:** ao selecionar **1** terminal, abrir abaixo da `Topbar` uma barra com 4 ações (imagem 4): renomear · nº de ligações · reverter · apagar.

**Mudanças:**
- Novo `NodeToolbar.tsx` + `NodeToolbar.css`: posicionado como a `ork-arrange-toolbar` (abaixo da topbar, centralizado). Aparece quando `selectedNodes.length === 1`. Recebe o nó selecionado e despacha ações por tipo.
- `Canvas.tsx`: renderizar `<NodeToolbar>` para seleção única; a barra de alinhar continua para `>= 2`.
- **Terminal (F04):**
  - **Renomear:** foca o `input` de nome do nó (ou abre um campo inline na barra). Reusa `updateTerminalName`.
  - **Nº de ligações:** badge com a contagem de edges que tocam o nó (`edges.filter(source|target === id).length`) — visual da imagem 4 (número em círculo azul).
  - **Reverter:** chama `undo()` do store (Onda 4).
  - **Apagar:** `removeNode(id)`.

**Testes:** `NodeToolbar` só renderiza com 1 selecionado; contagem de ligações correta; cada botão dispara a ação certa (mocks do store).

---

## Onda 4 — Undo/histórico (transversal; suporta F04)

**Objetivo:** desfazer a última mudança estrutural do canvas.

**Mudanças:**
- `canvasStore.ts`: pilha `past: Array<{nodes, edges}>` (cap ~50). Um helper `commit()` faz push do estado atual ANTES de mutações estruturais (add/remove nó, add/remove edge, rename, cor, agrupar). `undo()` faz pop e restaura. `canUndo` derivado.
  - **Escopo do que entra no histórico:** operações discretas do usuário. NÃO entram: arraste contínuo de posição (ruído), foco, atenção, `switching`. Posição pode ser capturada no `onNodesChange` apenas em mudanças `type === 'remove'`/`dimensions` finais — manter simples: undo cobre criação/remoção/rename/cor/ligação; posição fica fora na v1 (documentar).
- `Cmd/Ctrl+Z` em `Canvas.tsx`: tratado como **sensível a texto** — roda DEPOIS do guard `isTypingTarget`. Assim, com um terminal (xterm) ou o editor de nota focado, o Cmd+Z pertence a eles; o undo do canvas só dispara quando o foco está no canvas (nenhum input/xterm ativo).
- Botão "reverter" da `NodeToolbar` chama `undo()`.

**Interação com pty:** `undo()` de uma remoção de terminal NÃO ressuscita o pty morto (o × já matou o processo). Documentar: reverter recria o nó, mas um terminal revertido inicia um shell novo. Aceitável na v1.

**Testes:** `commit`+`undo` restaura nodes/edges; cap da pilha; `undo` vazio é no-op; sequência add→add→undo.

---

## Onda 5 — Notas rich-text + cores (F06/F07, imagens 6 e 7)

**Objetivo:** nota vira editor WYSIWYG (TipTap) com barra de formatação contextual e cor de post-it.

**Dependências novas:** `@tiptap/react`, `@tiptap/starter-kit` (bold, italic, strike, code, headings, listas), `@tiptap/extension-text-style` + `@tiptap/extension-color` (cor de texto), `@tiptap/extension-underline`, `@tiptap/extension-font-family`, `@tiptap/extension-image`. **Tamanho de fonte:** o StarterKit não traz `fontSize` — usar uma pequena extensão custom sobre `TextStyle` (atributo `fontSize` → `style="font-size:…"`), padrão documentado do TipTap.

**Mudanças:**
- `NoteNode.tsx`: substituir textarea/preview por `EditorContent` do TipTap. Conteúdo persistido em `data.html` (via `editor.getHTML()` com debounce → `updateNoteHtml`). `data.color` define o fundo (classe/estilo).
- `NodeToolbar` (nota, F06): cor · família de fonte · tamanho · **B/I/S** · código · heading · lista numerada/marcadores · imagem. Cada botão chama comandos do editor (`editor.chain().focus().toggleBold()`…). O editor ativo é exposto via ref/registro para a barra acessar (registro por nodeId, à la `terminalRegistry`).
- **Cores (F07):** paleta de post-it (amarelo, rosa, azul, verde, roxo, neutro). `data.color` → variável de fundo; texto/ў contraste ajustado. Seletor de cor na barra (imagem 6, círculo à esquerda).
- **Migração:** `hydrate` (snapshot < v3) converte `data.content` (Markdown) → `data.html` usando o parser existente (`markdown/markdown.ts`) ou `marked`. `content` é descartado após converter.

**Modelo de dados da nota:** `{ html: string, color?: string }` (antes `{ content: string }`).

**Testes:** conversão Markdown→HTML na migração (função pura); `updateNoteHtml`/`updateNoteColor` no store; a `NodeToolbar` de nota dispara os comandos certos (mock do editor). Testes de UI do TipTap ficam mínimos (é lib de terceiro).

---

## Onda 6 — Terminal: rodapé + expandir/diminuir (F03 visual, imagem 3)

**Objetivo:** terminal com rodapé mostrando a rota da pasta e botões de maximizar/restaurar, além de ajuste fino de layout.

**Mudanças:**
- `TerminalFlowNode.tsx`: rodapé (`ork-node-footer`) com o **cwd** do terminal (basename + path completo no `title`). Fonte: `activeCwd` do projeto (v1). Rastreamento dinâmico de `cd` (OSC 7) fica fora de escopo — documentar.
- **Maximizar/restaurar:** botões nos cantos (imagem 3). Maximizar guarda `width/height/position` atuais em `data._restore` e expande o nó para preencher a viewport do canvas (ou um tamanho grande centrado); restaurar volta. Sem novo tipo de estado global — é `data` do nó + `fitView` opcional.
- Ajuste de header/corpo ("o X e o Y"): revisar paddings/alinhamento do header, cor do dot de status, badge de papel — aproximar do look da imagem (barra de status "rodando" destacada).

**Testes:** cálculo de maximizar/restaurar (função pura sobre dimensões); rodapé renderiza o cwd; sem cwd mostra estado neutro.

---

## Onda 7 — Novos nós: arquivo + desenho (F01 funcional)

**Objetivo:** implementar os disparadores novos da barra.

### 7a — Nó `file` (clip)
- Novo `FileNode.tsx`: card com nome do arquivo, caminho, e (se texto) um preview via `filetree.read`. Ligável como qualquer nó (vira contexto na Onda 8).
- Novo IPC `dialog:pickFile` (main) + `projects.pickFile()` (preload) — espelha `pickDirectory`.
- Store: `addFileNode(position?, opts?: {path?})`; `data = { name, path }`.

### 7b — Nó `draw` (Excalidraw)
- Dependência: `@excalidraw/excalidraw` (MIT).
- Novo `DrawNode.tsx`: embute `<Excalidraw>` num nó redimensionável. Elementos serializados (`elements` + `appState` mínimo) em `data.scene`, persistidos via `serialize` genérico. `nowheel`/`nodrag` para o React Flow não roubar os gestos de desenho.
- Store: `addDrawNode(position?)`; `data = { scene? }`. Debounce ao salvar a cena.
- Cuidado: Excalidraw traz CSS próprio; importar isolado. Verificar bundle no Electron (assets locais, sem CDN).

**Registro nos dois:** `Canvas.tsx` `nodeTypes` ganha `file` e `draw`; `serialize`/`hydrate` já são genéricos sobre `data`.

**Testes:** `addFileNode`/`addDrawNode` no store; round-trip serialize/hydrate preserva `path`/`scene`; `pickFile` (mock IPC).

---

## Onda 8 — Lógica de contexto do terminal (F03 comportamental)

**Objetivo:** quando um terminal está ligado a nós de contexto (nota, arquivo, site/portal), o conteúdo desses nós é entregue ao agente do terminal automaticamente, **sem Enter automático**.

**Gatilho:**
- Ao criar uma edge cujo **alvo** é um terminal e a **fonte** é `note`/`file`/`portal` (`onConnect`).
- Ao criar um terminal já ligado (fluxo do `NewTerminalModal`/orquestração, se aplicável).

**Comportamento:**
- Montar um bloco de contexto textual a partir dos nós-fonte:
  - `note` → texto (HTML→texto simples).
  - `file` → caminho (e opcionalmente conteúdo, se pequeno) via `filetree.read`.
  - `portal` → nome + URL (o "acesso ao site" é a URL entregue ao agente como contexto; navegação real do processo fica fora de escopo).
- Escrever esse bloco no pty do terminal-alvo via `pty.write(ptyId, texto)` — **sem `\r`** ao final. O texto fica no prompt para o usuário revisar/editar e enviar.
- **Anti-duplicação (simples por construção):** o gatilho é o evento `onConnect` (criação de uma edge nova), que dispara UMA vez por ligação. A **hidratação** de um projeto (reload) NÃO passa por `onConnect` (as edges são reconstruídas direto no `hydrate`), então o contexto não reaparece sozinho ao reabrir o app — sem necessidade de flag persistida. Reinjeção manual (botão "reenviar contexto" na `NodeToolbar`) fica como opção a avaliar na implementação.
- Só injeta se o terminal tem pty vivo (via `terminalRegistry`); se ainda não spawnou, adiar até o connect (pequena espera/retry).

**Formato do bloco (proposta, ajustável):**
```
[contexto de "<nome do nó>"]
<conteúdo>

```

**Testes:** função pura que monta o bloco de contexto a partir de uma lista de nós-fonte (note/file/portal); gatilho chama `pty.write` sem `\r` (mock); não reinjeta quando `data.injected`.

---

## Mudanças transversais

- **Snapshot `version: 3`:** `hydrate` aceita v2 (migra nota Markdown→HTML) e v3. `serialize` grava v3. Novos `data.*` (`color` da nota, `path` do arquivo, `scene` do desenho) passam pelo serialize genérico; campos efêmeros (`autostart`, `_restore` da maximização) são removidos no serialize, como o `autostart` já é. A injeção de contexto (Onda 8) NÃO precisa de campo persistido (ver anti-duplicação lá).
- **Dependências novas:** TipTap (várias extensões), `@excalidraw/excalidraw`. Verificar peso do bundle e compatibilidade com Electron/Vite (assets locais).
- **CSS/tokens:** novas cores de post-it e o estilo da corda entram via `tokens.css`/`nodes.css`, respeitando os 2 temas (claro/escuro) já existentes.
- **Regra zustand v5:** qualquer seletor derivado novo (ex.: contagem de ligações, `canUndo`) que retorne array/objeto novo precisa de `useShallow` — senão loop de render (ver `reference_orkestra_zustand_v5`).

## Riscos e mitigações

1. **Excalidraw dentro do React Flow** (gestos concorrentes, CSS, bundle): isolar com `nodrag/nowheel`, importar CSS local, testar em `npm run dev` cedo. Se inviável, cair para a alternativa "nó de desenho à mão livre" (canvas 2D simples).
2. **TipTap + migração de dados:** migração é irreversível (Markdown→HTML). Mitigar preservando `content` original por uma versão (não apagar imediatamente) OU garantindo conversão testada antes de descartar. **Decisão:** manter `content` por compat até a migração estar validada em `dev`.
3. **Injeção de contexto surpreender o usuário:** por isso sem Enter automático e injeção única por edge. Documentar claramente.
4. **Undo x pty:** reverter remoção de terminal não ressuscita o processo — documentado, aceitável.
5. **Escopo grande:** as ondas são independentes; parar após qualquer uma deixa o app coerente.

## Fora de escopo (v1)

- `{}` e `⬆ share` da barra (placeholders).
- Rastreamento dinâmico de `cd` no rodapé do terminal (OSC 7).
- Undo de posição (arraste).
- Modo de desenho global sobre o canvas inteiro (desenho é nó).
- Navegação web real do processo do agente a partir de um portal ligado (entregamos a URL como contexto).

## Critérios de aceite

- Barra superior visualmente equivalente à imagem 1, com todos os disparadores funcionais (exceto `{}`/share).
- Conexões no estilo corda pontilhada com balanço ao arrastar.
- Barra contextual de terminal (4 ações) e de nota (formatação + cor) abrindo abaixo da topbar com 1 nó selecionado.
- Notas ricas (TipTap) coloridas, com Markdown antigo migrado sem perda.
- Terminal com rodapé de rota e maximizar/restaurar.
- Nós de arquivo e de desenho (Excalidraw) criáveis e persistidos.
- Ligar nota/arquivo/site a um terminal injeta o contexto no prompt (sem Enter).
- `typecheck`, `lint` e `test` verdes; nenhuma regressão nos testes existentes.
