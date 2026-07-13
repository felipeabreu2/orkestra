# Onda 4 — Undo/histórico do canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps em checkbox (`- [ ]`).

**Goal:** Desfazer a última ação estrutural do canvas (criar/remover nó, ligar/desligar, agrupar, renomear) via `Cmd/Ctrl+Z` e, depois (Onda 3), pelo botão "reverter" da barra do terminal.

**Architecture:** Uma pilha de snapshots (`past`) no `canvasStore`. Um `commit(tag?)` empurra o estado atual **antes** de cada mutação estrutural; `undo()` restaura o topo. Edições contínuas (renomear tecla a tecla) coalescem por `tag`. Arraste de posição e seleção **não** entram no histórico (ruído). `Cmd/Ctrl+Z` é tratado como atalho sensível a texto (não rouba o undo de um input/terminal focado).

**Tech Stack:** zustand 5, `@xyflow/react` 12, React 18, Vitest (jsdom no teste do store).

## Global Constraints

- UI/comentários/commits em **português** (acentuação correta). Sem novas dependências.
- Teste: o `canvasStore.test.ts` roda em **jsdom** (`@vitest-environment jsdom` no topo) — o undo é testável ali (lógica pura de store). Componentes/atalhos → `typecheck`/`lint`/`build` + checkpoint visual.
- **zustand v5:** `canUndo` é derivado por seletor (`s.past.length > 0`) — primitivo, sem `useShallow`.
- **pty:** desfazer a remoção de um terminal **recria o nó mas inicia um shell novo** (o pty já foi morto ao remover). Aceitável na v1 — documentar no comentário.

---

### Task 1: `past` / `commit` / `undo` no store + instrumentar as mutações

**Files:**
- Modify: `src/renderer/src/store/canvasStore.ts`
- Modify: `src/renderer/src/store/canvasStore.test.ts`

**Interfaces:**
- Produces (no store): `past: Array<{ nodes: Node[]; edges: Edge[] }>`, `commit(tag?: string): void`, `undo(): void`.

- [ ] **Step 1: Testes que falham** — adicionar ao fim de `canvasStore.test.ts`:

```ts
describe('undo/histórico', () => {
  it('undo desfaz a criação de um nó', () => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], lastCommitTag: null })
    useCanvasStore.getState().addNoteNode({ x: 0, y: 0 })
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
  })

  it('undo desfaz uma ligação (edge)', () => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], lastCommitTag: null })
    const s = useCanvasStore.getState()
    s.addNoteNode({ x: 0, y: 0 })
    s.addNoteNode({ x: 100, y: 0 })
    const [a, b] = useCanvasStore.getState().nodes
    s.onConnect({ source: a.id, target: b.id, sourceHandle: null, targetHandle: null })
    expect(useCanvasStore.getState().edges).toHaveLength(1)
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().edges).toHaveLength(0)
  })

  it('renomear coalesce (várias teclas = um passo de undo)', () => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], lastCommitTag: null })
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    const id = useCanvasStore.getState().nodes[0].id
    const before = useCanvasStore.getState().past.length
    useCanvasStore.getState().updateTerminalName(id, 'A')
    useCanvasStore.getState().updateTerminalName(id, 'AB')
    useCanvasStore.getState().updateTerminalName(id, 'ABC')
    // um único snapshot novo para a sequência de rename do mesmo nó
    expect(useCanvasStore.getState().past.length).toBe(before + 1)
    useCanvasStore.getState().undo()
    expect((useCanvasStore.getState().nodes[0].data as { name?: string }).name).toBe('Terminal 1')
  })

  it('undo com histórico vazio é no-op', () => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], lastCommitTag: null })
    expect(() => useCanvasStore.getState().undo()).not.toThrow()
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/renderer/src/store/canvasStore.test.ts -t "undo"`
Expected: FAIL (`commit`/`undo`/`past` não existem; `updateTerminalName` não coalesce).

