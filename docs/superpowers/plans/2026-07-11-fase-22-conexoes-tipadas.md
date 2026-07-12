# Orkestra — Fase 22 (Conexões Tipadas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** As conexões (edges) do canvas passam a ter um **tipo derivado dos nós que ligam** — terminal↔terminal (`agent`), nota↔nota (`chain`), terminal↔nota (`note`), qualquer↔portal (`portal`), e o resto (`link`) — cada tipo com **cor/traçado próprios** e um **badge clicável no meio da conexão** que mostra o tipo e abre um popover com ação contextual (desconectar). É a "conexão tipada com badge" do mapa de referência, com implementação própria.

**Architecture:** Uma função pura `deriveEdgeKind(sourceType, targetType): EdgeKind` (módulo `src/renderer/src/edges/edgeKind.ts`, testável, sem React) classifica a edge. O `onConnect` do store enriquece cada nova edge com `type:'typed'`, `data:{ kind }` e `className:'ork-edge--<kind>'` (consultando o `type` dos nós pelos ids). Como o kind é **derivável dos endpoints**, ele NÃO é persistido: o `hydrate` **recomputa** o kind de cada edge a partir dos nós recém-hidratados (sem mudar o formato `PersistedEdge` nem a versão do snapshot). Uma edge customizada `TypedEdge.tsx` (React Flow `edgeTypes`) desenha a conexão via `getBezierPath`/`BaseEdge` e um badge via `EdgeLabelRenderer`; o CSS colore o traçado por tipo.

**Tech Stack:** `@xyflow/react` v12 (`BaseEdge`, `EdgeLabelRenderer`, `getBezierPath`, `edgeTypes`). Vitest (`*.test.ts`, node env, `import from 'vitest'`).

## Global Constraints

- **Não quebrar a mensageria agente↔agente:** ela é independente de edges (resolvida por nome→nodeId→ptyId em `main/index.ts`; o `CanvasMirror` nem carrega edges). Preservar o contrato de `store.onConnect(connection)` aceitar `{ source, target, sourceHandle, targetHandle }` — `useOrchestrationSync.ts` (do `orq connect`) depende disso.
- **Kind derivado, não persistido:** derivar no `onConnect` e **recomputar no `hydrate`**. NÃO estender `PersistedEdge` nem incrementar `snapshot.version`. O `serialize` continua emitindo `{ id, source, target }`.
- Renderer/preload não importam `fs`/`http`/`node-pty`/`child_process`. Segurança dos nós (contextIsolation/sandbox) intacta.
- Zero regressão a terminais/notas/portais/árvore/grupos/atenção/palette/`orq`. Nomenclatura PT-BR, sem marcas de terceiros.

---

### Task 1: `deriveEdgeKind` (puro) + integração no store (onConnect/hydrate/removeEdge) — TDD

**Files:**
- Create: `src/renderer/src/edges/edgeKind.ts`, `src/renderer/src/edges/edgeKind.test.ts`
- Modify: `src/renderer/src/store/canvasStore.ts` (+ `.test.ts`)

**Interfaces:**
- Produces:
  ```ts
  export type EdgeKind = 'agent' | 'chain' | 'note' | 'portal' | 'link'
  export function deriveEdgeKind(a?: string, b?: string): EdgeKind
  export const EDGE_KIND_META: Record<EdgeKind, { label: string; title: string }>
  ```
  - Store: `onConnect` passa a anexar `type:'typed'`, `data:{kind}`, `className:'ork-edge--<kind>'`; `hydrate` recomputa o kind; novo `removeEdge(id: string): void`.

- [ ] **Step 1: Testes do módulo puro (falham primeiro)**

