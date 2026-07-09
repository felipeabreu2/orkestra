# Orkestra — Fase 2 (Canvas multi-nó) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o app de "um terminal fixo em tela cheia" num **canvas espacial** (React Flow) onde vários nós de terminal coexistem: criar, mover, redimensionar, zoom/pan e focar — cada nó rodando seu próprio shell.

**Architecture:** Um store **Zustand** (`canvasStore`) guarda os nós no padrão controlado do React Flow (`nodes` + `onNodesChange` via `applyNodeChanges`). O `App` monta um **React Flow** dentro de `ReactFlowProvider`; o tipo de nó `terminal` é um `TerminalFlowNode` que envolve o `TerminalNode` (xterm) existente com header (drag handle), `NodeResizer`, e classes `nodrag`/`nowheel`. O `TerminalNode` passa a refazer o `fit` via `ResizeObserver` (responde ao redimensionamento do nó, não só da janela). Sem persistência (é a Fase 3) — o canvas é volátil.

**Tech Stack:** @xyflow/react (React Flow v12), zustand v5, xterm.js (já presente), jsdom (só para testar o store).

## Global Constraints

- Plataforma: Electron/Node/TS, Intel/macOS 12. Toolchain 100% Node/TS.
- Renderer: **NÃO importa node-pty**; fala com o main só via `window.orkestra.pty` (spawn/write/resize/kill/onData). Segurança do main inalterada (`contextIsolation`/`sandbox`/`nodeIntegration:false`).
- **Sem persistência nesta fase** — nós vivem só em memória (persistência = Fase 3).
- Nomenclatura: **não** usar marcas do Maestri (Maestri/Ombro/Batuta/Floors).
- Cada nó de terminal roda **um** pty; ao remover o nó, o pty morre (via unmount cleanup já existente no `TerminalNode`).
- Versões-piso: @xyflow/react ^12, zustand ^5, jsdom ^25.

---

### Task 1: Deps + `canvasStore` (Zustand) com TDD

**Files:**
- Create: `src/renderer/src/store/canvasStore.ts`, `src/renderer/src/store/canvasStore.test.ts`

**Interfaces:**
- Consumes: `@xyflow/react` (`applyNodeChanges`, types `Node`/`NodeChange`).
- Produces:
  - `useCanvasStore` (zustand hook/store) com estado `{ nodes: Node[] }` e ações:
    - `addTerminalNode(position?: { x: number; y: number }): void` — adiciona um nó `{ type: 'terminal', id único, position, data: {}, style: { width: 480, height: 320 } }` (o `style.width/height` é o que o `NodeResizer` controla)
    - `removeNode(id: string): void`
    - `onNodesChange(changes: NodeChange[]): void` — aplica via `applyNodeChanges`

- [ ] **Step 1: Instalar dependências**

Run:
```bash
cd /Users/felipeabreu/Documents/Apps/orkestra
npm install @xyflow/react@^12 zustand@^5
npm install --save-dev jsdom@^25
```

- [ ] **Step 2: Escrever os testes que falham**

`src/renderer/src/store/canvasStore.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore } from './canvasStore'

beforeEach(() => {
  useCanvasStore.setState({ nodes: [] })
})

describe('canvasStore', () => {
  it('addTerminalNode adiciona um nó de terminal na posição dada', () => {
    useCanvasStore.getState().addTerminalNode({ x: 10, y: 20 })
    const { nodes } = useCanvasStore.getState()
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe('terminal')
    expect(nodes[0].position).toEqual({ x: 10, y: 20 })
  })

  it('gera ids únicos entre nós', () => {
    const s = useCanvasStore.getState()
    s.addTerminalNode()
    s.addTerminalNode()
    const { nodes } = useCanvasStore.getState()
    expect(nodes[0].id).not.toBe(nodes[1].id)
  })

  it('removeNode remove o nó pelo id', () => {
    useCanvasStore.getState().addTerminalNode()
    const id = useCanvasStore.getState().nodes[0].id
    useCanvasStore.getState().removeNode(id)
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
  })

  it('onNodesChange aplica mudança de posição', () => {
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    const id = useCanvasStore.getState().nodes[0].id
    useCanvasStore.getState().onNodesChange([
      { id, type: 'position', position: { x: 50, y: 60 } }
    ])
    expect(useCanvasStore.getState().nodes[0].position).toEqual({ x: 50, y: 60 })
  })
})
```
Nota: `// @vitest-environment jsdom` na 1ª linha faz este arquivo rodar em jsdom (o `vitest.config.ts` global é `node`), garantindo que o import de `@xyflow/react` resolva sem faltar `window`/`document`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/renderer/src/store/canvasStore.test.ts`
Expected: FAIL — `Cannot find module './canvasStore'`.

- [ ] **Step 4: Implementar `canvasStore.ts`**

```ts
import { create } from 'zustand'
import { applyNodeChanges, type Node, type NodeChange } from '@xyflow/react'

