# Plano de Implementação — Canvas
> **Origem:** `docs/analise-maestri-360/canvas.md` · **Status:** análise concluída (2026-07-15, branch `feat/designcode-ui`) · **Onda(s):** 1 (T1–T3) e 2 (T4–T9)

## 1. Objetivo & valor

O canvas é a superfície central do Orkestra: um plano 2D "infinito" (React Flow / `@xyflow/react` v12)
onde o usuário posiciona terminais, notas, portais, árvores de arquivo e desenhos e os conecta para
orquestrar agentes. O motor já é robusto (grupos parent/child, alinhar/distribuir/grade em funções
puras, undo com coalescing, clipboard cross-project, arestas tipadas). Este plano fecha as **lacunas
de paridade** com a referência Maestri, priorizando limpezas baratas de alto valor (atalho de grade,
renomear grupo, auto-dissolver grupo) e depois diferenciais de fluidez (navegação por conexão,
Alt-drag, snap mosaico) e itens estruturais (Configurações, redo, nó de Texto). O ganho para o
usuário é um canvas que "responde como Figma": menos cliques, gestos esperados e organização
automática.

## 2. Estado atual no código (verificado)

Todos os caminhos citados na análise foram abertos e conferem — **nenhum path stale encontrado**.
Abaixo só os arquivos que abri e que este plano toca:

| Arquivo real | O que já faz | Relevância |
| --- | --- | --- |
| `src/renderer/src/store/canvasStore.ts` | Store Zustand único: `nodes`/`edges`, `add*` por tipo, `groupSelected`/`ungroupSelected`/`ungroupGroupsById`, `setNodePositions`, undo (`past`/`histPatch` com coalescing por tag), clipboard (`copyNodes`/`pasteClipboard`/`duplicateNodes`), `serialize`/`hydrate`. Exporta `absolutePositionOf`. | Núcleo de quase todas as tarefas |
| `src/renderer/src/layout/arrange.ts` | Funções puras `alignNodes`, `distributeNodes`, `gridArrange` (ceil(sqrt(n)) colunas, passo = maior dimensão + gap, ancorado no topo-esquerda). Já testado. | T1 (grade) reusa `gridArrange` |
| `src/renderer/src/layout/arrange.test.ts` | Suíte pura (vitest, ambiente node) — modelo para novos helpers. | Molde de teste p/ T3/T4/T6 |
| `src/renderer/src/components/Canvas.tsx` | Monta `ReactFlow`; `handleKeyDown` (Cmd+K/G/Z/C/V/D, Shift+1/2/M/A); `toPosNodes()` inline + `runGrid`/`runAlign`/`runDistribute`; `snapToGrid`+`snapGrid={[20,20]}`; `onBeforeDelete` (desagrupa antes de excluir grupo); `Background gap={22}`. | T1, T4, T5, T6 (fiação de UI/atalhos) |
| `src/renderer/src/components/GroupNode.tsx` | Só exibe `data.name` num `.ork-group-header`. Recebe **apenas** `{ data }` de `NodeProps` (não usa `id`). Já suporta `data.color` opcional (mas **não há setter** no store). Nenhum input de edição, nenhum `onDoubleClick`. | T2 (renomear por duplo clique) |
| `src/renderer/src/components/NodeToolbar.tsx` | Barra de 1 nó selecionado; `rename()` foca `.ork-node-input` do terminal. | Referência de UI p/ T2 |
| `src/renderer/src/components/CanvasContextMenu.tsx` | Menu apresentacional genérico (`ContextMenuItem[]`). | Nenhuma mudança necessária |
| `src/renderer/src/components/ProjectsSidebar.tsx` | Padrão real de **rename inline** por duplo clique: `startRename`/`commitRename`/`renameInputRef` + `onDoubleClick={() => startRename(p)}`. | Molde direto p/ T2 |
| `src/renderer/src/components/Topbar.tsx` | Ferramenta "Texto" renderizada **desabilitada** ("em breve", linha ~163). | T9 (nó de Texto) |
| `src/renderer/src/edges/edgeStyle.ts` | `loadEdgeStyle`/`saveEdgeStyle` via `localStorage` (preferência global de UI). | Molde de persistência p/ T7 (Configurações) |
| `src/renderer/src/store/canvasStore.test.ts` | Suíte do store (`// @vitest-environment jsdom`; `crypto.randomUUID` disponível). | Molde de teste p/ T2/T8 |

