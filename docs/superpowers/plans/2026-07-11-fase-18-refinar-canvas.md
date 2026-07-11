# Orkestra — Fase 18 (Refinamento do Canvas & Layout) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Elevar o canvas com recursos padrão de editores espaciais: **minimap**, **snap à grade**, **deletar com teclado**, **atalhos de foco/zoom**, **alinhar/distribuir/organizar** nós selecionados, **grupos de nós** e uma **sidebar de projetos com ícones e colapsável**. Implementação própria (não copiar design/atalhos de terceiros — usar convenções sensatas nossas).

**Architecture:** A maioria são recursos nativos do React Flow v12 (config no `<ReactFlow>` + `<MiniMap>`); alinhar/distribuir são **funções puras testáveis** sobre os nós selecionados, disparadas por uma pequena barra contextual; grupos usam nós do tipo `group` do React Flow (parent/extent). A sidebar ganha um ícone por projeto (emoji) e um modo colapsado. Zero mudança de lógica de terminais/agentes/persistência.

**Tech Stack:** `@xyflow/react` (já presente). Vitest para as funções puras. CSS tokens existentes.

## Global Constraints

- Renderer não importa `fs`/`http`/`node-pty`/`child_process`. Zero regressão a terminais/notas/portais/projetos/palette.
- Atalhos/design são escolhas próprias — não replicar teclas/estética de outro produto.
- `prefers-reduced-motion` respeitado. Nomenclatura sem marcas de terceiros.

---

### Task 1: Minimap + snap à grade + deletar com teclado + atalhos de foco/zoom

**Files:**
- Modify: `src/renderer/src/components/Canvas.tsx`, `Canvas.css`

**Interfaces:** só config/UI do React Flow + um keydown handler. Sem lógica nova exportada.

- [ ] **Step 1: MiniMap + snap + delete key**

Em `Canvas.tsx`: importar `MiniMap` de `@xyflow/react`; adicionar `<MiniMap pannable zoomable />` dentro do `<ReactFlow>` (ele ancora bottom-right por padrão — posicionar via `className`/prop p/ não colidir com `<Controls>`; ex.: Controls em bottom-left, MiniMap em bottom-right). No `<ReactFlow>`, adicionar `snapToGrid` + `snapGrid={[20, 20]}` (nós já usam múltiplos de 20) e `deleteKeyCode={['Backspace', 'Delete']}` (deletar nós/edges selecionados — o React Flow chama `onNodesChange`/`onEdgesChange` com `remove`, que o store já aplica via `applyNodeChanges`). Estilizar o MiniMap p/ o tema dark (`className="ork-minimap"` + CSS usando `--bg-1`/`--border`; a máscara e os nós via props `maskColor`/`nodeColor`).

- [ ] **Step 2: Atalhos de foco/zoom (keydown)**

No `useEffect` de atalhos já existente em `Canvas.tsx` (o do Cmd/Ctrl+K), adicionar (via `useReactFlow()`): **`Shift+1`** = `fitView({ duration: 300 })` (enquadrar tudo); **`Shift+2`** = enquadrar a seleção (`fitView({ nodes: selectedNodes, duration: 300 })` — obter selecionados de `useCanvasStore.getState().nodes.filter(n => n.selected)`); **`Shift+M`** = alternar o minimap (um `useState` `minimapOn`). Ignorar quando o foco está num input/textarea (checar `e.target` tag). Não sequestrar teclas quando o usuário digita num terminal/nota.

- [ ] **Step 3: Testes + typecheck + build** — `npm test` (mantém verdes) + `npm run typecheck` + `npm run build`. (UI — sem novos testes unitários; o React Flow já é testado pela lib.)

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: minimap + snap a grade + deletar com teclado + atalhos de foco/zoom (Fase 18)"`

---

### Task 2: Alinhar / distribuir / organizar nós selecionados (TDD)

**Files:**
- Create: `src/renderer/src/layout/arrange.ts` (+ `.test.ts`)
- Modify: `src/renderer/src/store/canvasStore.ts` (uma action que aplica novas posições), `src/renderer/src/components/Canvas.tsx` (barra contextual)