let idCounter = 1

interface CanvasState {
  nodes: Node[]
  addTerminalNode: (position?: { x: number; y: number }) => void
  removeNode: (id: string) => void
  onNodesChange: (changes: NodeChange[]) => void
}

export const useCanvasStore = create<CanvasState>((set) => ({
  nodes: [],
  addTerminalNode: (position = { x: 80, y: 80 }): void =>
    set((state) => ({
      nodes: [
        ...state.nodes,
        {
          id: `terminal-${idCounter++}`,
          type: 'terminal',
          position,
          data: {},
          style: { width: 480, height: 320 }
        }
      ]
    })),
  removeNode: (id): void =>
    set((state) => ({ nodes: state.nodes.filter((n) => n.id !== id) })),
  onNodesChange: (changes): void =>
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) }))
}))
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/renderer/src/store/canvasStore.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Rodar a suíte completa + typecheck**

Run: `npm test && npm run typecheck`
Expected: todos verdes (12 anteriores + 4 novos = 16), typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: canvasStore (zustand) para nós do React Flow (Fase 2)"
```

---

### Task 2: `TerminalNode` responsivo ao container + `TerminalFlowNode`

**Files:**
- Modify: `src/renderer/src/components/TerminalNode.tsx`
- Create: `src/renderer/src/components/TerminalFlowNode.tsx`

**Interfaces:**
- Consumes: `window.orkestra.pty` (inalterado), `useCanvasStore` (`removeNode`), `@xyflow/react` (`NodeResizer`, `NodeProps`).
- Produces: `TerminalFlowNode` — um componente de nó do React Flow (registrado como tipo `terminal`) que envolve o `TerminalNode` com header arrastável, botão fechar e redimensionamento.

- [ ] **Step 1: Tornar o `TerminalNode` responsivo ao container (ResizeObserver)**

Substituir, em `src/renderer/src/components/TerminalNode.tsx`, o listener de `window.resize` por um `ResizeObserver` no próprio container (assim o `fit` acompanha o redimensionamento do NÓ, não só da janela). Trecho a alterar — de:
```ts
    const onResize = (): void => fit.fit()
    window.addEventListener('resize', onResize)

    return () => {
      disposed = true
      window.removeEventListener('resize', onResize)
      disposeData()
      if (ptyId) window.orkestra.pty.kill(ptyId)
      term.dispose()
    }
```
para:
```ts
    const ro = new ResizeObserver(() => fit.fit())
    ro.observe(el)

    return () => {
      disposed = true
      ro.disconnect()
      disposeData()
      if (ptyId) window.orkestra.pty.kill(ptyId)
      term.dispose()
    }
```
(O resto do `TerminalNode.tsx` — criação do xterm, spawn, `.catch`, `term.onData/onResize` — permanece idêntico.)

- [ ] **Step 2: Verificar que nada quebrou (typecheck + build + testes)**

Run: `npm run typecheck && npm run build && npm test`
Expected: typecheck limpo, build OK, 16 testes passam.

- [ ] **Step 3: Criar `TerminalFlowNode.tsx`**

```tsx
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { TerminalNode } from './TerminalNode'
import { useCanvasStore } from '../store/canvasStore'