**Confirmações de lacuna (grep negativo):** não existe `updateGroupName`/`updateGroupColor`, não
existe navegação por seta/adjacência (`ArrowRight`/`ArrowLeft` só aparecem como nome de ícone), não
existe tela de Configurações (`configura`/`settings` sem resultado em `src/renderer`), não existe
`redo`/`future` no store, e o único `onDoubleClick` de rename está na `ProjectsSidebar`.

## 3. Gaps priorizados

| Gap | Prioridade | Valor | Esforço | Onda |
| --- | --- | --- | --- | --- |
| T1 — Atalho `⇧T` para "Organizar em grade" (`gridArrange` já existe) | P1 | Alto | S | 1 |
| T2 — Renomear grupo por duplo clique no cabeçalho | P1 | Alto | S | 1 |
| T3 — Auto-dissolver grupo com <2 membros (`ungroupGroupsById` já existe) | P1 | Médio | S | 1 |
| T4 — Navegação por conexão (`→`/`←`) entre nós adjacentes | P2 | Alto | M | 2 |
| T5 — Duplicar arrastando com Alt/Option (Alt-drag) | P2 | Alto | M | 2 |
| T6 — Encaixe magnético tipo mosaico (guias + snap a vizinhos) | P2 | Alto | L | 2 (épico) |
| T7 — Tela de Configurações → Geral (tamanho padrão, passo de grade, estilo de conexão) | P3 | Médio | M | 2 |
| T8 — Redo (`⇧⌘Z`) | P3 | Médio | M | 2 |
| T9 — Nó de "Texto" puro (habilitar botão da Topbar) | P3 | Médio | S/M | 2 |

## 4. Tarefas de implementação (TDD, em ordem)

---

### T1 — Atalho `⇧T` para "Organizar em grade"  [P1 · S · Onda 1]

- **Arquivos a tocar:**
  - `src/renderer/src/layout/arrange.ts` (extrair helper puro)
  - `src/renderer/src/layout/arrange.test.ts`
  - `src/renderer/src/components/Canvas.tsx` (fiação do atalho + reuso do helper)
- **Passos TDD:**
  1. **Teste que falha** (`arrange.test.ts`, novo `describe('selectionToGrid')`): a lógica de grade
     em si já é coberta por `gridArrange`; o novo valor testável é o **branch do atalho**, que hoje
     está embutido em `toPosNodes()` dentro do componente. Extraia uma função pura
     `selectionToGridPositions(nodes: PosNode[]): PositionMap` que apenas encapsula
     `gridArrange(nodes)` sobre a seleção — teste: entrada `[N('a',40,60,100,100), N('b',40,60,100,100)]`
     com `gap` padrão → `{ a: {x:40,y:60}, b: {x:150,y:60} }` (idêntico a `gridArrange`, garantindo
     que o wrapper não altera semântica). *(Observação honesta: T1 é majoritariamente fiação; o
     helper existe só para dar um ponto de verde — se preferir, pule o helper e trate T1 como
     "manual + typecheck".)*
  2. **Implementação:**
     - Em `Canvas.tsx`, dentro de `handleKeyDown`, adicionar um branch no grupo `Shift+…`
       (depois do `isTypingTarget(e)` guard, junto de `Shift+1/2/M/A`):
       ```
       if (e.shiftKey && e.key.toLowerCase() === 't') {
         e.preventDefault()
         const sel = useCanvasStore.getState().nodes.filter((n) => n.selected)
         if (sel.length < 2) return
         const pos = sel.map((n) => ({ id: n.id, position: absolutePositionOf(n, useCanvasStore.getState().nodes), width: n.width, height: n.height }))
         useCanvasStore.getState().setNodePositions(gridArrange(pos))
         return
       }
       ```
     - `gridArrange`, `absolutePositionOf` e `setNodePositions` já estão importados/exportados —
       nenhuma dependência nova. `setNodePositions` já entra no `histPatch` (a grade vira desfazível).
  3. **Verde:** `npx vitest run src/renderer/src/layout/arrange.test.ts`
