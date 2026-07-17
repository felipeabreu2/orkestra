# Plano de Implementação — Batuta Search
> **Origem:** `docs/analise-maestri-360/batuta-search.md` · **Status:** ✅ **CONCLUÍDO (2026-07-17)** — T1–T5 entregues · **Onda(s):** 1, 2, 3

**Registro da T5 (2026-07-17)** — índice cross-projeto, decisões além do plano:
- A função pura + o tipo (`buildCrossProjectIndex`, `CrossProjectNode`) foram para **`src/shared/`**
  (não `src/main/`, como o caminho literal do plano): o tipo cruza main↔renderer (o main gera, a
  paleta consome), mesmo motivo de `contextResolver`. O main só provê os dados crus
  (`ProjectManager.crossProjectCanvases`, read-only, só `id/type/data` de cada nó).
- **Texto de nota SEM DOM:** o main não tem `DOMParser`, então o índice usa um strip de tags por
  regex + decode das entidades comuns (`& < > " '`, `&nbsp;`) — a versão "sem DOM" do `noteText`.
  Aceitável porque alimenta **busca** (texto plano em memória, nunca renderizado), não segurança.
- **Projeto ativo é PULADO** do índice (vem do canvasStore ao vivo — o disco pode estar atrás de
  edições não-flushadas); assim não há duplicação nem estado velho.