export function TerminalFlowNode({ id, selected }: NodeProps): JSX.Element {
  const removeNode = useCanvasStore((s) => s.removeNode)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        border: '1px solid #333',
        borderRadius: 6,
        overflow: 'hidden'
      }}
    >
      <NodeResizer minWidth={240} minHeight={140} isVisible={selected ?? false} />
      <div
        style={{
          height: 26,
          background: '#2d2d2d',
          color: '#cccccc',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          cursor: 'grab',
          userSelect: 'none'
        }}
      >
        <span>Terminal</span>
        <button
          className="nodrag"
          onClick={() => removeNode(id)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#cccccc',
            fontSize: 15,
            lineHeight: 1,
            cursor: 'pointer',
            padding: '0 4px'
          }}
          aria-label="Fechar terminal"
        >
          ×
        </button>
      </div>
      <div className="nodrag nowheel" style={{ flex: 1, minHeight: 0 }}>
        <TerminalNode />
      </div>
    </div>
  )
}
```
Notas: o header (sem `nodrag`) é a área de arraste; o container do terminal tem `nodrag` (arrastar/clicar interage com o shell, não move o nó) e `nowheel` (rolar no terminal não dá zoom no canvas). `NodeResizer` só aparece quando o nó está selecionado.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: limpos (o componente compila; validação visual vem na Task 3).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: TerminalFlowNode (nó de terminal no React Flow) + TerminalNode responsivo (Fase 2)"
```

---

### Task 3: `Canvas` (React Flow) + integração no `App` + toolbar

**Files:**
- Create: `src/renderer/src/components/Canvas.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `useCanvasStore` (`nodes`, `onNodesChange`, `addTerminalNode`), `TerminalFlowNode`, `@xyflow/react` (`ReactFlow`, `ReactFlowProvider`, `Background`, `Controls`).
- Produces: um canvas interativo com múltiplos terminais; ponto de entrada final da Fase 2.

- [ ] **Step 1: Criar `Canvas.tsx`**

```tsx
import { ReactFlow, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCanvasStore } from '../store/canvasStore'
import { TerminalFlowNode } from './TerminalFlowNode'

const nodeTypes = { terminal: TerminalFlowNode }

export function Canvas(): JSX.Element {
  const nodes = useCanvasStore((s) => s.nodes)
  const onNodesChange = useCanvasStore((s) => s.onNodesChange)
  const addTerminalNode = useCanvasStore((s) => s.addTerminalNode)

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <button
        onClick={() => addTerminalNode()}
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          padding: '6px 12px',
          background: '#1633f9',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: 13,
          cursor: 'pointer'
        }}
      >
        + Terminal
      </button>
      <ReactFlow
        nodes={nodes}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 2: Refatorar `App.tsx`**

```tsx
import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from './components/Canvas'

export function App(): JSX.Element {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
```

- [ ] **Step 3: Typecheck + build + testes**

Run: `npm run typecheck && npm run build && npm test`
Expected: typecheck limpo, build OK (bundle inclui o CSS do React Flow), 16 testes passam.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Canvas React Flow com toolbar + integração no App (Fase 2)"
```

- [ ] **Step 5: CHECKPOINT VISUAL (humano)**

`npm run dev`. Validar: clicar **+ Terminal** cria um nó com shell funcionando; criar 2-3; **arrastar pelo header** move; **arrastar/digitar no terminal** interage sem mover; selecionar um nó mostra alças e **redimensionar** re-ajusta o terminal; **scroll no terminal** rola o shell, **scroll no vazio** dá zoom; os **Controls** (zoom/fit) funcionam; **×** fecha o nó e encerra o shell. *(Este passo é validado pelo humano; o implementador para no build/typecheck e sinaliza pendência.)*

---

## Notas de risco
- **Import de `@xyflow/react` em teste `node`:** o teste do store usa `// @vitest-environment jsdom` para fornecer `window`/`document`. Se ainda faltar algo, o `applyNodeChanges` também é exportado por `@xyflow/system` (core sem React) como fallback de import.
- **Ciclo de vida do pty no canvas:** NÃO habilitar `onlyRenderVisibleElements` no `ReactFlow` — nós fora da viewport devem permanecer montados para não matar/recriar o pty (perderia o estado do shell). O default (renderiza todos) é o correto.
- **Fit inicial:** o `ResizeObserver` dispara quando o container ganha tamanho dentro do nó, cobrindo o `fit` inicial e os redimensionamentos.