- **Critérios de aceite:**
  - Com 2+ nós selecionados, `⇧T` reorganiza a seleção em grade (idêntico ao botão "Grade").
  - Com <2 selecionados, é no-op (não lança, não move nada).
  - `⌘Z` desfaz a reorganização em um passo.
  - Não dispara enquanto se digita num input/nota/terminal (roda depois do `isTypingTarget`).
- **Notas:** usar `e.key.toLowerCase() === 't'` (mesmo padrão de `Shift+M`/`Shift+A`), não `e.code`,
  para consistência com os atalhos-letra já existentes. Verificar que `T` não colide com nenhum atalho
  do React Flow (não colide na config atual).

---

### T2 — Renomear grupo por duplo clique no cabeçalho  [P1 · S · Onda 1]

- **Arquivos a tocar:**
  - `src/renderer/src/store/canvasStore.ts` (nova ação `updateGroupName`)
  - `src/renderer/src/store/canvasStore.test.ts`
  - `src/renderer/src/components/GroupNode.tsx` (input inline + duplo clique)
  - `src/renderer/src/components/GroupNode.css` (estilo do input — reuso de `.ork-node-input` se aplicável)
- **Passos TDD:**
  1. **Teste que falha** (`canvasStore.test.ts`, novo `it`): criar 2 nós, selecioná-los,
     `groupSelected()`; pegar o `id` do nó `type:'group'`; chamar
     `useCanvasStore.getState().updateGroupName(groupId, 'Meu Grupo')`; esperar que o nó group tenha
     `data.name === 'Meu Grupo'` e que os demais nós fiquem intocados. (A ação ainda não existe → falha.)
  2. **Implementação:**
     - No store, adicionar à interface e à criação, espelhando `updatePortalName`/`updateNoteColor`:
       ```
       updateGroupName: (id, name): void =>
         set((state) => ({
           ...histPatch(state, 'gname:' + id),
           nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, name } } : n))
         })),
       ```
       (tag `'gname:'+id` para coalescer digitação tecla-a-tecla num único passo de undo, como os
       outros `update*`).
     - Em `GroupNode.tsx`: aceitar `id` de `NodeProps` (hoje só desestrutura `data`), adicionar estado
       local `editing`/`draft`, `onDoubleClick` no `.ork-group-header` que entra em edição, renderizar
       `<input className="ork-node-input" autoFocus />` quando `editing`, commit em `onBlur`/`Enter`
       (chama `updateGroupName(id, draft.trim() || 'Grupo')`), cancela em `Esc`. Usar
       `e.stopPropagation()` no input para o clique não selecionar/arrastar o grupo (o header é o
       `dragHandle`). Molde exato: `ProjectsSidebar.startRename`/`commitRename`/`renameInputRef`.
  3. **Verde:** `npx vitest run src/renderer/src/store/canvasStore.test.ts`
- **Critérios de aceite:**
  - Duplo clique no cabeçalho do grupo abre input com o nome atual selecionado.
  - Enter/blur salva; Esc cancela sem alterar.
  - Nome vazio cai no default `'Grupo'` (nunca persiste string vazia).
  - Digitação contínua vira um único passo de `⌘Z`.
  - Editar não inicia arraste do grupo nem seleção.
