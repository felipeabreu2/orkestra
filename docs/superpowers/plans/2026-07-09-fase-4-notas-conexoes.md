# Orkestra — Fase 4 (Notas + Conexões) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Adicionar **conexões** (fios visuais entre nós, arrastando de um handle a outro) e **notas** (nós de texto editável) ao canvas — ambos persistidos junto com o layout.

**Architecture:** O `canvasStore` ganha `edges` (padrão controlado do React Flow: `onEdgesChange` + `onConnect` via `addEdge`), ações de nota (`addNoteNode`, `updateNoteContent`), e o `CanvasSnapshot` sobe para `version: 2` (`nodes` + `edges`), com `hydrate` retro-compatível (arquivo v1 sem `edges` → `[]`). O `Canvas` passa `edges`/`onEdgesChange`/`onConnect` ao `ReactFlow` e registra o `nodeTypes.note`. `TerminalFlowNode` e o novo `NoteNode` ganham `Handle`s (source/target). Conteúdo da nota vive em `node.data.content` (já serializado pelo snapshot).

**Tech Stack:** sem deps novas (usa `@xyflow/react` já presente). Vitest.

## Global Constraints

- Plataforma: Electron/Node/TS. Renderer não importa `fs`/`node-pty`.
- **Retro-compatibilidade:** um `canvas.json` da Fase 3 (`version:1`, sem `edges`) deve carregar sem erro (`edges` ausente → `[]`).
- Notas: conteúdo em `node.data.content` (persistido via o `data` do snapshot). Sem markdown-render sofisticado nesta fase — textarea de texto puro é suficiente (render rico fica para depois).
- Nomenclatura: **não** usar marcas do Maestri.
- Conexões nesta fase são **visuais + persistidas apenas** (comunicação agente↔agente é a Fase 6).

---

### Task 1: Store — edges + ações de nota + `CanvasSnapshot v2` (TDD)

**Files:**
- Modify: `src/shared/canvasSnapshot.ts`, `src/renderer/src/store/canvasStore.ts`, `src/renderer/src/store/canvasStore.test.ts`

**Interfaces:**
- Produces:
  - `PersistedEdge { id: string; source: string; target: string }`; `CanvasSnapshot { version: number; nodes: PersistedNode[]; edges: PersistedEdge[] }`.
  - store: `edges: Edge[]`, `onEdgesChange(changes)`, `onConnect(connection)`, `addNoteNode(position?)`, `updateNoteContent(id, content)`; `serialize()` now emits `version:2` + edges; `hydrate()` restores nodes + edges (edges ausente → `[]`).

- [ ] **Step 1: Estender `src/shared/canvasSnapshot.ts`**

```ts
export interface PersistedNode {
  id: string
  type: string
  position: { x: number; y: number }
  width: number
  height: number
  data: Record<string, unknown>
}

export interface PersistedEdge {
  id: string
  source: string
  target: string
}

export interface CanvasSnapshot {
  version: number
  nodes: PersistedNode[]
  edges: PersistedEdge[]
}
```

- [ ] **Step 2: Escrever os testes que falham** (em `canvasStore.test.ts`, adicionar)

```ts
  it('onConnect adiciona uma edge entre dois nós', () => {
    const s = useCanvasStore.getState()
    s.addTerminalNode({ x: 0, y: 0 })
    s.addTerminalNode({ x: 100, y: 0 })
    const [a, b] = useCanvasStore.getState().nodes
    useCanvasStore.getState().onConnect({ source: a.id, target: b.id, sourceHandle: null, targetHandle: null })
    const { edges } = useCanvasStore.getState()
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe(a.id)
    expect(edges[0].target).toBe(b.id)
  })

  it('addNoteNode adiciona um nó note com content vazio', () => {
    useCanvasStore.getState().addNoteNode({ x: 5, y: 5 })
    const n = useCanvasStore.getState().nodes.find((x) => x.type === 'note')!
    expect(n).toBeTruthy()
    expect(n.data).toEqual({ content: '' })
    expect(n.width).toBe(240)
    expect(n.height).toBe(180)
  })

  it('updateNoteContent atualiza o content de uma nota', () => {
    useCanvasStore.getState().addNoteNode()
    const id = useCanvasStore.getState().nodes[0].id
    useCanvasStore.getState().updateNoteContent(id, 'olá')
    expect(useCanvasStore.getState().nodes[0].data).toEqual({ content: 'olá' })
  })

  it('serialize emite version 2 com nodes e edges', () => {
    const s = useCanvasStore.getState()
    s.addTerminalNode({ x: 0, y: 0 })
    s.addTerminalNode({ x: 1, y: 1 })
    const [a, b] = useCanvasStore.getState().nodes
    useCanvasStore.getState().onConnect({ source: a.id, target: b.id, sourceHandle: null, targetHandle: null })
    const snap = useCanvasStore.getState().serialize()
    expect(snap.version).toBe(2)
    expect(snap.nodes).toHaveLength(2)
    expect(snap.edges).toHaveLength(1)
    expect(snap.edges[0]).toMatchObject({ source: a.id, target: b.id })
  })

  it('hydrate restaura nodes e edges; snapshot v1 sem edges vira []', () => {
    // v1 (sem edges) — simula um canvas.json da Fase 3. Requer, no topo do arquivo:
    //   import type { CanvasSnapshot } from '../../../shared/canvasSnapshot'
    useCanvasStore.getState().hydrate({
      version: 1,
      nodes: [{ id: 'terminal-1', type: 'terminal', position: { x: 0, y: 0 }, width: 480, height: 320, data: {} }]
    } as unknown as CanvasSnapshot)
    expect(useCanvasStore.getState().edges).toEqual([])
    useCanvasStore.getState().hydrate({
      version: 2,
      nodes: [{ id: 'terminal-1', type: 'terminal', position: { x: 0, y: 0 }, width: 480, height: 320, data: {} }],
      edges: [{ id: 'e1', source: 'terminal-1', target: 'terminal-1' }]
    })
    expect(useCanvasStore.getState().edges).toHaveLength(1)
  })
```
(Manter os testes existentes.)

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/renderer/src/store/canvasStore.test.ts`
Expected: FAIL (`onConnect`/`addNoteNode`/`updateNoteContent` inexistentes; `edges` indefinido; serialize sem edges).

- [ ] **Step 4: Implementar `canvasStore.ts`**

```ts
import { create } from 'zustand'
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection
} from '@xyflow/react'
import type { CanvasSnapshot } from '../../../shared/canvasSnapshot'

