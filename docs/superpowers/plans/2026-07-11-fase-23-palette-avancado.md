# Orkestra — Fase 23 (Command Palette Avançado) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** O command palette (Cmd+K) deixa de ter só ações fixas e passa a oferecer **ações contextuais ao(s) nó(s) selecionado(s)** (focar, remover; e para terminais: renomear, definir papel) e **conectar/desconectar** nós pela própria palette — além de ganhar a ação que faltava ("Criar Árvore de Arquivos"). Renomear/papel usam um **modo de entrada de texto** dentro da palette (o Electron desabilita `window.prompt`).

**Architecture:** A construção da lista de comandos sai de dentro do componente para um módulo puro `src/renderer/src/palette/paletteCommands.ts` — `buildPaletteItems(ctx): PaletteItem[]` recebe `{ nodes, edges, selectedNodes, actions }` e devolve itens planos (globais + contextuais + connect/disconnect + nós-para-focar). Itens que precisam de texto (renomear/papel) carregam um campo `input` em vez de `run`. O `CommandPalette.tsx` passa a ler a seleção (`nodes.filter(n => n.selected)`), montar o `ctx.actions` com as store actions reais, e ganha um **modo input** (uma segunda tela com um `<input>` cujo submit chama `item.input.submit(value)`). A busca continua via `rankItems` (`search.ts`).

**Tech Stack:** React 18, zustand, `@xyflow/react` (`useReactFlow().setCenter`). Vitest (`*.test.ts`, node env) — a lógica testável fica no módulo puro.

## Global Constraints

- **Contrato preservado:** `onConnect` aceita um `Connection` (`{source, target, sourceHandle:null, targetHandle:null}`); `removeEdge(id)` (Fase 22); `updateTerminalName(id,name)`/`updateTerminalRole(id,role)`; `removeNode(id)` já existem — a palette apenas os chama. Não alterar suas assinaturas.
- **Sem `window.prompt`/`alert`/`confirm`** (Electron os bloqueia) — entrada de texto é um `<input>` dentro da palette.
- Renderer não importa `fs`/`http`/`node-pty`/`child_process`. Sem novos canais IPC nesta fase (só store + UI).
- Zero regressão ao palette atual (criar terminal/nota/portal, focar nó, teclado ↑↓/Enter/Esc/Tab) nem a seleção/grupos/edges. PT-BR, sem marcas de terceiros.

---

### Task 1: Módulo puro `paletteCommands.ts` — TDD

**Files:**
- Create: `src/renderer/src/palette/paletteCommands.ts`, `src/renderer/src/palette/paletteCommands.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PaletteItem {
    id: string
    label: string
    kind: 'action' | 'node' | 'context' | 'connect' | 'disconnect'
    run?: () => void
    input?: { placeholder: string; initial: string; submit: (value: string) => void }
  }
  export interface PaletteNode { id: string; type?: string; data?: Record<string, unknown>; selected?: boolean }
  export interface PaletteEdge { id: string; source: string; target: string }
  export interface PaletteActions {
    addTerminalNode: () => void
    addNoteNode: () => void
    addPortalNode: () => void
    addFileTreeNode: () => void
    focusNode: (id: string) => void
    removeNode: (id: string) => void
    renameTerminal: (id: string, name: string) => void
    setTerminalRole: (id: string, role: string) => void
    connect: (source: string, target: string) => void
    removeEdge: (id: string) => void
  }
  export interface PaletteContext {
    nodes: PaletteNode[]
    edges: PaletteEdge[]
    selectedNodes: PaletteNode[]
    actions: PaletteActions
  }
  export function nodeLabel(n: PaletteNode): string
  export function buildPaletteItems(ctx: PaletteContext): PaletteItem[]
  ```

- [ ] **Step 1: Testes (falham primeiro)**