- **Notas:** o `data.name` do grupo já é criado por `groupSelected` e sobrevive ao
  `serialize`/`hydrate` (é `data.*` genérico) — nada a mudar na persistência. Como o input fica dentro
  do `dragHandle`, o `stopPropagation` é obrigatório para não conflitar com o d3-drag do React Flow.

---

### T3 — Auto-dissolver grupo com <2 membros  [P1 · S · Onda 1]

- **Arquivos a tocar:**
  - `src/renderer/src/layout/groups.ts` **(novo)** — helper puro
  - `src/renderer/src/layout/groups.test.ts` **(novo)**
  - `src/renderer/src/store/canvasStore.ts` (chamar o helper após remoções)
- **Passos TDD:**
  1. **Teste que falha** (`groups.test.ts`, ambiente node como `arrange.test.ts`): definir
     `dissolveThinGroups(nodes: PosLikeNode[], threshold = 2)` que, para cada nó `type:'group'` com
     **menos de `threshold` filhos** (`parentId === group.id`), reescreve os filhos para o topo-nível
     (posição absoluta = filho.position + group.position; remove `parentId`/`extent`) e descarta o nó
     group. Casos concretos:
     - Grupo `g` em `{100,100}` + 1 filho `c` em `{10,20}` (relativo) → retorno **sem** `g`, com `c`
       em `{110,120}`, sem `parentId`/`extent`.
     - Grupo `g` + 2 filhos → retorno **inalterado** (mesmos nós, mantém o group).
     - Grupo `g` + 0 filhos (esvaziado) → retorno remove só `g`.
     - Sem grupos → retorna o array como veio.
  2. **Implementação:**
     - Escrever `dissolveThinGroups` puro em `groups.ts` (pode reusar a matemática de absolutização de
       `ungroupGroupsById`; para grupos aninhados, resolver via a mesma soma de ancestrais — ou
       documentar que só trata pai imediato na v1).
     - No store, chamar o helper **depois** de cada caminho que pode esvaziar um grupo:
       `removeNode` (após o `filter` que remove o nó) e `onNodesChange` (quando há `type:'remove'`).
       Aplicar sobre `nodes` antes do `return`. Também considerar `ungroupSelected` quando remove um
       único filho (opcional). Manter dentro do mesmo `set()`/`histPatch` já existente para não criar
       passo de undo extra.
  3. **Verde:** `npx vitest run src/renderer/src/layout/groups.test.ts`
- **Critérios de aceite:**
  - Excluir/mover-para-fora um filho até restar 1 dissolve o grupo automaticamente; o membro
    remanescente permanece na posição visual correta (absoluta).
  - Grupo com ≥2 membros nunca é dissolvido.
  - A dissolução automática entra no mesmo passo de undo da remoção que a causou (um único `⌘Z`).
  - Nenhum `parentId` órfão sobra no snapshot após dissolução (não reaparece no `hydrate`).
- **Notas:** cuidado para o helper ser **idempotente** e não realocar array quando não há nada a
  dissolver (devolver a mesma referência quando possível, como os outros no-ops do store, evitando
  re-render à toa). Confirmar interação com `onBeforeDelete` do Canvas (que já desagrupa grupos
  deletados) — a auto-dissolução age no caso de remoção de **filho**, não do container, então não
  colidem; ainda assim testar manualmente "apagar 1 de 2 filhos".

---

### T4 — Navegação por conexão (`→`/`←`)  [P2 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/layout/graphNav.ts` **(novo)** — helper puro de adjacência
  - `src/renderer/src/layout/graphNav.test.ts` **(novo)**
  - `src/renderer/src/components/Canvas.tsx` (fiação `ArrowRight`/`ArrowLeft` + fitView/seleção)