`src/renderer/src/edges/edgeKind.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { deriveEdgeKind, EDGE_KIND_META } from './edgeKind'

describe('deriveEdgeKind', () => {
  it('terminal↔terminal = agent', () => {
    expect(deriveEdgeKind('terminal', 'terminal')).toBe('agent')
  })
  it('note↔note = chain', () => {
    expect(deriveEdgeKind('note', 'note')).toBe('chain')
  })
  it('terminal↔note = note (simétrico)', () => {
    expect(deriveEdgeKind('terminal', 'note')).toBe('note')
    expect(deriveEdgeKind('note', 'terminal')).toBe('note')
  })
  it('qualquer↔portal = portal', () => {
    expect(deriveEdgeKind('terminal', 'portal')).toBe('portal')
    expect(deriveEdgeKind('portal', 'note')).toBe('portal')
  })
  it('não classificado (ex.: filetree↔terminal, indefinido) = link', () => {
    expect(deriveEdgeKind('filetree', 'terminal')).toBe('link')
    expect(deriveEdgeKind(undefined, 'terminal')).toBe('link')
    expect(deriveEdgeKind(undefined, undefined)).toBe('link')
  })
})

describe('EDGE_KIND_META', () => {
  it('tem rótulo e título para cada tipo', () => {
    for (const k of ['agent', 'chain', 'note', 'portal', 'link'] as const) {
      expect(EDGE_KIND_META[k].label.length).toBeGreaterThan(0)
      expect(EDGE_KIND_META[k].title.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Rodar → falha** (`npm test -- edgeKind`).

- [ ] **Step 3: Implementar `edgeKind.ts`**
```ts
export type EdgeKind = 'agent' | 'chain' | 'note' | 'portal' | 'link'

export function deriveEdgeKind(a?: string, b?: string): EdgeKind {
  if (a === 'terminal' && b === 'terminal') return 'agent'
  if (a === 'note' && b === 'note') return 'chain'
  const pair = new Set([a, b])
  if (pair.has('terminal') && pair.has('note')) return 'note'
  if (pair.has('portal')) return 'portal'
  return 'link'
}

export const EDGE_KIND_META: Record<EdgeKind, { label: string; title: string }> = {
  agent: { label: 'Agentes', title: 'Conexão entre terminais-agente' },
  chain: { label: 'Cadeia', title: 'Cadeia de notas' },
  note: { label: 'Contexto', title: 'Nota ligada a um terminal' },
  portal: { label: 'Portal', title: 'Conexão com um portal' },
  link: { label: 'Link', title: 'Conexão' }
}
```

- [ ] **Step 4: Rodar → verde.**

- [ ] **Step 5: Store — testes de integração (falham primeiro)**

Em `src/renderer/src/store/canvasStore.test.ts`, adicionar (mantendo os testes atuais):
```ts
it('onConnect deriva o kind da edge pelos tipos dos nós', () => {
  // dois terminais → agent
  useCanvasStore.getState().addTerminalNode()
  useCanvasStore.getState().addTerminalNode()
  const [a, b] = useCanvasStore.getState().nodes
  useCanvasStore.getState().onConnect({ source: a.id, target: b.id, sourceHandle: null, targetHandle: null })
  const e = useCanvasStore.getState().edges[0]
  expect(e.data).toMatchObject({ kind: 'agent' })
  expect(e.type).toBe('typed')
  expect(e.className).toContain('ork-edge--agent')
})

it('removeEdge remove a edge por id', () => {
  useCanvasStore.getState().addTerminalNode()
  useCanvasStore.getState().addTerminalNode()
  const [a, b] = useCanvasStore.getState().nodes
  useCanvasStore.getState().onConnect({ source: a.id, target: b.id, sourceHandle: null, targetHandle: null })
  const id = useCanvasStore.getState().edges[0].id
  useCanvasStore.getState().removeEdge(id)
  expect(useCanvasStore.getState().edges).toHaveLength(0)
})

it('hydrate recomputa o kind das edges a partir dos nós', () => {
  const snap = {
    version: 2 as const,
    nodes: [
      { id: 'note-1', type: 'note', position: { x: 0, y: 0 }, width: 240, height: 180, data: { content: 'a' } },
      { id: 'note-2', type: 'note', position: { x: 300, y: 0 }, width: 240, height: 180, data: { content: 'b' } }
    ],
    edges: [{ id: 'e1', source: 'note-1', target: 'note-2' }]
  }
  useCanvasStore.getState().hydrate(snap)
  const e = useCanvasStore.getState().edges[0]
  expect(e.data).toMatchObject({ kind: 'chain' })
  expect(e.type).toBe('typed')
  expect(e.className).toContain('ork-edge--chain')
})
```
(Confirmar o nome real do criador de terminal — provavelmente `addTerminalNode()`; se a assinatura exigir args, usar o padrão já presente nos testes existentes do arquivo. Confirmar também a assinatura de `hydrate` (recebe o snapshot). Ajustar o objeto `snap` ao tipo `CanvasSnapshot` real — os testes de hydrate já existentes no arquivo são o gabarito.)

- [ ] **Step 6: Implementar no store**

Importar no topo: `import { deriveEdgeKind, type EdgeKind } from '../edges/edgeKind'`.

`onConnect` — enriquecer a edge (preservando o contrato de aceitar um `Connection`):
```ts
onConnect: (connection): void =>
  set((state) => {
    const sourceType = state.nodes.find((n) => n.id === connection.source)?.type
    const targetType = state.nodes.find((n) => n.id === connection.target)?.type
    const kind = deriveEdgeKind(sourceType, targetType)
    const edge = { ...connection, type: 'typed', data: { kind }, className: `ork-edge--${kind}` }
    return { edges: addEdge(edge, state.edges) }
  }),