`src/renderer/src/palette/paletteCommands.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { buildPaletteItems, nodeLabel, type PaletteContext, type PaletteActions } from './paletteCommands'

function noopActions(): PaletteActions {
  return {
    addTerminalNode: vi.fn(),
    addNoteNode: vi.fn(),
    addPortalNode: vi.fn(),
    addFileTreeNode: vi.fn(),
    focusNode: vi.fn(),
    removeNode: vi.fn(),
    renameTerminal: vi.fn(),
    setTerminalRole: vi.fn(),
    connect: vi.fn(),
    removeEdge: vi.fn()
  }
}

describe('nodeLabel', () => {
  it('usa o nome do terminal, senão o tipo', () => {
    expect(nodeLabel({ id: 't1', type: 'terminal', data: { name: 'Dev' } })).toBe('Dev')
    expect(nodeLabel({ id: 'n1', type: 'note', data: {} })).toContain('Nota')
  })
})

describe('buildPaletteItems', () => {
  it('sempre inclui as 4 ações globais de criação', () => {
    const items = buildPaletteItems({ nodes: [], edges: [], selectedNodes: [], actions: noopActions() })
    const labels = items.map((i) => i.label)
    expect(labels).toContain('Criar Terminal')
    expect(labels).toContain('Criar Nota')
    expect(labels).toContain('Criar Portal')
    expect(labels).toContain('Criar Árvore de Arquivos')
  })

  it('sem seleção, não há itens de contexto/connect/disconnect', () => {
    const nodes = [{ id: 't1', type: 'terminal', data: { name: 'A' } }]
    const items = buildPaletteItems({ nodes, edges: [], selectedNodes: [], actions: noopActions() })
    expect(items.some((i) => i.kind === 'context')).toBe(false)
    expect(items.some((i) => i.kind === 'connect')).toBe(false)
  })

  it('terminal selecionado gera focar, remover, renomear (com input) e definir papel (com input)', () => {
    const t = { id: 't1', type: 'terminal', data: { name: 'A', role: '' }, selected: true }
    const actions = noopActions()
    const items = buildPaletteItems({ nodes: [t], edges: [], selectedNodes: [t], actions })
    const rename = items.find((i) => i.id.startsWith('ctx:rename:'))
    expect(rename?.input).toBeTruthy()
    rename?.input?.submit('Novo')
    expect(actions.renameTerminal).toHaveBeenCalledWith('t1', 'Novo')
    const role = items.find((i) => i.id.startsWith('ctx:role:'))
    expect(role?.input).toBeTruthy()
    expect(items.some((i) => i.id === 'ctx:focus:t1')).toBe(true)
    expect(items.some((i) => i.id === 'ctx:remove:t1')).toBe(true)
  })

  it('oferece conectar a outros nós ainda não conectados, e não a si mesmo', () => {
    const a = { id: 't1', type: 'terminal', data: { name: 'A' }, selected: true }
    const b = { id: 't2', type: 'terminal', data: { name: 'B' } }
    const actions = noopActions()
    const items = buildPaletteItems({ nodes: [a, b], edges: [], selectedNodes: [a], actions })
    const connect = items.find((i) => i.kind === 'connect')
    expect(connect?.label).toContain('B')
    connect?.run?.()
    expect(actions.connect).toHaveBeenCalledWith('t1', 't2')
    // não conecta a si mesmo
    expect(items.some((i) => i.id === 'connect:t1:t1')).toBe(false)
  })

  it('não oferece conectar a um nó já conectado; oferece desconectar a edge existente', () => {
    const a = { id: 't1', type: 'terminal', data: { name: 'A' }, selected: true }
    const b = { id: 't2', type: 'terminal', data: { name: 'B' } }
    const edges = [{ id: 'e1', source: 't1', target: 't2' }]
    const actions = noopActions()
    const items = buildPaletteItems({ nodes: [a, b], edges, selectedNodes: [a], actions })
    expect(items.some((i) => i.kind === 'connect')).toBe(false)
    const disc = items.find((i) => i.kind === 'disconnect')
    expect(disc?.label).toContain('B')
    disc?.run?.()
    expect(actions.removeEdge).toHaveBeenCalledWith('e1')
  })
})
```

- [ ] **Step 2: Rodar → falha** (`npm test -- paletteCommands`).