- **Passos TDD:**
  1. **Teste que falha** (`graphNav.test.ts`): `nextConnectedNode(currentId, edges, direction, cycleIndex)`
     onde `edges: {source,target}[]`, `direction: 'forward'|'backward'`. Reúne os vizinhos de
     `currentId` (qualquer aresta em que ele é `source` ou `target`), ordena determinística e
     estável (por `id`), e devolve o próximo/anterior ciclando por `cycleIndex`. Casos:
     - edges `a-b`, `a-c`; `nextConnectedNode('a', edges, 'forward', 0)` → `'b'`; `cycleIndex 1` → `'c'`;
       `cycleIndex 2` → `'b'` (volta ao início).
     - `direction 'backward'` a partir de `cycleIndex 0` → último vizinho (`'c'`).
     - nó sem vizinhos → `null` (no-op seguro).
     - ignora self-loops se existirem.
  2. **Implementação:**
     - Escrever `graphNav.ts` puro (sem React/store).
     - Em `Canvas.tsx handleKeyDown`, depois do `isTypingTarget` guard, adicionar branches
       `ArrowRight`/`ArrowLeft`: pegar o **primeiro nó selecionado** como "atual", chamar
       `nextConnectedNode`, e se retornar um id, **selecionar + enquadrar** o alvo reusando o mesmo
       mecanismo do `Shift+A` (montar `NodeChange[]` de `select` + `fitView({ nodes:[{id}], duration:300 })`).
       Manter um `navCycleRef` análogo ao `attentionCycleRef`.
  3. **Verde:** `npx vitest run src/renderer/src/layout/graphNav.test.ts`
- **Critérios de aceite:**
  - Com um nó selecionado, `→` seleciona e enquadra o próximo nó conectado; `←` o anterior.
  - Pressionar repetido cicla por todos os vizinhos e volta ao início.
  - Sem seleção ou sem vizinhos, é no-op silencioso.
  - Casa com o modelo "contexto é topologia" (navega pelo grafo, como `Shift+A` navega por atenção).
- **Notas (risco importante):** o React Flow v12 tem **acessibilidade por teclado** que move o nó
  focado com as setas por padrão. Há colisão potencial. Mitigações: (a) `e.preventDefault()` no branch
  e/ou (b) exigir um modificador (ex.: `Alt+→`/`Alt+←`) — decidir na fiação e validar em `npm run dev`
  que o nó **não** se desloca ao navegar. Documentar a escolha final. Verificação manual obrigatória
  (fiação de UI, sem RTL no projeto).

---

### T5 — Duplicar arrastando com Alt/Option  [P2 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/components/Canvas.tsx` (`onNodeDragStart`)
  - possível helper em `src/renderer/src/store/canvasStore.ts` (reuso de `duplicateNodes`)
- **Passos TDD:**
  - A lógica de materialização (`duplicateNodes` → `captureWidgets`/`materializeWidgets`) **já é
    testada** no `canvasStore.test.ts`. O novo é o **gesto** (interceptar o início do arraste com
    `e.altKey`), que é fiação de React Flow e não é testável sem RTL.
  - **Checklist de verificação manual** (`npm run dev`): (1) segurar Alt/Option e arrastar um nó
    cria uma cópia que passa a ser arrastada, deixando o original parado; (2) sem Alt, arraste normal;
    (3) Alt-drag de uma seleção múltipla duplica todos; (4) nomes colididos ganham "(cópia)".
  - `npm run typecheck` deve passar.
- **Implementação:** em `onNodeDragStart(e, node)`, se `e.altKey`, chamar
  `duplicateNodes([...ids selecionados ou node.id])` antes de o React Flow assumir o arraste, e
  garantir que o arraste continue sobre a cópia (a materialização já marca os novos como `selected`).
- **Critérios de aceite:** gesto Alt-drag cria e passa a arrastar a cópia; original intocado; entra
  no histórico (um `⌘Z` desfaz a duplicação).