```

Novo `removeEdge` (declarar no tipo do store + implementar):
```ts
removeEdge: (id): void => set((state) => ({ edges: state.edges.filter((e) => e.id !== id) })),
```

`hydrate` — ao reconstruir as edges, recomputar o kind usando os nós já hidratados. Localizar a linha que hoje faz `edges: (snapshot.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target }))` e substituir por (usando a MESMA lista de nós que o hydrate produz — referenciar a variável de nós hidratados que já existe na função; se o hydrate montar `nodes` inline, extraí-los para uma const primeiro):
```ts
const hydratedNodes = (snapshot.nodes ?? []).map(/* ...mapeamento de nós já existente, inalterado... */)
const hydratedEdges = (snapshot.edges ?? []).map((e) => {
  const st = hydratedNodes.find((n) => n.id === e.source)?.type
  const tt = hydratedNodes.find((n) => n.id === e.target)?.type
  const kind = deriveEdgeKind(st, tt)
  return { id: e.id, source: e.source, target: e.target, type: 'typed', data: { kind }, className: `ork-edge--${kind}` }
})
return { nodes: hydratedNodes, edges: hydratedEdges, /* ...demais campos que o hydrate já retorna... */ }
```
NÃO alterar `serialize` (continua `{ id, source, target }`) nem `snapshot.version`. Manter todo o resto do `hydrate` (version tolerance v1→`[]`, hidratação de nós) idêntico.

- [ ] **Step 7: Testes + typecheck + build** — `npm test` (todos verdes, incl. os testes de edge já existentes — `onConnect adiciona uma edge`, `serialize emite version 2`, `hydrate restaura`; se algum usar igualdade estrita que agora falhe por causa dos campos novos, relaxar para `toMatchObject({ source, target })` — sem remover cobertura), `npm run typecheck`, `npm run build` — limpos.

- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat: kind derivado de conexao (deriveEdgeKind) + onConnect/hydrate/removeEdge (Fase 22)"`

---

### Task 2: Edge customizada `TypedEdge` + badge/popover + estilo por tipo + registro (+ checkpoint)

**Files:**
- Create: `src/renderer/src/components/TypedEdge.tsx`
- Modify: `src/renderer/src/components/Canvas.tsx` (registrar `edgeTypes`), `src/renderer/src/components/Canvas.css` (traçado por tipo) e/ou `nodes.css` (badge)

**Interfaces:**
- Consumes: `EDGE_KIND_META`, `EdgeKind` de `../edges/edgeKind`; store `removeEdge`.
- Produces: `export function TypedEdge(props: EdgeProps): JSX.Element`; `edgeTypes = { typed: TypedEdge }` no Canvas.

- [ ] **Step 1: `TypedEdge.tsx`**
```tsx
import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { EDGE_KIND_META, type EdgeKind } from '../edges/edgeKind'
import './nodes.css'

export function TypedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd
}: EdgeProps): JSX.Element {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition
  })
  const kind = (data?.kind as EdgeKind) ?? 'link'
  const meta = EDGE_KIND_META[kind]
  const [open, setOpen] = useState(false)
  const removeEdge = useCanvasStore((s) => s.removeEdge)
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className={`nodrag nopan ork-edge-badge ork-edge-badge--${kind}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={() => setOpen((o) => !o)}
          title={meta.title}
          role="button"
          aria-label={`Conexão: ${meta.label}`}
        >
          <span>{meta.label}</span>
          {open && (
            <div className="ork-edge-pop">
              <button
                className="ork-edge-pop-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  removeEdge(id)
                }}
              >
                Desconectar
              </button>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