- [ ] **Step 3: Implementar `paletteCommands.ts`**
```ts
export interface PaletteItem {
  id: string
  label: string
  kind: 'action' | 'node' | 'context' | 'connect' | 'disconnect'
  run?: () => void
  input?: { placeholder: string; initial: string; submit: (value: string) => void }
}
export interface PaletteNode {
  id: string
  type?: string
  data?: Record<string, unknown>
  selected?: boolean
}
export interface PaletteEdge {
  id: string
  source: string
  target: string
}
export interface PaletteActions {
  addTerminalNode: () => void
  addNoteNode: () => void
  addPortalNode: () => void
  addFileTreeNode: () => void
  focusNode: (id: string) => void
  removeNode: (id: string) => void
  renameTerminal: (id: string, name: string) => void
  setTerminalRole: (id: string, role: string) => void
  connect: (source: string, target: string) => void
  removeEdge: (id: string) => void
}
export interface PaletteContext {
  nodes: PaletteNode[]
  edges: PaletteEdge[]
  selectedNodes: PaletteNode[]
  actions: PaletteActions
}

export function nodeLabel(n: PaletteNode): string {
  if (n.type === 'terminal') return (n.data?.name as string) || 'Terminal'
  if (n.type === 'portal') return (n.data?.name as string) || 'Portal'
  if (n.type === 'note') {
    const c = ((n.data?.content as string) || '').trim().replace(/\s+/g, ' ')
    return c ? `Nota: ${c.slice(0, 24)}` : 'Nota'
  }
  if (n.type === 'filetree') return 'Arquivos'
  if (n.type === 'group') return 'Grupo'
  return n.type || 'Nó'
}

function connected(edges: PaletteEdge[], a: string, b: string): boolean {
  return edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a))
}

export function buildPaletteItems(ctx: PaletteContext): PaletteItem[] {
  const { nodes, edges, selectedNodes, actions } = ctx
  const items: PaletteItem[] = [
    { id: 'action:terminal', label: 'Criar Terminal', kind: 'action', run: actions.addTerminalNode },
    { id: 'action:note', label: 'Criar Nota', kind: 'action', run: actions.addNoteNode },
    { id: 'action:portal', label: 'Criar Portal', kind: 'action', run: actions.addPortalNode },
    { id: 'action:filetree', label: 'Criar Árvore de Arquivos', kind: 'action', run: actions.addFileTreeNode }
  ]

  for (const n of selectedNodes) {
    const name = nodeLabel(n)
    items.push({ id: `ctx:focus:${n.id}`, label: `Focar ${name}`, kind: 'context', run: () => actions.focusNode(n.id) })
    items.push({ id: `ctx:remove:${n.id}`, label: `Remover ${name}`, kind: 'context', run: () => actions.removeNode(n.id) })
    if (n.type === 'terminal') {
      items.push({
        id: `ctx:rename:${n.id}`,
        label: `Renomear ${name}`,
        kind: 'context',
        input: { placeholder: 'Novo nome', initial: (n.data?.name as string) || '', submit: (v) => actions.renameTerminal(n.id, v) }
      })
      items.push({
        id: `ctx:role:${n.id}`,
        label: `Definir papel de ${name}`,
        kind: 'context',
        input: { placeholder: 'Papel (ex.: Revisor)', initial: (n.data?.role as string) || '', submit: (v) => actions.setTerminalRole(n.id, v) }
      })
    }
    for (const other of nodes) {
      if (other.id === n.id) continue
      if (connected(edges, n.id, other.id)) continue
      items.push({
        id: `connect:${n.id}:${other.id}`,
        label: `Conectar ${name} → ${nodeLabel(other)}`,
        kind: 'connect',
        run: () => actions.connect(n.id, other.id)
      })
    }
    for (const e of edges) {
      if (e.source !== n.id && e.target !== n.id) continue
      const otherId = e.source === n.id ? e.target : e.source
      const other = nodes.find((x) => x.id === otherId)
      items.push({
        id: `disconnect:${e.id}`,
        label: `Desconectar ${name} ↔ ${other ? nodeLabel(other) : otherId}`,
        kind: 'disconnect',
        run: () => actions.removeEdge(e.id)
      })
    }
  }

  for (const n of nodes) {
    items.push({ id: `node:${n.id}`, label: nodeLabel(n), kind: 'node', run: () => actions.focusNode(n.id) })
  }
  return items
}
```

- [ ] **Step 4: Rodar → verde** + `npm run typecheck` limpo.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: paletteCommands puro (buildPaletteItems: acoes contextuais + connect/disconnect) (Fase 23)"`

---

### Task 2: Integrar no `CommandPalette` + modo input (+ checkpoint)

**Files:**
- Modify: `src/renderer/src/components/CommandPalette.tsx`, `src/renderer/src/components/CommandPalette.css`

**Interfaces:**
- Consumes: `buildPaletteItems`, `PaletteItem` de `../palette/paletteCommands`; `rankItems` de `../search`; store (`nodes`, `edges`, `addTerminalNode`, `addNoteNode`, `addPortalNode`, `addFileTreeNode`, `removeNode`, `updateTerminalName`, `updateTerminalRole`, `onConnect`, `removeEdge`); `useReactFlow().setCenter`.