- **Notas:** o ponto delicado é fazer o React Flow arrastar a **cópia** e não o original — pode exigir
  cancelar o drag nativo do original e reiniciar sobre o novo nó, ou reposicionar por
  `onNodeDrag`. Investigar a API de drag do `@xyflow/react` v12. Risco médio; isolar num commit próprio.

---

### T6 — Encaixe magnético tipo mosaico  [P2 · L · Onda 2 — ÉPICO]

- **Arquivos a tocar:**
  - `src/renderer/src/layout/snapping.ts` **(novo)** — geometria pura de snap/guias
  - `src/renderer/src/layout/snapping.test.ts` **(novo)**
  - `src/renderer/src/components/Canvas.tsx` (`onNodeDrag` + render de guias)
  - novo overlay de guias (componente/CSS) — a definir no design
- **Passos TDD:**
  1. **Teste que falha** (`snapping.test.ts`): `computeSnap(moving: Rect, others: Rect[], threshold)`
     retorna `{ x, y, guides: {vertical?: number, horizontal?: number} }`. Casos:
     - `moving` cuja borda esquerda está a 4px da borda esquerda de um vizinho, `threshold=8` →
       `x` encaixa exatamente na borda do vizinho e `guides.vertical` = essa coordenada.
     - distância > threshold em ambos os eixos → devolve a posição original e `guides` vazio.
     - alinhamento de centros e de bordas opostas (direita↔esquerda para "preencher lacuna").
  2. **Implementação:** geometria pura em `snapping.ts` (candidatos: bordas esq/dir/topo/base e
     centros de cada vizinho; escolher o menor delta dentro do threshold por eixo). Wire em `onNodeDrag`
     para reposicionar o nó e publicar as linhas-guia num overlay; snap só quando um modificador está
     ativo (ou sempre, conforme decisão de UX). Desligar `snapToGrid` durante o snap magnético para
     não competir.
  3. **Verde:** `npx vitest run src/renderer/src/layout/snapping.test.ts`
- **Critérios de aceite:** ao arrastar perto de um vizinho, o nó "gruda" na borda/centro e uma linha-
  guia aparece; soltar mantém a posição encaixada; sem vizinho próximo, arraste livre.
- **Notas:** maior diferencial visual ainda ausente e o de maior esforço — tratar como épico próprio
  (geometria testável primeiro; overlay/UX depois). Cuidar da performance (recalcular contra todos os
  vizinhos a cada `onNodeDrag` pode custar; limitar a nós no viewport). Decidir a interação com o
  `snapGrid=[20,20]` existente.

---

### T7 — Configurações → Geral (defaults do canvas)  [P3 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/ui/settings.ts` **(novo)** — load/save + defaults (molde: `edges/edgeStyle.ts`)
  - `src/renderer/src/ui/settings.test.ts` **(novo)**
  - `src/renderer/src/components/SettingsPanel.tsx` **(novo)** — UI
  - `src/renderer/src/store/canvasStore.ts` (ler defaults de tamanho no `add*` em vez de hardcode)
  - `src/renderer/src/components/Topbar.tsx` (entrada para abrir Configurações)
- **Passos TDD:**
  1. **Teste que falha** (`settings.test.ts`, jsdom p/ `localStorage`): `loadSettings()` sem nada
     salvo devolve os defaults conhecidos (ex.: terminal 480×320, nota 240×180, portal 480×320,
     filetree 300×360, passo de grade 20, estilo de conexão `'corda'`); `saveSettings(patch)` +
     `loadSettings()` faz round-trip; JSON corrompido no `localStorage` cai nos defaults sem lançar.
  2. **Implementação:** `settings.ts` puro (mesmo padrão de `loadEdgeStyle`/`saveEdgeStyle`, com
     try/catch em `localStorage`). Substituir os literais de tamanho embutidos em `addTerminalNode`/
     `addNoteNode`/`addPortalNode`/`addFileTreeNode` por leitura dos defaults. `SettingsPanel.tsx` como
     UI (verificação manual). O `edgeStyle` já é persistido — migrar/unificar sob `settings` ou manter
     e apenas expor na tela.
  3. **Verde:** `npx vitest run src/renderer/src/ui/settings.test.ts`