- **"Prioridade ao projeto atual" sem tocar no `rankItems`:** o nome do projeto vai **anexado ao
  label** do item cross-projeto (`Dev · Backend`), então o tie-break existente ("label mais curto
  vence no empate de score") favorece naturalmente o nó local (`Dev`) sobre o homônimo de outro
  projeto. Zero risco ao ranqueamento testado.
- **Execução assíncrona segura:** selecionar um item cross-projeto emite `SWITCH_PROJECT_EVENT`; a
  `ProjectsSidebar` (dona do `switchTo`: flush + switch + hydrate) troca e só então emite
  `FRAME_NODE_EVENT` (com `requestAnimationFrame` para o React Flow montar os nós hidratados); o
  `Canvas` enquadra pelo mesmo caminho do `onAgentFrame`. Read-only e escopado por id — cobre a
  regressão do incidente cross-project.

## 1. Objetivo & valor

Evoluir a *command palette* do Orkestra (`Cmd/Ctrl+K`) na direção da **Batuta Search**
do Maestri, atacando primeiro os ganhos de **maior valor com menor custo e menor risco**:
tornar a busca **fuzzy, multi-palavra e insensível a acentos**, e **indexar o corpo
inteiro das notas** — hoje a busca é substring simples que só olha o `label` truncado.

O valor central: o usuário orquestra vários agentes por teclado; uma busca que "erra por
um acento" ou que não acha uma nota pelo conteúdo quebra o fluxo. Como o ranqueamento
(`rankItems`) é uma **função pura já testada** e a montagem de itens (`buildPaletteItems`)
também é **pura e testada**, a Onda 1 é um alvo ideal para **TDD puro sem tocar na UI**:
todo o ganho de qualidade de busca cabe em `search.ts` + `search.test.ts` e num campo novo
`searchText` no `PaletteItem`, sem mexer no componente React.

**Fora de escopo (registrado):** localização/i18n das strings da paleta (lacuna nº 10 da
análise). Não perseguir agora — o app não é internacionalizado e a marca "Batuta Search"
permanece constante em qualquer idioma; qualquer trabalho aqui seria custo sem retorno no
momento. Também fora do escopo desta rodada: modo "Verificar" (read-only), "Perguntar"
multi-linha, atalho personalizável/entrada de menu — são melhorias válidas (§6 da análise),
mas ortogonais ao núcleo de busca e não bloqueiam as Ondas 1–3.

## 2. Estado atual no código (verificado)

Todos os caminhos abaixo foram **abertos e conferidos**. Os caminhos citados na análise
(`docs/analise-maestri-360/batuta-search.md`, §5 e §7) estão **corretos — nenhum stale**.

| Arquivo real | O que já faz | Relevância |
| --- | --- | --- |
| `src/renderer/src/search.ts` | `rankItems<T extends { label: string }>(query, items)`: **substring case-insensitive**. Normaliza query com `trim().toLowerCase()`; query vazia devolve todos; `indexOf(q)` filtra; ordena por **posição do match** (`a.idx - b.idx`) e, no empate, pelo **label mais curto**. **Função pura**, sem imports. | **Alvo central da Onda 1** (T1). É o `rankItems` do enunciado — confirmado puro e testado. |
| `src/renderer/src/search.test.ts` | 4 testes: query vazia → todos (len 5); substring case-insensitive (`'portal'`→`['Criar Portal']`, `'DEV'`→`['Dev']`); prefixo vence match no meio (`'re'`→`Reload` antes de `Backend Reviewer`); sem match → `[]`. | Guarda de regressão de T1. **Um caso precisa ser revisado** (ver T1 · Notas). |
| `src/renderer/src/palette/paletteCommands.ts` | Exporta `PaletteItem` (`{ id, label, kind, run?, input?, ask? }` — **sem** `searchText`), `PaletteContext`, `PaletteActions`, `nodeLabel(n)` e `buildPaletteItems(ctx)` (**pura**). `nodeLabel` trunca nota para `Nota: ${content.slice(0,24)}` lendo `n.data.content`. O loop de navegação `for (const n of nodes)` cria `node:<id>` com `label: nodeLabel(n)`. | **Alvo da Onda 1** (T2): adicionar `searchText` ao `PaletteItem` e alimentá-lo com o corpo da nota. |
| `src/renderer/src/palette/paletteCommands.test.ts` | Cobre 4 ações globais, item SSH (`input`), sem-seleção sem contexto, terminal (focar/remover/renomear/papel/perguntar), conectar só a não-conectados, desconectar por edge, alternância de estilo, "remover todas as conexões" só com edges, e unicidade de ids. | Guarda de regressão de T2/T4. |
| `src/renderer/src/components/CommandPalette.tsx` | Componente da paleta. `const filtered = useMemo(() => rankItems(query, items), [query, items])` (linha 160). Mapeia nós para `buildPaletteItems` passando `data` completo (inclui `content`) nas linhas 119–123. Teclado (↑/↓/Enter/Esc), modo `input`, modo `ask` (`AskAgentPanel`), agrupamento por `kind` (`KIND_GROUP_LABELS`, tipado `Record<PaletteItem['kind'], string>`). | Consome `rankItems` e `PaletteItem`. **Não muda em T1/T2**; muda em T3 (realce). Adição de `kind` novo em T4 quebraria os dois `Record<...>` (erro de compilação — proposital). |
| `src/renderer/src/store/canvasStore.ts` | Nota guarda corpo em `n.data.content` (`updateNoteContent` grava `{ ...data, content }`, ~linha 596). | Fonte do `searchText` de nota em T2. |
| `src/renderer/src/components/Topbar.tsx` | Já tem callbacks reais: `onNewProject` (~linha 85) e "Abrir no editor de código" (~linha 194). | Reuso em T4 (expor ações globais existentes na paleta). |
| `src/main/projects/ProjectManager.ts` | Múltiplos projetos: `list()` devolve `{ projects, activeId }` (~linha 238); só um projeto carregado no `canvasStore` por vez. | Contexto para T5 (índice cross-projeto). |
| `package.json` | `"test": "vitest run"`, `"typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"`, `"lint": "eslint ."`. | Comandos de verificação das tarefas. |

## 3. Gaps priorizados

| Gap | Prioridade | Valor | Esforço (S/M/L) | Onda |
| --- | --- | --- | --- | --- |
| Busca não é fuzzy, não é multi-palavra, não ignora acentos (`rankItems` = substring) | **P1** | Alto (maior retorno isolado) | M | 1 |
| Busca não olha o corpo das notas (só `label` truncado a 24 chars) | **P1** | Alto | M | 1 |
| Sem realce dos caracteres combinados (negrito) na lista | P2 | Médio (leitura da lista) | M | 2 |
| Ações globais existentes no app não expostas na paleta (Abrir no editor, Novo projeto) | P2 | Médio | S | 2 |
| Escopo limitado ao projeto/canvas atual — sem índice cross-projeto | P3 | Alto (maior salto de capacidade) | L | 3 |
| Localização/i18n das strings | — | Baixo agora | L | **Fora de escopo** |

## 4. Tarefas de implementação (TDD, em ordem)

### T1 — Fuzzy + multi-palavra + sem-acento em `rankItems`  [P1 · M · Onda 1]

- **Arquivos a tocar:**
  - `src/renderer/src/search.ts`
  - `src/renderer/src/search.test.ts`
- **Passos TDD:**
  1. **Teste que falha** (`search.test.ts`) — adicionar casos concretos que a substring
     atual reprova:
     - **Sem acento (bidirecional):**
       `rankItems('nao', [{ label: 'Não perturbe' }]).map(i => i.label)` → `['Não perturbe']`
       e `rankItems('não', [{ label: 'Nao perturbe' }])` também casa (normalização NFD nos
       dois lados).
     - **Fuzzy (subsequência não contígua):**
       `rankItems('btS', [{ label: 'Batuta Search' }]).map(i => i.label)` → `['Batuta Search']`
       (b→t→s como subsequência); e `rankItems('xqz', [{ label: 'Batuta Search' }])` → `[]`.
     - **Multi-palavra AND, ordem-independente:**
       `rankItems('cri term', [{ label: 'Criar Terminal' }, { label: 'Criar Nota' }])`
       → `['Criar Terminal']` (só ele casa **ambos** os termos); e
       `rankItems('term cri', [{ label: 'Criar Terminal' }])` → `['Criar Terminal']`
       (ordem dos termos não importa).
     - **Prefixo/palavra vence subsequência espalhada:** com dois itens que ambos casam,
       o que começa com o termo (ou casa em fronteira de palavra) rankeia primeiro.
  2. **Implementação** (`search.ts`) — reescrever `rankItems` mantendo a assinatura
     `rankItems<T extends { label: string }>(query, items): T[]`:
     - helper puro `normalizar(s: string)`: `s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()`.
     - `const termos = normalizar(query).split(/\s+/).filter(Boolean)`; se vazio → `return items` (preserva o teste "query vazia").
     - para cada item, normalizar o `label`; cada termo precisa casar como **subsequência**
       (helper `subsequenceScore(termo, haystack)` que devolve `null` se não é subsequência,
       ou um score numérico). **Todos** os termos precisam passar (refino **AND**); se algum
       falha, item sai.
     - **scoring** por termo com bônus: match no **início** do haystack (idx 0), match em
       **fronteira de palavra** (após espaço), **contiguidade** dos chars casados, e
       **precocidade** (primeiro índice menor pontua mais). Score total = soma dos termos.
     - ordenar por **score desc** e, no empate, **label mais curto** (`a.label.length - b.label.length`)
       — preserva a intenção do tie-break atual.
  3. **Verde:** `npx vitest run src/renderer/src/search.test.ts`
- **Critérios de aceite:**
  - `'btS'` casa `'Batuta Search'`; `'nao'` casa `'Não perturbe'`; `'não'` casa `'Nao perturbe'`.
  - `'cri term'` e `'term cri'` casam `'Criar Terminal'` e **não** `'Criar Nota'`.
  - `rankItems('', items)` devolve todos (len 5); `rankItems('xqz', …)` devolve `[]`.
  - Teste "prefixo vence match no meio" continua verde (`'re'` → `Reload` antes de `Backend Reviewer`).
  - `npm run typecheck` e `npm run lint` limpos.
- **Notas / riscos:**
  - **Revisão obrigatória de 1 teste existente:** o caso `'filtra por substring
    case-insensitive'` afirma `rankItems('DEV', items)` **`toEqual(['Dev'])`** (exatamente 1).
    Sob fuzzy, `'dev'` também é subsequência de `'Backend Reviewer'`
    (d…e…v), então o retorno passa a conter **os dois**. Isso é a **mudança de contrato
    esperada** (substring → fuzzy), não um bug: atualizar o teste para o novo contrato —
    ex.: `expect(rankItems('DEV', items).map(i => i.label)[0]).toBe('Dev')` (match contíguo/
    prefixo rankeia acima da subsequência espalhada) e/ou asserir `.toContain('Dev')`.
    O caso `'portal'` → `['Criar Portal']` permanece **exato** (nenhum outro label tem a
    subsequência `p-o-r-t-a-l`), então continua verde sem mudança.
  - Edge cases a testar: query só de espaços (`'   '` → todos, via `filter(Boolean)`); termo
    com char repetido (`'ll'` deve exigir dois `l`); haystack mais curto que o termo.
  - Manter `rankItems` **sem dependências externas** (nada de Fuse.js) — subsequência + bônus
    resolvem o gap e mantêm o teste unitário trivial e determinístico.

### T2 — Indexar o corpo das notas via `searchText` (+ prioridade nome sobre corpo)  [P1 · M · Onda 1]

- **Arquivos a tocar:**
  - `src/renderer/src/palette/paletteCommands.ts`
  - `src/renderer/src/palette/paletteCommands.test.ts`
  - `src/renderer/src/search.ts`
  - `src/renderer/src/search.test.ts`
  - *(sem mudança em `CommandPalette.tsx` — ver Notas)*
- **Passos TDD:**
  1. **Teste que falha:**
     - Em `paletteCommands.test.ts`: nó nota com corpo longo →
       `buildPaletteItems({ nodes: [{ id: 'n1', type: 'note', data: { content: 'reunião sobre kubernetes e deploy…(texto longo)' } }], edges: [], selectedNodes: [], actions })`;
       o item `node:n1` deve ter **`label`** começando com `'Nota: '` (truncado a 24 chars)
       **e** **`searchText`** igual ao **corpo inteiro** (`'reunião sobre kubernetes e deploy…'`,
       sem truncar). Ex.: `expect(item.searchText).toContain('kubernetes')` e
       `expect(item.label.length).toBeLessThanOrEqual('Nota: '.length + 24)`.
     - Em `search.test.ts`: **match no corpo** —
       `rankItems('kubernetes', [{ label: 'Nota: reunião sobre kube', searchText: 'reunião sobre kubernetes e deploy' }]).map(i => i.label)`
       → casa (termo só existe no `searchText`).
       **Nome vence corpo** — dois itens, um com `'deploy'` no `label` e outro com `'deploy'`
       só no `searchText`; `rankItems('deploy', …)[0]` deve ser o do **label**.
  2. **Implementação:**
     - `paletteCommands.ts`: adicionar campo opcional `searchText?: string` ao `interface
       PaletteItem`. No loop `for (const n of nodes)`, quando `n.type === 'note'`, montar o
       item de navegação com `searchText: ((n.data?.content as string) || '').trim()`
       (label continua `nodeLabel(n)`, curto). Demais tipos podem omitir `searchText`.
     - `search.ts`: ampliar o constraint para
       `T extends { label: string; searchText?: string }`. Cada termo casa se for subsequência
       do **nome** (`normalizar(label)`) **ou** do **corpo** (`normalizar(searchText ?? '')`).
       Dar **bônus grande a match no nome** sobre match só-no-corpo, de modo que "matches no
       nome precedem matches no corpo" (regra do Maestri). Um item passa se **todos** os
       termos casam em nome **ou** corpo.
  3. **Verde:** `npx vitest run src/renderer/src/search.test.ts src/renderer/src/palette/paletteCommands.test.ts`
- **Critérios de aceite:**
  - Item `node:<id>` de nota carrega o **corpo inteiro** em `searchText`; `label` segue truncado.
  - `rankItems` acha o item por um termo presente **só** no `searchText`.
  - Entre um match no nome e um match só no corpo, o do **nome** vem primeiro.
  - Todos os testes de `paletteCommands.test.ts` seguem verdes (nada de `searchText` quebra os existentes).
  - `npm run typecheck` e `npm run lint` limpos.
- **Notas / riscos:**
  - **`CommandPalette.tsx` não precisa mudar:** ele já passa `n.data` completo (com `content`)
    para `buildPaletteItems` (linhas 119–123), e `rankItems(query, items)` (linha 160) passa a
    receber itens já com `searchText`. O tipo `T` inferido satisfaz o novo constraint.
  - Notas muito longas: `searchText` é string em memória por render do `useMemo`; aceitável
    para o volume típico de um canvas. Se virar gargalo (muitas notas enormes), avaliar limitar
    o corpo indexado (ex.: primeiros N KB) — **não** fazer agora (YAGNI).
  - Manter o `label` curto é intencional (exibição); o realce (T3) só destaca no `label`, então
    matches que ocorrem **apenas** no corpo aparecem sem negrito — comportamento aceitável.

### T3 — Realce dos caracteres combinados  [P2 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/search.ts` *(helper novo de posições)*
  - `src/renderer/src/search.test.ts`
  - `src/renderer/src/components/CommandPalette.tsx`
  - `src/renderer/src/components/CommandPalette.css` *(estilo do `<b>`, se preciso)*
- **Passos TDD:**
  1. **Teste que falha** (`search.test.ts`) — exportar helper puro
     `matchRanges(query, label): Array<[number, number]>` (intervalos `[início, fim)` no
     `label` **original**, respeitando acentos na posição):
     - `matchRanges('bt', 'Batuta Search')` → intervalos cobrindo o `B` (idx 0) e um `t`.
     - `matchRanges('', 'Qualquer')` → `[]`.
     - `matchRanges('xyz', 'Batuta')` → `[]` (sem match).
     - Casos multi-palavra: `matchRanges('ba se', 'Batuta Search')` cobre trechos de ambos os termos.
  2. **Implementação:**
     - `search.ts`: `matchRanges` reaproveita a mesma normalização/subsequência de T1, mas
       devolve **índices no label original** (mapear posição normalizada → original; como NFD
       só **remove** diacríticos combinantes e não desloca a base, um índice por caractere-base
       preserva o alinhamento — cobrir isso com um teste de string acentuada).
     - `CommandPalette.tsx`: no render do item (linha ~269, `ork-palette-item-label`), quebrar
       `item.label` em segmentos usando `matchRanges(query, item.label)` e envolver os trechos
       casados em `<b>`. `rankItems` **não muda** (helper separado = zero risco ao ranqueamento).
  3. **Verde:** `npx vitest run src/renderer/src/search.test.ts`
- **Critérios de aceite:**
  - `matchRanges` é pura, testada, e devolve `[]` para query vazia ou sem match.
  - Na paleta, os caracteres casados aparecem em negrito; strings acentuadas destacam a posição correta.
  - `npm run typecheck` e `npm run lint` limpos.
- **Notas / riscos:**
  - Preferir **helper separado** a mudar o retorno de `rankItems` — evita mexer nos testes de
    ranqueamento e mantém o contrato de T1/T2 intacto.
  - Só destaca o `label`; match só-no-corpo (via `searchText`) não tem o que destacar — ok.

### T4 — Expor ações globais já existentes na paleta  [P2 · S · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/palette/paletteCommands.ts`
  - `src/renderer/src/palette/paletteCommands.test.ts`
  - `src/renderer/src/components/CommandPalette.tsx` *(injeta os callbacks reais)*
- **Passos TDD:**
  1. **Teste que falha** (`paletteCommands.test.ts`) — `buildPaletteItems` recebe novos
     callbacks em `PaletteActions` (ex.: `openInEditor`, `newProject`) e produz itens globais
     `Abrir no editor` e `Novo projeto`; `run()` deve chamar o callback correspondente. Ex.:
     `const item = items.find(i => i.id === 'action:editor'); item?.run?.(); expect(actions.openInEditor).toHaveBeenCalled()`.
  2. **Implementação:**
     - `paletteCommands.ts`: acrescentar os callbacks à interface `PaletteActions` e empurrar
       os itens `kind: 'action'` no bloco de ações globais (junto de `Criar Terminal` etc.).
     - `CommandPalette.tsx`: ligar os novos callbacks aos handlers reais (reusar `onNewProject`/
       "Abrir no editor" do `Topbar.tsx` — expor via store ou props conforme o cabeamento atual).
  3. **Verde:** `npx vitest run src/renderer/src/palette/paletteCommands.test.ts`
- **Critérios de aceite:**
  - Novos itens globais aparecem na paleta e disparam os callbacks reais existentes.
  - Nenhum `kind` novo é introduzido (reusa `'action'`), então `KIND_LABELS`/`KIND_GROUP_LABELS` não mudam.
  - `npm run typecheck` e `npm run lint` limpos.
- **Notas / riscos:**
  - Reuso puro de callbacks já existentes; risco baixo. Confirmar a via de cabeamento (store vs.
    props) no `Canvas.tsx`/`Topbar.tsx` antes de escolher onde os handlers vivem.
  - Se algum callback exigir contexto ausente (ex.: `openInEditor` sem `cwd`), esconder o item
    ou torná-lo no-op silencioso (mesmo padrão do SSH inválido em `CommandPalette.tsx`).

### T5 — Índice cross-projeto  [P3 · L · Onda 3]

- **Arquivos a tocar:**
  - `src/main/projects/ProjectManager.ts` *(expor leitura dos nós de outros projetos)*
  - `src/main/projects/registerProjectIpc.ts` *(canal IPC para o índice cross-projeto)*
  - `src/renderer/src/palette/paletteCommands.ts` *(mesclar itens de nós de outros projetos)*
  - `src/renderer/src/palette/paletteCommands.test.ts`
  - `src/renderer/src/components/CommandPalette.tsx` *(ao escolher, trocar projeto ativo + focar)*
  - `(novo)` `src/main/projects/crossProjectIndex.ts` — construção pura do índice `{ id, tipo, nome, projeto, searchText? }` a partir dos `projects/<id>.json`.
- **Passos TDD:**
  1. **Teste que falha** — em teste de unidade puro do índice (`crossProjectIndex.test.ts`, novo):
     dado dois projetos com nós, `buildCrossProjectIndex(projects)` devolve entradas de **ambos**,
     cada uma marcando seu `projectId`; e um item cross-projeto carrega o `projectId` para a
     execução saber que precisa **trocar de projeto** antes de focar o nó.
  2. **Implementação:**
     - Lado main: `ProjectManager` lê os `projects/<id>.json` (reusa `list()` para enumerar) e
       expõe um índice leve de nós por projeto via IPC (`crossProjectIndex.ts` faz a parte pura).
     - Lado renderer: `buildPaletteItems` (ou um novo builder) mescla os itens cross-projeto
       (kind `'node'`, com `searchText` para notas) aos do canvas ativo; `rankItems` (já
       fuzzy/searchText das Ondas 1–2) rankeia tudo junto. Dar **bônus ao projeto atual** no
       score (regra "espaço de trabalho atual recebe prioridade" do Maestri).
     - Execução: ao escolher um item de outro projeto, `CommandPalette` dispara a troca de
       projeto ativo (IPC do `ProjectManager`) e então `focusNode` após o canvas recarregar.
  3. **Verde:** `npx vitest run src/main/projects/crossProjectIndex.test.ts src/renderer/src/palette/paletteCommands.test.ts`
- **Critérios de aceite:**
  - Índice puro cobre nós de **todos** os projetos, cada entrada com `projectId`.
  - Buscar acha nós de projetos não-ativos; selecionar **troca o projeto** e centraliza o nó.
  - Projeto atual recebe prioridade no ranqueamento.
  - `npm run typecheck` e `npm run lint` limpos.
- **Notas / riscos:**
  - **Maior salto de capacidade e maior risco.** Depende de T1/T2 (fuzzy + `searchText`) já
    prontos. Cuidado com o **incidente de corrupção cross-project** já registrado na memória do
    projeto — o índice deve ser **somente leitura** e **escopado por projeto**; nunca gravar
    cruzado. Troca de projeto ativo é assíncrona (recarrega o `canvasStore`): o `focusNode` só
    pode rodar **após** o canvas do projeto-alvo estar montado.
  - O Maestri tem "andares" (floors); o Orkestra não. Não introduzir esse conceito agora — só
    projeto → nó.

## 5. Dependências & riscos

- **Ordem:** T1 → T2 são independentes de UI e destravam T3 (realce reaproveita a normalização
  de T1) e T5 (que precisa de fuzzy + `searchText`). T4 é independente das demais (pode ir a
  qualquer momento da Onda 2). T5 depende de T1+T2.
- **Contrato mudado (T1):** substring → fuzzy muda resultados; **1 teste existente
  (`'DEV'` → `toEqual(['Dev'])`) precisa ser revisado** para o novo contrato — está documentado
  em T1 · Notas e é intencional, não regressão.
- **Sem dependências novas:** subsequência + bônus resolvem o fuzzy; **não** adicionar Fuse.js/
  fzf (mantém o teste puro, determinístico e a bundle enxuta).
- **Risco de performance (T2):** `searchText` com corpos grandes multiplicados por muitas notas.
  Baixo no uso típico; mitigação (limitar corpo indexado) só se medido — não antecipar.
- **Risco alto (T5):** corrupção/escopo cross-projeto (ver memória do projeto) e assincronismo da
  troca de projeto antes do `focusNode`. Tratar índice como read-only e escopado.
- **Verificação por tarefa:** `npx vitest run <arquivo(s)>`, depois `npm run typecheck` e
  `npm run lint` antes de considerar a tarefa pronta.

## 6. Referências

- **Análise de origem:** `docs/analise-maestri-360/batuta-search.md` (§2.2 busca fuzzy
  multi-palavra; §4 desenho do backend — normalização NFD, tokenização AND, scoring; §5 estado
  atual e lacunas; §6 melhorias priorizadas).
- **Código real verificado:**
  - `src/renderer/src/search.ts` · `src/renderer/src/search.test.ts` — `rankItems` puro + testes.
  - `src/renderer/src/palette/paletteCommands.ts` · `paletteCommands.test.ts` — `PaletteItem`,
    `buildPaletteItems`, `nodeLabel` (puros + testes).
  - `src/renderer/src/components/CommandPalette.tsx` — consumo de `rankItems`/`PaletteItem`
    (linha 160 e mapeamento de nós 119–123).
  - `src/renderer/src/store/canvasStore.ts` — corpo da nota em `n.data.content` (~596).
  - `src/renderer/src/components/Topbar.tsx` — callbacks reais reusáveis (T4).
  - `src/main/projects/ProjectManager.ts` — `list()` de projetos (T5).
- **Comandos:** `package.json` → `test` (`vitest run`), `typecheck`, `lint`.
- **Nota de escopo:** i18n/localização das strings **fora de escopo** nesta rodada (lacuna nº 10
  da análise).