- [ ] **Step 3: Adicionar estado + ações ao store**

Na interface `CanvasState` (perto de `serialize`/`hydrate`), adicionar:
```ts
  // Onda 4: histórico de undo. `past` guarda snapshots {nodes, edges} tirados ANTES de cada
  // mutação estrutural (não de posição/seleção — isso é ruído). `commit(tag)` empurra; edições
  // contínuas com a MESMA tag (ex.: renomear tecla a tecla) coalescem num só passo. `undo`
  // restaura o topo. Efêmero: NÃO entra em serialize()/hydrate(). Desfazer a remoção de um
  // terminal recria o nó, mas com shell novo (o pty já morreu ao remover).
  past: Array<{ nodes: Node[]; edges: Edge[] }>
  lastCommitTag: string | null
  commit: (tag?: string) => void
  undo: () => void
```

Na criação do store (perto de `nodes: [], edges: []`), inicializar e implementar:
```ts
  past: [],
  lastCommitTag: null,
  commit: (tag): void =>
    set((state) => {
      // Coalescing: uma sequência de edições com a mesma tag (renomear letra a letra) só grava o
      // snapshot inicial — a primeira, quando lastCommitTag ainda era diferente.
      if (tag && tag === state.lastCommitTag) return state
      const snapshot = { nodes: state.nodes, edges: state.edges }
      const past = [...state.past, snapshot].slice(-50) // cap 50
      return { past, lastCommitTag: tag ?? null }
    }),
  undo: (): void =>
    set((state) => {
      if (state.past.length === 0) return state
      const prev = state.past[state.past.length - 1]
      return {
        nodes: prev.nodes,
        edges: prev.edges,
        past: state.past.slice(0, -1),
        lastCommitTag: null
      }
    }),
```

- [ ] **Step 4: Instrumentar as mutações estruturais**

Adicionar `get().commit(...)` como PRIMEIRA linha (antes do `set`) de cada action abaixo. As de criação/remoção/ligação passam `commit()` sem tag (cada uma é um passo discreto); as de edição de texto passam uma tag por-nó (coalesce):

- `addTerminalNode`, `addNoteNode`, `addPortalNode`, `addFileTreeNode`: `get().commit()`
- `removeNode`: já começa com um `if (...) window.orkestra... killForNode`. Pôr `get().commit()` como 1ª linha da função.
- `onConnect`, `removeEdge`: `get().commit()`
- `updateTerminalName`: `get().commit('rename:' + id)`
- `updateTerminalRole`: `get().commit('role:' + id)`
- `updateNoteContent`: `get().commit('note:' + id)`
- `updatePortalUrl`: `get().commit('purl:' + id)`
- `updatePortalName`: `get().commit('pname:' + id)`
- `updateFileTreeRoot`: `get().commit('froot:' + id)`

Para as condicionais (podem ser no-op), commitar só quando vão mutar de fato:
- `removeEdgesForNode`: dentro, após calcular `next`, commitar só se `next.length !== state.edges.length` — reescrever:
```ts
  removeEdgesForNode: (nodeId): void =>
    set((state) => {
      const next = state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
      if (next.length === state.edges.length) return state
      const past = [...state.past, { nodes: state.nodes, edges: state.edges }].slice(-50)
      return { edges: next, past, lastCommitTag: null }
    }),
```
- `groupSelected` / `ungroupSelected` / `ungroupGroupsById`: essas já retornam `state` (no-op) nos guards. Logo após o guard que garante que há trabalho, capturar o snapshot no próprio `set` retornado. Padrão: onde hoje montam `return { nodes: ... }`, trocar para incluir o histórico:
```ts
      const past = [...state.past, { nodes: state.nodes, edges: state.edges }].slice(-50)
      return { nodes: /* ...igual antes... */, past, lastCommitTag: null }
```
(fazer isso nas 3, sempre DEPOIS do respectivo `return state` de no-op, para não gravar snapshot à toa.)

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/renderer/src/store/canvasStore.test.ts`
Expected: PASS (inclui os 4 novos casos e os antigos).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/renderer/src/store/canvasStore.ts src/renderer/src/store/canvasStore.test.ts
git commit -m "feat(canvas): historico de undo no store (commit/undo + coalescing) (Onda 4)"
```