**Interfaces:**
- Produces (funções PURAS):
  - `alignNodes(nodes: PosNode[], axis: 'left'|'hcenter'|'right'|'top'|'vcenter'|'bottom'): Record<string, {x:number;y:number}>` — devolve novas posições dos nós alinhados.
  - `distributeNodes(nodes: PosNode[], axis: 'horizontal'|'vertical'): Record<string,{x:number;y:number}>` — espaçamento igual entre os nós.
  - `gridArrange(nodes: PosNode[], opts?): Record<string,{x:number;y:number}>` — organiza em grade.
  - `PosNode = { id: string; position: {x:number;y:number}; width?: number; height?: number }`.
- Store: `setNodePositions(map: Record<string,{x:number;y:number}>): void` — aplica as posições no store.

- [ ] **Step 1: `arrange` tests (falha primeiro)**

`arrange.test.ts` — casos concretos, ex.:
```ts
import { describe, it, expect } from 'vitest'
import { alignNodes, distributeNodes, gridArrange } from './arrange'
const N = (id: string, x: number, y: number, w = 100, h = 100) => ({ id, position: { x, y }, width: w, height: h })

describe('alignNodes', () => {
  it("'left' alinha todos ao menor x", () => {
    const r = alignNodes([N('a', 10, 0), N('b', 50, 0), N('c', 30, 0)], 'left')
    expect(r.a.x).toBe(10); expect(r.b.x).toBe(10); expect(r.c.x).toBe(10)
  })
  it("'hcenter' alinha os centros horizontais", () => {
    const r = alignNodes([N('a', 0, 0, 100), N('b', 0, 0, 50)], 'hcenter')
    // centros iguais: a.center = 50, b deve mover p/ center 50 => x = 25
    expect(r.a.x + 50).toBe(r.b.x + 25)
  })
})
describe('distributeNodes', () => {
  it('espaça igualmente na horizontal (extremos fixos)', () => {
    const r = distributeNodes([N('a', 0, 0, 10), N('b', 5, 0, 10), N('c', 100, 0, 10)], 'horizontal')
    expect(r.a.x).toBe(0); expect(r.c.x).toBe(100) // extremos não movem
    expect(r.b.x).toBeGreaterThan(0); expect(r.b.x).toBeLessThan(100)
  })
})
describe('gridArrange', () => {
  it('coloca N nós numa grade sem sobrepor', () => {
    const r = gridArrange([N('a', 0, 0), N('b', 0, 0), N('c', 0, 0), N('d', 0, 0)])
    const pts = Object.values(r)
    expect(new Set(pts.map((p) => `${p.x},${p.y}`)).size).toBe(4) // 4 posições distintas
  })
})
```

- [ ] **Step 2: Implementar `arrange.ts`** — funções puras (min/max de x/y, centros via width/height, espaçamento uniforme, grade por `ceil(sqrt(n))` colunas com passo = maior largura/altura + gap). Sem deps.

- [ ] **Step 3: Store `setNodePositions` (TDD)** — em `canvasStore.test.ts`, um teste que `setNodePositions({a:{x,y}})` atualiza a posição do nó `a` sem tocar os demais. Implementar mapeando `nodes` e aplicando o novo `position` onde o id casa.

- [ ] **Step 4: Barra contextual em `Canvas.tsx`** — quando **≥2 nós** estão selecionados (`nodes.filter(n=>n.selected).length >= 2`), mostrar uma pequena barra flutuante (topo-centro) com botões: alinhar (6 ícones/label), distribuir (2), organizar em grade (1). Cada botão computa `alignNodes/…` sobre os nós selecionados e chama `setNodePositions`. Design mínimo com os tokens.

- [ ] **Step 5: Testes + typecheck + build** — verdes.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: alinhar/distribuir/organizar nos selecionados (Fase 18)"`

---

### Task 3: Grupos de nós (agrupar / desagrupar)

**Files:**
- Modify: `src/renderer/src/store/canvasStore.ts` (+ `.test.ts`), `src/renderer/src/components/Canvas.tsx`, e um `GroupNode.tsx` simples (opcional)

**Interfaces:**
- Produces: store `groupSelected(): void` (cria um nó `type:'group'` que engloba a bbox dos selecionados e faz cada um `parentId` do grupo, `extent:'parent'`) e `ungroupSelected(): void` (remove o grupo e reparenta os filhos p/ o canvas, convertendo posições relativas→absolutas). `nodeTypes.group` registrado.