```

- [ ] **Step 2: Registrar no `Canvas.tsx`** — junto do `nodeTypes` existente:
```tsx
import { TypedEdge } from './TypedEdge'
// ...
const edgeTypes = { typed: TypedEdge }
```
E no `<ReactFlow>`: adicionar `edgeTypes={edgeTypes}`. (Definir `edgeTypes` como constante estável fora do componente OU via `useMemo`, igual ao padrão já usado para `nodeTypes` no arquivo — seguir o que estiver lá para evitar recriação a cada render.)

- [ ] **Step 3: CSS — traçado por tipo em `Canvas.css`** (React Flow aplica `edge.className` ao `<g class="react-flow__edge …">`):
```css
.react-flow__edge.ork-edge--agent .react-flow__edge-path { stroke: var(--accent); }
.react-flow__edge.ork-edge--chain .react-flow__edge-path { stroke: var(--ok); }
.react-flow__edge.ork-edge--note .react-flow__edge-path { stroke: var(--warn); }
.react-flow__edge.ork-edge--portal .react-flow__edge-path { stroke: var(--border-strong); stroke-dasharray: 6 4; }
.react-flow__edge.ork-edge--link .react-flow__edge-path { stroke: var(--border-strong); }
```

- [ ] **Step 4: CSS — badge + popover em `nodes.css`** (o `EdgeLabelRenderer` desativa pointer-events no container; o badge precisa reativar):
```css
.ork-edge-badge {
  position: absolute;
  pointer-events: all;
  font-size: 10px;
  line-height: 1.4;
  padding: 1px 7px;
  border-radius: var(--radius-sm);
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.ork-edge-badge--agent { border-color: var(--accent); color: var(--accent); }
.ork-edge-badge--chain { border-color: var(--ok); color: var(--ok); }
.ork-edge-badge--note { border-color: var(--warn); color: var(--warn); }
.ork-edge-badge--portal,
.ork-edge-badge--link { border-color: var(--border-strong); color: var(--text-2); }
.ork-edge-pop {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 4px;
  padding: 4px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-2);
  z-index: 10;
}
.ork-edge-pop-btn {
  padding: 3px 10px;
  font-size: 11px;
  color: var(--text-1);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
}
.ork-edge-pop-btn:hover { background: var(--bg-2); color: var(--err); }
```

- [ ] **Step 5: Testes + typecheck + build** — `npm test` (verde), `npm run typecheck`, `npm run build` (o `.tsx` compila), `npm run lint` — limpos.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: TypedEdge com badge/popover + estilo de conexao por tipo (Fase 22)"`

- [ ] **Step 7: CHECKPOINT VISUAL (humano)** — `npm run dev`. Ligar dois terminais → conexão violeta com badge "Agentes"; ligar duas notas → verde "Cadeia"; terminal→nota → amarelo "Contexto"; terminal→portal → tracejado "Portal". Clicar num badge abre o popover; "Desconectar" remove a conexão. Fechar/reabrir o app → as conexões voltam com o tipo/estilo corretos (kind recomputado no load). Confirmar que `orq connect A B` continua desenhando a conexão (agora tipada) e que enviar mensagem entre agentes segue funcionando **sem** depender de conexão.

---

## Notas de risco
- **Mensageria desacoplada:** o badge da conexão `agent` NÃO envia mensagens (isso é por nome, via `orq ask`); o popular "enviar mensagem pela conexão" fica para a onda do command palette avançado (Fase 23). Aqui o popover só desconecta — mantém o MVP focado e não duplica a mensageria.
- **Kind derivado (não persistido):** trocar o tipo de um nó após conectar não re-deriva o kind da edge existente até um reload (o hydrate recomputa). Aceitável — tipos de nó não mudam em runtime hoje.
- **`getBezierPath`:** mantém o visual bezier atual (só adiciona o badge e a cor). Estilo "circuito" (ortogonal) é refinamento futuro — o mapa cita corda/circuito, mas o MVP entrega tipo+cor+badge.
- **Handles:** o `EdgeLabelRenderer` renderiza o badge no ponto médio; com muitas conexões sobrepostas os badges podem colidir — aceitável no MVP.
- **Contrato preservado:** `onConnect` continua aceitando um `Connection` puro (o `orq connect` e o arrasto manual passam por ele e ganham o kind automaticamente); `serialize` inalterado; nenhuma mudança no caminho de mensageria do main.