- **Critérios de aceite:** alterar o tamanho padrão de um tipo em Configurações passa a valer para
  novos nós daquele tipo; persiste entre sessões; estilo de conexão e passo de grade editáveis; valores
  inválidos/ausentes caem em defaults seguros.
- **Notas:** manter os defaults numa **fonte única** (o `settings.ts`) para o store e a UI lerem o
  mesmo. Não quebrar o round-trip `serialize`/`hydrate` (tamanho já é por-nó em `width`/`height`; isto
  só muda o **default de criação**).

---

### T8 — Redo (`⇧⌘Z`)  [P3 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/store/canvasStore.ts` (`future`, `redo`, limpar `future` em mutações)
  - `src/renderer/src/store/canvasStore.test.ts`
  - `src/renderer/src/components/Canvas.tsx` (branch `Shift+Cmd/Ctrl+Z`)
- **Passos TDD:**
  1. **Teste que falha** (`canvasStore.test.ts`): criar um terminal (1 passo no `past`), `undo()`
     (nós volta a vazio; passo migra para `future`), `redo()` → o terminal reaparece e `future` esvazia.
     Segundo caso: após `undo()`, executar uma **nova** mutação estrutural (`addNoteNode`) deve
     **limpar** `future` (não dá para refazer um futuro que foi sobrescrito).
  2. **Implementação:** adicionar `future: Array<{nodes,edges}>` e `redo()`. Em `undo()`, empurrar o
     estado atual para `future` antes de restaurar o topo de `past`. Em `histPatch` (ou em cada
     mutação estrutural), **zerar `future`** ao registrar um novo passo. Cuidar do side-effect de pty
     igual ao `undo` (matar pty de terminais que somem; recriar shell novo ao refazer criação).
  3. **Verde:** `npx vitest run src/renderer/src/store/canvasStore.test.ts`
- **Implementação da fiação:** em `handleKeyDown`, o branch atual de undo é
  `!e.shiftKey && key==='z'`. Adicionar `e.shiftKey && key==='z'` → `redo()`.
- **Critérios de aceite:** `⌘Z`/`⇧⌘Z` desfazem/refazem em par; nova mutação após undo invalida o redo;
  refazer a criação de um terminal recria o nó (com shell novo, coerente com o undo v1).
- **Notas:** manter o `cap` coerente com `past` (50). Não persistir `future` (efêmero, fora de
  `serialize`/`hydrate`, como `past`). Atualizar o `hydrate` para zerar `future` junto de `past`.

---

### T9 — Nó de "Texto" puro  [P3 · S/M · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/store/canvasStore.ts` (`addTextNode`)
  - `src/renderer/src/store/canvasStore.test.ts`
  - `src/renderer/src/components/TextNode.tsx` **(novo)**
  - `src/renderer/src/components/Canvas.tsx` (`nodeTypes.text`)
  - `src/renderer/src/components/Topbar.tsx` (habilitar o botão "Texto", hoje `disabled`)
  - `src/renderer/src/components/CreateOverlay.tsx` + `pendingTool` (incluir `'text'`)
- **Passos TDD:**
  1. **Teste que falha** (`canvasStore.test.ts`): `addTextNode({x,y})` cria um nó `type:'text'` com
     `data.text: ''` e tamanho default; `updateTextContent(id, 'oi')` seta `data.text`; sobrevive ao
     round-trip `serialize`→`hydrate` (mesmo padrão dos testes de nota/portal existentes).
  2. **Implementação:** `addTextNode`/`updateTextContent` no store (molde `addNoteNode`/
     `updateNoteHtml`, com tag de coalescing `'text:'+id`). `TextNode.tsx` como rótulo leve editável
     (texto simples, sem o peso do TipTap). Registrar `text` em `nodeTypes` (com `withNodeBoundary`).
     Trocar o botão `disabled` da Topbar por `onClick={() => setPendingTool('text')}` e estender a
     união de `pendingTool` e `handleCreateNode` no Canvas.
  3. **Verde:** `npx vitest run src/renderer/src/store/canvasStore.test.ts`