- [ ] **Step 1: Store group/ungroup (TDD)** — testes: `groupSelected` com 2 nós selecionados cria 1 nó `group` + seta `parentId` nos 2; `ungroupSelected` remove o grupo e limpa `parentId` (posições absolutas preservadas). (bbox = min/max das posições+tamanhos; posição do filho vira relativa ao grupo.)

- [ ] **Step 2: Implementar no store** — `groupSelected`: calcular bbox dos `selected`, criar `{id, type:'group', position: bbox.topLeft, width, height, data:{name:'Grupo'}}`, e para cada filho `parentId: groupId`, `position` = absoluta − bbox.topLeft, `extent:'parent'`. `ungroupSelected`: para cada filho do grupo, `position` = relativa + grupo.position, remover `parentId`/`extent`, remover o nó grupo. Registrar `nodeTypes.group` (um `GroupNode` simples: retângulo com header renomeável via `updateNoteContent`-like — ou reusar um input). React Flow move os filhos junto ao mover o grupo automaticamente.

- [ ] **Step 3: Atalho/menu** — em `Canvas.tsx`, `Cmd/Ctrl+G` = `groupSelected` (se ≥2 selecionados), `Cmd/Ctrl+Shift+G` = `ungroupSelected`. Ignorar em inputs.

- [ ] **Step 4: Testes + typecheck + build** — verdes; persistência (serialize/hydrate) carrega `parentId`/`extent`/`type:'group'` (o `data` já é genérico — confirmar).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: agrupar/desagrupar nos no canvas (Fase 18)"`

---

### Task 4: Sidebar de projetos — ícone por projeto + colapsar

**Files:**
- Modify: `src/shared/project.ts` (`icon?`), `src/main/projects/ProjectManager.ts` (+ `.test.ts`) (`setIcon`), `src/main/projects/registerProjectIpc.ts`, `src/preload/index.ts`, `src/renderer/src/components/ProjectsSidebar.tsx` (+ `.css`)

**Interfaces:**
- Produces: `Project.icon?: string` (um emoji); `ProjectManager.setIcon(id, icon)`; IPC `projects:setIcon`; sidebar mostra o ícone e permite trocá-lo (um seletor simples de emoji ou input), e um botão de **colapsar** (mostra só os ícones).

- [ ] **Step 1: Backend do ícone (TDD)** — `Project.icon?`; `create(name, cwd?, icon?)` ou um `setIcon(id, icon)` separado (mais simples: `setIcon`); teste que `setIcon` grava e `list()` reflete. IPC `projects:setIcon` + preload.

- [ ] **Step 2: UI na sidebar** — cada linha mostra o ícone (default ex.: 📁 ou a inicial do nome num círculo) antes do nome; clicar no ícone abre um pequeno seletor (uma lista curta de emojis + um input livre) → `setIcon`. Um botão no topo colapsa a sidebar para um trilho estreito (só ícones), com o nome em `title`/hover; estado `collapsed` local (persistir em `localStorage` é ok).

- [ ] **Step 3: Testes + typecheck + build** — verdes.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: icone por projeto + sidebar colapsavel (Fase 18)"`

- [ ] **Step 5: CHECKPOINT VISUAL (humano)** — `npm run dev`: minimap no canto; arrastar nós encaixa na grade; selecionar 2+ nós → barra de alinhar/distribuir; Cmd+G agrupa; Delete apaga; Shift+1 enquadra; sidebar com ícones e colapsável.

---

## Notas de risco
- **Atalhos vs. digitação:** todo handler de atalho deve ignorar quando o foco está num `input`/`textarea`/terminal — senão "W"/"G"/Delete apagariam texto. Checar `e.target`.
- **Grupos + persistência:** `parentId`/`extent`/`type:'group'` precisam sobreviver ao serialize/hydrate (o snapshot é genérico; confirmar que o hydrate mantém `parentId`).
- **Snap 20pt** pode mover nós existentes levemente no primeiro drag — aceitável (todos já nascem em múltiplos de 20).
- **MiniMap vs Controls/Wordmark:** garantir que não se sobreponham (Controls bottom-left elevado, MiniMap bottom-right, wordmark na sidebar).
- **Deletar terminal via tecla** mata o PTY (igual ao botão ✕) — consistente. Só quando o nó está selecionado e o foco não está no shell.