interface CanvasState {
  nodes: Node[]
  edges: Edge[]
  addTerminalNode: (position?: { x: number; y: number }) => void
  addNoteNode: (position?: { x: number; y: number }) => void
  updateNoteContent: (id: string, content: string) => void
  removeNode: (id: string) => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  serialize: () => CanvasSnapshot
  hydrate: (snapshot: CanvasSnapshot) => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  addTerminalNode: (position = { x: 80, y: 80 }): void =>
    set((state) => ({
      nodes: [
        ...state.nodes,
        { id: `terminal-${crypto.randomUUID()}`, type: 'terminal', position, data: {}, width: 480, height: 320 }
      ]
    })),
  addNoteNode: (position = { x: 120, y: 120 }): void =>
    set((state) => ({
      nodes: [
        ...state.nodes,
        { id: `note-${crypto.randomUUID()}`, type: 'note', position, data: { content: '' }, width: 240, height: 180 }
      ]
    })),
  updateNoteContent: (id, content): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, content } } : n))
    })),
  removeNode: (id): void =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id)
    })),
  onNodesChange: (changes): void => set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),
  onEdgesChange: (changes): void => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),
  onConnect: (connection): void => set((state) => ({ edges: addEdge(connection, state.edges) })),
  serialize: (): CanvasSnapshot => ({
    version: 2,
    nodes: get().nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'terminal',
      position: n.position,
      width: n.width ?? 480,
      height: n.height ?? 320,
      data: (n.data ?? {}) as Record<string, unknown>
    })),
    edges: get().edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
  }),
  hydrate: (snapshot): void =>
    set({
      nodes: snapshot.nodes.map((p) => ({
        id: p.id,
        type: p.type,
        position: p.position,
        data: p.data,
        width: p.width,
        height: p.height
      })),
      edges: (snapshot.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target }))
    })
}))
```
Nota: `removeNode` agora também remove edges ligadas ao nó removido (evita edges órfãs). `hydrate` usa `snapshot.edges ?? []` para aceitar arquivos v1.

- [ ] **Step 5: Rodar e ver passar + suíte + typecheck**

Run: `npx vitest run src/renderer/src/store/canvasStore.test.ts && npm test && npm run typecheck`
Expected: verdes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: edges + ações de nota + CanvasSnapshot v2 (Fase 4)"
```

---

### Task 2: Conexões visuais — Handles + wiring no Canvas

**Files:**
- Modify: `src/renderer/src/components/TerminalFlowNode.tsx`, `src/renderer/src/components/Canvas.tsx`

**Interfaces:**
- Consumes: store `edges`/`onEdgesChange`/`onConnect` (Task 1), `@xyflow/react` `Handle`/`Position`.
- Produces: nós conectáveis; edges renderizadas e persistidas.

- [ ] **Step 1: Adicionar Handles ao `TerminalFlowNode.tsx`**

Adicionar o import e dois `Handle` (target à esquerda, source à direita) dentro do fragment, antes do `<div>` de conteúdo:
```tsx
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
```
Logo após `<NodeResizer .../>`:
```tsx
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
```
(Nada mais muda no `TerminalFlowNode`.)