- **Critérios de aceite:** botão "Texto" cria por arrastar/clicar (fluxo `CreateOverlay`); texto é
  editável e persiste; edge `kind` deriva coerente (ver `deriveEdgeKind` em `edges/edgeKind.ts` — pode
  precisar de um caso para `text`).
- **Notas:** conferir `edges/edgeKind.ts` para o novo tipo não cair num `kind` inesperado. Manter o nó
  deliberadamente simples (o diferencial em relação à Nota é ser leve). Verificação visual em
  `npm run dev`.

---

## 5. Dependências & riscos

- **Sem React Testing Library:** toda fiação de UI (atalhos, duplo clique, drag, overlay de guias,
  Topbar, painel de Configurações) **não** tem teste unitário — a estratégia é extrair helpers puros
  (`groups.ts`, `graphNav.ts`, `snapping.ts`, `settings.ts`, ações do store) e cobrir a **lógica**;
  a **interação** entra em checklist manual (`npm run dev`) + `npm run typecheck` + `npm run lint`.
- **Colisão de teclado (T4):** setas conflitam com a a11y de teclado do React Flow v12 (move o nó
  focado). Resolver com `preventDefault`/modificador e validar manualmente que o nó não se desloca.
- **Drag nativo do React Flow (T5, T6):** interceptar/reescrever o gesto de arraste é a parte
  arriscada — isolar em commits próprios, com fallback para não quebrar o arraste normal.
- **Undo/histórico (T1, T3, T8):** garantir que grade/auto-dissolução/redo respeitem o `histPatch` e
  não gerem passos espúrios nem quebrem o coalescing por tag e a janela `COALESCE_MS`.
- **Persistência (T2, T7, T9):** mudanças em `data.*` de grupo/texto passam pelo `serialize`/`hydrate`
  genérico — cobrir round-trip nos testes do store; defaults de Configurações não podem alterar o
  formato do `CanvasSnapshot` (`src/shared/canvasSnapshot.ts`, `version`).
- **Side-effects de pty (T8):** refazer/desfazer criação de terminais mexe em processos reais
  (`window.orkestra.pty.killForNode`) — manter o guard `window.orkestra?` (ausente em jsdom).
- **Sequência sugerida:** T1→T2→T3 juntos (Onda 1, paridade barata) → T4 e T5 (fluidez) → T6 como
  épico próprio; T7/T8/T9 conforme a tela de Configurações amadurece.

## 6. Referências

- Análise de origem: `docs/analise-maestri-360/canvas.md` (seções 5 "Estado atual" e 6 "Melhorias").
- Código verificado: `src/renderer/src/store/canvasStore.ts`, `src/renderer/src/layout/arrange.ts`
  (+ `arrange.test.ts`), `src/renderer/src/components/Canvas.tsx`,
  `src/renderer/src/components/GroupNode.tsx`, `src/renderer/src/components/NodeToolbar.tsx`,
  `src/renderer/src/components/CanvasContextMenu.tsx`, `src/renderer/src/components/ProjectsSidebar.tsx`
  (padrão de rename inline), `src/renderer/src/components/Topbar.tsx`,
  `src/renderer/src/edges/edgeStyle.ts` (padrão de persistência), `src/renderer/src/store/canvasStore.test.ts`.
- Comandos: teste `npx vitest run <arquivo>` · `npm run typecheck` · `npm run lint` · app `npm run dev`.
- Doc Maestri "O Canvas": <https://www.themaestri.app/pt-br/docs/canvas>.