---

### Task 2: `Cmd/Ctrl+Z` + captura de remoção por tecla no `Canvas`

**Files:**
- Modify: `src/renderer/src/components/Canvas.tsx`

**Interfaces:**
- Consumes: `undo`, `commit` do store (Task 1).

- [ ] **Step 1: Commit antes de remoções por tecla (Delete/Backspace)**

Em `Canvas.tsx`, `onNodesChange` e `onEdgesChange` são do store — mas as remoções via tecla passam pelo `onNodesChange`/`onEdgesChange` do store diretamente. Como o store já é a fonte, a captura já ocorre? **Não** para o path do React Flow (`applyNodeChanges`). Então, no wrapper do `ReactFlow`, interceptar: trocar `onNodesChange={onNodesChange}` para um handler local que commita antes de um `remove`:

Adicionar perto dos outros seletores:
```ts
  const commit = useCanvasStore((s) => s.commit)
```
Criar os handlers logo antes do `return`:
```ts
  // Undo (Onda 4): remoções por tecla (Delete/Backspace) passam por aqui — captura um snapshot
  // antes. Mudanças de posição/seleção/dimensão NÃO commitam (evita ruído no histórico).
  const handleNodesChange = (changes: NodeChange[]): void => {
    if (changes.some((c) => c.type === 'remove')) commit()
    onNodesChange(changes)
  }
  const handleEdgesChange = (changes: EdgeChange[]): void => {
    if (changes.some((c) => c.type === 'remove')) commit()
    onEdgesChange(changes)
  }
```
Importar o tipo `EdgeChange` do `@xyflow/react` (já importa `NodeChange`). Trocar no JSX: `onNodesChange={handleNodesChange}` e `onEdgesChange={handleEdgesChange}`.

- [ ] **Step 2: Atalho `Cmd/Ctrl+Z`**

No `handleKeyDown` (dentro do `useEffect` de atalhos), **depois** do guard `if (isTypingTarget(e)) return` (para não roubar o undo de um input/terminal focado), adicionar:
```ts
      // Undo (Onda 4): só quando o foco NÃO está num input/terminal (guard acima) — aí o Cmd+Z é
      // do canvas. Shift+Cmd+Z (redo) fica fora da v1.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        useCanvasStore.getState().undo()
        return
      }
```

- [ ] **Step 3: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: verdes.

- [ ] **Step 4: Checkpoint visual**

Run: `npm run dev`
Verificar: criar um nó e `Cmd/Ctrl+Z` desfaz; ligar dois nós e `Cmd+Z` desliga; apagar um nó (tecla Delete) e `Cmd+Z` traz de volta; renomear um terminal e `Cmd+Z` volta o nome anterior (num passo). Com o foco DENTRO de um terminal, `Cmd+Z` NÃO mexe no canvas (é do shell).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/Canvas.tsx
git commit -m "feat(canvas): Cmd/Ctrl+Z desfaz + captura remocao por tecla (Onda 4)"
```

---

## Self-Review

**Cobertura:** criar/remover nó, ligar/desligar, agrupar/desagrupar, renomear (coalesce) → Task 1; remoção por tecla + atalho → Task 2. O botão "reverter" da barra do terminal (F04) consumirá `undo()` na Onda 3.

**Placeholders:** nenhum — código real em cada passo.

**Type consistency:** `commit(tag?: string)`/`undo()`/`past` idênticos entre store, testes e Canvas; `handleNodesChange`/`handleEdgesChange` usam `NodeChange`/`EdgeChange` do `@xyflow/react`.

**Fora de escopo (v1):** redo (Shift+Cmd+Z); undo de posição/arraste; ressuscitar o pty de um terminal desfeito.