- [ ] **Step 2: Fiar edges/conexão no `Canvas.tsx`**

No corpo do componente `Canvas`, adicionar seletores e props:
```tsx
  const edges = useCanvasStore((s) => s.edges)
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange)
  const onConnect = useCanvasStore((s) => s.onConnect)
```
E no `<ReactFlow>`, adicionar as props `edges={edges}`, `onEdgesChange={onEdgesChange}`, `onConnect={onConnect}` (ao lado das já existentes `nodes`/`onNodesChange`/`nodeTypes`). Nada mais muda.

- [ ] **Step 3: Typecheck + build + testes**

Run: `npm run typecheck && npm run build && npm test`
Expected: limpos/verdes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: nós conectáveis (Handles) + edges no Canvas (Fase 4)"
```

---

### Task 3: `NoteNode` + toolbar "+ Nota" (+ checkpoint visual)

**Files:**
- Create: `src/renderer/src/components/NoteNode.tsx`
- Modify: `src/renderer/src/components/Canvas.tsx`

**Interfaces:**
- Consumes: store `updateNoteContent`/`removeNode`/`addNoteNode`, `@xyflow/react` `NodeResizer`/`Handle`/`Position`/`NodeProps`.
- Produces: nó de nota editável registrado como `nodeTypes.note`; botão "+ Nota" na toolbar.

- [ ] **Step 1: Criar `NoteNode.tsx`**

```tsx
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'

export function NoteNode({ id, selected, data }: NodeProps): JSX.Element {
  const updateNoteContent = useCanvasStore((s) => s.updateNoteContent)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const content = (data?.content as string) ?? ''
  return (
    <>
      <NodeResizer minWidth={160} minHeight={100} isVisible={selected ?? false} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#fef9c3',
          border: '1px solid #e6d97a',
          borderRadius: 6,
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            height: 24,
            background: '#f2e9a0',
            color: '#5b5320',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            cursor: 'grab',
            userSelect: 'none'
          }}
        >
          <span>Nota</span>
          <button
            className="nodrag"
            onClick={() => removeNode(id)}
            style={{ background: 'transparent', border: 'none', color: '#5b5320', fontSize: 15, lineHeight: 1, cursor: 'pointer', padding: '0 4px' }}
            aria-label="Fechar nota"
          >
            ×
          </button>
        </div>
        <textarea
          className="nodrag nowheel"
          value={content}
          onChange={(e) => updateNoteContent(id, e.target.value)}
          placeholder="Escreva…"
          style={{
            flex: 1,
            minHeight: 0,
            resize: 'none',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: '#3b3610',
            fontFamily: 'inherit',
            fontSize: 13,
            padding: 8
          }}
        />
      </div>
    </>
  )
}
```

- [ ] **Step 2: Registrar o tipo + botão no `Canvas.tsx`**

Adicionar o import `import { NoteNode } from './NoteNode'`, incluir no map de tipos: `const nodeTypes = { terminal: TerminalFlowNode, note: NoteNode }`, adicionar o seletor `const addNoteNode = useCanvasStore((s) => s.addNoteNode)`, e um segundo botão na toolbar (ao lado de "+ Terminal"):
```tsx
      <button
        onClick={() => addNoteNode()}
        style={{ position: 'absolute', top: 12, left: 110, zIndex: 10, padding: '6px 12px', background: '#eab308', color: '#3b3610', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
      >
        + Nota
      </button>
```

- [ ] **Step 3: Typecheck + build + testes**

Run: `npm run typecheck && npm run build && npm test`
Expected: limpos/verdes (nenhuma regressão).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: NoteNode (nota editável) + toolbar + Nota (Fase 4)"
```

- [ ] **Step 5: CHECKPOINT VISUAL (humano)**

`npm run dev`. Criar terminais e notas (**+ Terminal**, **+ Nota**); escrever numa nota; **arrastar do handle direito de um nó ao handle esquerdo de outro** para criar uma conexão (o fio aparece). Mover/redimensionar. **Fechar (Cmd+Q) e reabrir**: nós, **texto das notas** e **conexões** devem reaparecer. Fechar um nó remove suas conexões. *(Validado pelo humano; o implementador para no build/typecheck e sinaliza pendência.)*

---

## Notas de risco
- **Retro-compat:** `hydrate` usa `snapshot.edges ?? []`; o `load()` (Fase 3) já valida só `nodes` como array, então um `canvas.json` v1 carrega sem edges. Um save subsequente reescreve como v2.
- **Edges órfãs:** `removeNode` remove as edges ligadas ao nó — sem edges apontando para nós inexistentes.
- **`textarea` com `nodrag nowheel`:** garante que digitar/rolar na nota não move nem dá zoom no canvas (mesmo padrão do terminal).
- **Handles e drag:** os `Handle`s do React Flow são áreas próprias de conexão; não conflitam com o header de drag.