- [ ] **Step 1: Reescrever a montagem de itens** — no `CommandPalette.tsx`, substituir o `useMemo` que hoje monta `actions`+`nodeItems` inline por:
```tsx
const nodes = useCanvasStore((s) => s.nodes)
const edges = useCanvasStore((s) => s.edges)
const addTerminalNode = useCanvasStore((s) => s.addTerminalNode)
const addNoteNode = useCanvasStore((s) => s.addNoteNode)
const addPortalNode = useCanvasStore((s) => s.addPortalNode)
const addFileTreeNode = useCanvasStore((s) => s.addFileTreeNode)
const removeNode = useCanvasStore((s) => s.removeNode)
const updateTerminalName = useCanvasStore((s) => s.updateTerminalName)
const updateTerminalRole = useCanvasStore((s) => s.updateTerminalRole)
const onConnect = useCanvasStore((s) => s.onConnect)
const removeEdge = useCanvasStore((s) => s.removeEdge)
const { setCenter } = useReactFlow()

const focusNode = (id: string): void => {
  const n = nodes.find((x) => x.id === id)
  if (n) setCenter(n.position.x + (n.width ?? 200) / 2, n.position.y + (n.height ?? 120) / 2, { zoom: 1.2, duration: 300 })
}

const items = useMemo(
  () =>
    buildPaletteItems({
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data as Record<string, unknown>, selected: n.selected })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      selectedNodes: nodes.filter((n) => n.selected).map((n) => ({ id: n.id, type: n.type, data: n.data as Record<string, unknown>, selected: true })),
      actions: {
        addTerminalNode,
        addNoteNode,
        addPortalNode,
        addFileTreeNode,
        focusNode,
        removeNode,
        renameTerminal: updateTerminalName,
        setTerminalRole: updateTerminalRole,
        connect: (source, target) => onConnect({ source, target, sourceHandle: null, targetHandle: null }),
        removeEdge
      }
    }),
  [nodes, edges, addTerminalNode, addNoteNode, addPortalNode, addFileTreeNode, removeNode, updateTerminalName, updateTerminalRole, onConnect, removeEdge]
)
```
(Manter os tipos alinhados ao que o store expõe; `n.type`/`n.data`/`n.selected`/`n.width`/`n.height`/`n.position` já existem nos nós do React Flow. Se o lint reclamar de `focusNode` nas deps do `useMemo`, ou envolvê-lo em `useCallback`, ou incluí-lo — seguir o padrão do arquivo.)

- [ ] **Step 2: Modo input** — adicionar estado e a segunda tela:
```tsx
const [inputItem, setInputItem] = useState<PaletteItem | null>(null)
const [inputValue, setInputValue] = useState('')

const runItem = (item: PaletteItem): void => {
  if (item.input) {
    setInputItem(item)
    setInputValue(item.input.initial)
    return
  }
  item.run?.()
  onClose()
}

const submitInput = (): void => {
  if (inputItem?.input) inputItem.input.submit(inputValue)
  setInputItem(null)
  onClose()
}
```
Renderização: quando `inputItem` é não-nulo, no lugar da lista mostrar um cabeçalho com `inputItem.label` + um `<input autoFocus>` (value=`inputValue`, onChange) com handlers: **Enter** → `submitInput()`; **Esc** → `setInputItem(null)` (volta à lista, não fecha). Quando `inputItem` é nulo, a lista atual (busca + itens) funciona como hoje, só que `onKeyDown`/`Enter` chama `runItem(filtered[activeIndex])`. Garantir que a busca/`activeIndex` não interfira no modo input (ex.: só tratar ↑↓/Enter da lista quando `!inputItem`).

- [ ] **Step 3: Rótulos por kind (opcional, leve)** — no CSS/markup, dar uma dica visual por `item.kind` (ex.: um badge pequeno "conectar"/"contexto") reusando as cores dos tokens; manter sutil. Não obrigatório para a lógica.

- [ ] **Step 4: CSS** — em `CommandPalette.css`, estilos para o modo input (`.ork-palette-input`) e, se feito o Step 3, para os badges de kind. Usar tokens existentes.

- [ ] **Step 5: Testes + typecheck + build + lint** — `npm test` (verde; a lógica testável está no módulo puro da Task 1), `npm run typecheck`, `npm run build`, `npm run lint` — limpos.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: palette com acoes contextuais por selecao + connect/disconnect + modo input (Fase 23)"`

- [ ] **Step 7: CHECKPOINT VISUAL (humano)** — `npm run dev`. Cmd+K sem seleção mostra as 4 criações + focar nós. Selecionar um terminal → aparecem "Focar", "Remover", "Renomear", "Definir papel", e "Conectar … → <outros>". Escolher "Renomear" abre o campo de texto; digitar + Enter renomeia (o header do terminal atualiza). Escolher "Conectar … → B" cria a conexão tipada; com a conexão existente, some o "Conectar" e aparece "Desconectar … ↔ B" que a remove. Esc no modo input volta à lista; Esc na lista fecha.

---

## Notas de risco
- **Explosão de itens:** com muitos nós, "Conectar" gera N itens por nó selecionado — a busca por texto (`rankItems`) mitiga, e só aparecem com seleção ativa. Aceitável no MVP; um submenu dedicado é refinamento futuro.
- **Sem `window.prompt`:** o modo input resolve renomear/papel; é a mesma tela que a Fase 24 reusa para "perguntar ao agente".
- **Foco após ação:** `focusNode` usa `setCenter` no centro do nó (position + metade do tamanho) — consistente com o comportamento atual de focar nós.
- **`onConnect` idempotência:** a palette evita ofertar conexões duplicadas (`connected()`), mas mesmo se duas forem criadas, o React Flow gera ids distintos — sem corrupção.
- **Perguntar ao agente com preview** fica para a **Fase 24** (precisa de um registry nodeId→ptyId no renderer + assinar o stream `pty:data`), fora do escopo desta fase.
