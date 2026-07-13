# Onda 2 — Conexões "corda" (F02) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Novo estilo de conexão `corda` — traço pontilhado grosso/comprido com "barriga" por gravidade, que **balança** quando um nó ligado é arrastado, e handles com cara de "haltere". Vira o estilo padrão (a referência, imagem 2/7, usa cordas).

**Architecture:** A geometria da corda e a física do balanço são **funções puras testáveis** (`edges/ropePath.ts`, `edges/ropeSwing.ts`); o `TypedEdge` só as consome. `edgeStyle` ganha o terceiro valor `'corda'` (ciclo curva→circuito→corda) e vira o default. O traço pontilhado grosso é uma classe CSS aplicada ao path; o balanço é um hook (`useRopeSwing`) que injeta energia quando as coordenadas mudam e decai via `requestAnimationFrame`. Handles "haltere" são CSS.

**Tech Stack:** React 18.3.1 + TypeScript, `@xyflow/react` 12 (`BaseEdge`, `getBezierPath`), zustand 5, Vitest (env `node`).

## Global Constraints

- **Idioma:** UI/comentários/commits em **português** (acentuação correta).
- **Sem novas dependências** nesta onda (a física do balanço é caseira, sem lib).
- **Estratégia de teste (igual à Onda 1):** lógica pura (`edges/*.ts`) → TDD (`*.test.ts`, Vitest env `node`); componentes/CSS (`TypedEdge.tsx`, `Canvas.css`) → `typecheck`/`lint`/`build` + **checkpoint visual** do usuário (`npm run dev`, comparar com `docs/images/2.png` e `7.png`). Não adicionar `@testing-library`.
- **zustand v5:** seletores desta onda retornam primitivo (`edgeStyle`) — sem `useShallow` necessário, mas manter a regra ([[reference_orkestra_zustand_v5]]).
- **Ícones:** se algum ícone entrar (ex.: no comando do palette), usar o wrapper `Icon` ([[reference_orkestra_icons]]).
- **Performance:** o balanço via `requestAnimationFrame` roda **só nas edges cujo nó moveu** (as coords só mudam para essas) e **para** quando a energia decai — nunca um rAF perpétuo.

---

### Task 1: `edgeStyle` ganha `'corda'` (padrão) + ciclo de 3 + rótulo do palette

**Files:**
- Modify: `src/renderer/src/edges/edgeStyle.ts`
- Modify: `src/renderer/src/edges/edgeStyle.test.ts`
- Modify: `src/renderer/src/palette/paletteCommands.ts` (rótulo do comando, ~linha 73-77)
- Modify: `src/renderer/src/palette/paletteCommands.test.ts` (se houver caso do rótulo)

**Interfaces:**
- Consumes: nada.
- Produces: `EdgeStyle = 'curva' | 'circuito' | 'corda'`; `resolveInitialEdgeStyle(null) === 'corda'`; `nextEdgeStyle` cicla `curva→circuito→corda→curva`.

- [ ] **Step 1: Atualizar os testes de `edgeStyle` (falham primeiro)**

Em `src/renderer/src/edges/edgeStyle.test.ts`, ajustar/!adicionar (o default virou `corda`; o ciclo tem 3 estados):

```ts
import { describe, it, expect } from 'vitest'
import { resolveInitialEdgeStyle, nextEdgeStyle } from './edgeStyle'

describe('edgeStyle', () => {
  it('default (sem preferência salva) é corda', () => {
    expect(resolveInitialEdgeStyle(null)).toBe('corda')
    expect(resolveInitialEdgeStyle('lixo')).toBe('corda')
  })
  it('resolve valores salvos válidos', () => {
    expect(resolveInitialEdgeStyle('curva')).toBe('curva')
    expect(resolveInitialEdgeStyle('circuito')).toBe('circuito')
    expect(resolveInitialEdgeStyle('corda')).toBe('corda')
  })
  it('nextEdgeStyle cicla curva → circuito → corda → curva', () => {
    expect(nextEdgeStyle('curva')).toBe('circuito')
    expect(nextEdgeStyle('circuito')).toBe('corda')
    expect(nextEdgeStyle('corda')).toBe('curva')
  })
})
```

(Se o arquivo já tiver casos com outra expectativa de default/ciclo, **substituí-los** por estes — a fonte da verdade agora é este comportamento.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/renderer/src/edges/edgeStyle.test.ts`
Expected: FAIL (default ainda é `curva`; `nextEdgeStyle` só conhece 2 estados; `'corda'` não é resolvido).

- [ ] **Step 3: Implementar em `edgeStyle.ts`**

```ts
// R5/Onda 2: estilo global das conexões — 'curva' (bezier), 'circuito' (trilhos ortogonais) ou
// 'corda' (bezier com barriga por gravidade + traço pontilhado grosso + balanço; F02). Preferência
// de UI persistida em localStorage; TypedEdge lê s.edgeStyle. 'corda' é o padrão (a referência usa
// cordas), mas uma preferência salva anterior é respeitada.
export type EdgeStyle = 'curva' | 'circuito' | 'corda'

const STORAGE_KEY = 'orkestra-edge-style'

export function resolveInitialEdgeStyle(stored: string | null): EdgeStyle {
  if (stored === 'curva' || stored === 'circuito' || stored === 'corda') return stored
  return 'corda'
}

export function nextEdgeStyle(current: EdgeStyle): EdgeStyle {
  if (current === 'curva') return 'circuito'
  if (current === 'circuito') return 'corda'
  return 'curva'
}

export function loadEdgeStyle(): EdgeStyle {
  let stored: string | null = null
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  } catch {
    stored = null
  }
  return resolveInitialEdgeStyle(stored)
}

export function saveEdgeStyle(style: EdgeStyle): void {
  try {
    localStorage.setItem(STORAGE_KEY, style)
  } catch {
    /* localStorage indisponível — o valor segue em memória no store */
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/renderer/src/edges/edgeStyle.test.ts`
Expected: PASS.

- [ ] **Step 5: Atualizar o rótulo do comando no palette**

Em `src/renderer/src/palette/paletteCommands.ts` (~linha 73-77), o rótulo mostra `atual → próximo`. Trocar a lógica de 2 estados por uma que sirva aos 3, usando `nextEdgeStyle`. Primeiro adicionar o import no topo do arquivo (se ainda não houver):
```ts
import { nextEdgeStyle, type EdgeStyle } from '../edges/edgeStyle'
```
E substituir o objeto do comando de estilo por:
```ts
  {
    id: 'toggle-edge-style',
    label: `Estilo de conexão: ${edgeStyle} → ${nextEdgeStyle(edgeStyle as EdgeStyle)}`,
    run: ctx.toggleEdgeStyle
  },
```
(Manter as demais propriedades do item como já estão — `id`/`run` conforme o arquivo; só o `label` muda de forma. Se `edgeStyle` local é `string`, o `as EdgeStyle` é seguro porque só provém de valores válidos do store.)

- [ ] **Step 6: Ajustar teste do palette (se existir caso de rótulo) + rodar**

Se `paletteCommands.test.ts` afirmar o texto antigo (`curva → circuito`), atualizar para o novo formato. Rodar:
Run: `npx vitest run src/renderer/src/palette/paletteCommands.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + suíte + commit**

Run: `npm run typecheck && npm test`
Expected: verdes.

```bash
git add src/renderer/src/edges/edgeStyle.ts src/renderer/src/edges/edgeStyle.test.ts src/renderer/src/palette/paletteCommands.ts src/renderer/src/palette/paletteCommands.test.ts
git commit -m "feat(edges): estilo 'corda' (padrao) + ciclo de 3 estados (F02)"
```

---

### Task 2: `ropePath` — geometria da corda (função pura)

**Files:**
- Create: `src/renderer/src/edges/ropePath.ts`
- Test: `src/renderer/src/edges/ropePath.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `ropeSag(dx: number, dy: number): number` — profundidade da barriga a partir dos deltas.
  - `ropePath(sx, sy, tx, ty, swingX?): [path: string, labelX: number, labelY: number]` — bezier quadrático com barriga (mesma tripla de retorno de `getBezierPath` do RF).

- [ ] **Step 1: Teste que falha**

Create `src/renderer/src/edges/ropePath.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ropeSag, ropePath } from './ropePath'

describe('ropeSag', () => {
  it('cresce com a distância horizontal e respeita um mínimo', () => {
    expect(ropeSag(0, 0)).toBe(24) // mínimo
    expect(ropeSag(400, 0)).toBe(100) // 400 * 0.25
    expect(ropeSag(-400, 0)).toBe(100) // usa o módulo
  })
})

describe('ropePath', () => {
  it('gera um bezier quadrático com o ponto de controle abaixo do meio', () => {
    const [path, labelX, labelY] = ropePath(0, 0, 400, 0)
    // meio horizontal = 200; barriga = 100 abaixo do meio vertical (0) => cy = 100
    expect(path).toBe('M0,0 Q200,100 400,0')
    expect(labelX).toBe(200)
    // label no meio da quadrática (t=0.5): 0.25*0 + 0.5*100 + 0.25*0 = 50
    expect(labelY).toBe(50)
  })

  it('swingX desloca o ponto de controle na horizontal (balanço)', () => {
    const [path] = ropePath(0, 0, 400, 0, 30)
    expect(path).toBe('M0,0 Q230,100 400,0')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/renderer/src/edges/ropePath.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `ropePath.ts`**

```ts
// Geometria da conexão "corda" (F02): um bezier QUADRÁTICO cujo ponto de controle fica ABAIXO do
// ponto médio (gravidade), dando a "barriga". Função pura — o TypedEdge só desenha o resultado.
// Retorna a mesma tripla [path, labelX, labelY] das helpers do React Flow (getBezierPath), então o
// badge/label da edge continua sendo posicionado do mesmo jeito.

const MIN_SAG = 24
const SAG_FACTOR = 0.25

// Profundidade da barriga: proporcional à distância horizontal (corda mais "aberta" pendura mais),
// com um mínimo para nunca ficar reta. dy entra só para não exagerar em conexões muito verticais.
export function ropeSag(dx: number, dy: number): number {
  const horizontal = Math.abs(dx)
  const base = Math.max(MIN_SAG, horizontal * SAG_FACTOR)
  // Amortece a barriga quando a conexão é bem mais vertical que horizontal (evita laço estranho).
  const verticalDamp = Math.abs(dy) > horizontal ? horizontal / Math.abs(dy || 1) : 1
  return base * verticalDamp
}

export function ropePath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  swingX = 0
): [string, number, number] {
  const sag = ropeSag(tx - sx, ty - sy)
  const cx = (sx + tx) / 2 + swingX
  const cy = (sy + ty) / 2 + sag
  const path = `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`
  // Ponto no meio da quadrática (t=0.5) para posicionar o badge: 0.25*P0 + 0.5*Pc + 0.25*P2.
  const labelX = 0.25 * sx + 0.5 * cx + 0.25 * tx
  const labelY = 0.25 * sy + 0.5 * cy + 0.25 * ty
  return [path, labelX, labelY]
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/renderer/src/edges/ropePath.test.ts`
Expected: PASS (4 asserts). Ajustar o teste se a matemática do `verticalDamp` mudar o valor esperado em casos verticais — os casos do teste usam `dy=0`, onde `verticalDamp=1`, então batem exatamente.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/edges/ropePath.ts src/renderer/src/edges/ropePath.test.ts
git commit -m "feat(edges): ropePath — geometria da corda com barriga (F02)"
```

---

### Task 3: `dampedSwing` — física do balanço (função pura)

**Files:**
- Create: `src/renderer/src/edges/ropeSwing.ts`
- Test: `src/renderer/src/edges/ropeSwing.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `dampedSwing(elapsedMs: number, energy: number): number` — deslocamento lateral (px) de uma oscilação amortecida; `0` em repouso.

- [ ] **Step 1: Teste que falha**

Create `src/renderer/src/edges/ropeSwing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { dampedSwing, SWING_SETTLE_MS } from './ropeSwing'

describe('dampedSwing', () => {
  it('parte de zero (sem deslocamento no instante 0)', () => {
    expect(dampedSwing(0, 40)).toBeCloseTo(0, 5)
  })
  it('sem energia, sempre zero', () => {
    expect(dampedSwing(100, 0)).toBe(0)
    expect(dampedSwing(500, 0)).toBe(0)
  })
  it('decai para ~zero depois do tempo de acomodação', () => {
    const late = Math.abs(dampedSwing(SWING_SETTLE_MS, 60))
    expect(late).toBeLessThan(0.5)
  })
  it('oscila (troca de sinal) entre o início e um quarto de período', () => {
    const a = dampedSwing(60, 60)
    const b = dampedSwing(240, 60)
    expect(Math.sign(a)).not.toBe(Math.sign(b))
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/renderer/src/edges/ropeSwing.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `ropeSwing.ts`**

```ts
// Física do balanço da corda (F02): oscilação senoidal amortecida. Ao arrastar/soltar um nó, o
// TypedEdge injeta "energia" (proporcional ao movimento) e chama isto a cada frame com o tempo
// decorrido; o retorno é o deslocamento lateral (px) do ponto de controle da corda, que oscila e
// decai a zero. Função pura e determinística (sem Date.now aqui — o tempo vem de fora), então é
// testável e não quebra o replay de workflows.

// Frequência angular (rad/ms) e constante de amortecimento — ajustadas para ~2 oscilações visíveis
// que somem em pouco menos de 1s. SWING_SETTLE_MS é o horizonte após o qual tratamos como parado.
const OMEGA = 0.018
const DAMPING = 0.004
export const SWING_SETTLE_MS = 900

export function dampedSwing(elapsedMs: number, energy: number): number {
  if (energy === 0 || elapsedMs >= SWING_SETTLE_MS) return 0
  return energy * Math.exp(-DAMPING * elapsedMs) * Math.sin(OMEGA * elapsedMs)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/renderer/src/edges/ropeSwing.test.ts`
Expected: PASS. (`sin(OMEGA*0)=0` → começa em zero; em `elapsed=60`, `sin(1.08)>0`; em `240`, `sin(4.32)<0` → troca de sinal; em `900ms` retorna 0 pelo guard.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/edges/ropeSwing.ts src/renderer/src/edges/ropeSwing.test.ts
git commit -m "feat(edges): dampedSwing — oscilacao amortecida do balanco (F02)"
```

---

### Task 4: `TypedEdge` desenha a corda + hook de balanço + CSS

**Files:**
- Create: `src/renderer/src/edges/useRopeSwing.ts`
- Modify: `src/renderer/src/components/TypedEdge.tsx`
- Modify: `src/renderer/src/components/Canvas.css` (classe do traço de corda)

**Interfaces:**
- Consumes: `ropePath` (Task 2), `dampedSwing`/`SWING_SETTLE_MS` (Task 3).
- Produces: `useRopeSwing(sx, sy, tx, ty): number` — o `swingX` atual (px) para passar ao `ropePath`.

- [ ] **Step 1: Implementar o hook `useRopeSwing.ts`**

```ts
import { useEffect, useRef, useState } from 'react'
import { dampedSwing, SWING_SETTLE_MS } from './ropeSwing'

// Cola entre a mudança de coordenadas (arraste do nó) e a física pura do balanço. Quando os
// extremos da corda mudam, injeta energia proporcional ao movimento e roda um rAF que aplica
// dampedSwing até acomodar (SWING_SETTLE_MS), então PARA — nunca um rAF perpétuo. Só as edges do
// nó que moveu recebem novas coords, então só elas animam. performance.now() (não Date.now) é a
// base de tempo; é permitido no renderer e não entra em nenhuma lógica persistida.
export function useRopeSwing(sx: number, sy: number, tx: number, ty: number): number {
  const [swing, setSwing] = useState(0)
  const last = useRef({ sx, sy, tx, ty })
  const anim = useRef<{ energy: number; start: number } | null>(null)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const prev = last.current
    const moved = Math.hypot(tx - prev.tx, ty - prev.ty) + Math.hypot(sx - prev.sx, sy - prev.sy)
    last.current = { sx, sy, tx, ty }
    if (moved < 0.5) return

    // Energia proporcional ao movimento, com teto para não exagerar em saltos grandes (fitView).
    const energy = Math.min(48, moved * 0.4)
    anim.current = { energy, start: performance.now() }

    const tick = (): void => {
      const a = anim.current
      if (!a) return
      const elapsed = performance.now() - a.start
      const offset = dampedSwing(elapsed, a.energy)
      setSwing(offset)
      if (elapsed >= SWING_SETTLE_MS) {
        anim.current = null
        setSwing(0)
        raf.current = null
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    if (raf.current === null) raf.current = requestAnimationFrame(tick)
  }, [sx, sy, tx, ty])

  useEffect(() => {
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    }
  }, [])

  return swing
}
```

- [ ] **Step 2: Integrar no `TypedEdge.tsx`**

Trocar o cálculo do path para incluir o ramo `'corda'`. Imports novos no topo:
```ts
import { ropePath } from '../edges/ropePath'
import { useRopeSwing } from '../edges/useRopeSwing'
```
O hook precisa ser chamado SEMPRE (regras dos hooks) — mesmo quando o estilo não é corda o custo é nulo (sem movimento → sem rAF). Substituir o bloco atual:
```ts
  const edgeStyle = useCanvasStore((s) => s.edgeStyle)
  const geom = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }
  const [edgePath, labelX, labelY] =
    edgeStyle === 'circuito' ? getSmoothStepPath({ ...geom, borderRadius: 8 }) : getBezierPath(geom)
```
por:
```ts
  const edgeStyle = useCanvasStore((s) => s.edgeStyle)
  const swingX = useRopeSwing(sourceX, sourceY, targetX, targetY)
  const geom = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }
  const [edgePath, labelX, labelY] =
    edgeStyle === 'corda'
      ? ropePath(sourceX, sourceY, targetX, targetY, swingX)
      : edgeStyle === 'circuito'
        ? getSmoothStepPath({ ...geom, borderRadius: 8 })
        : getBezierPath(geom)
```
E aplicar a classe do traço de corda no `BaseEdge` (linha do `<BaseEdge ... />`):
```tsx
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} className={edgeStyle === 'corda' ? 'ork-rope' : undefined} />
```

- [ ] **Step 3: CSS do traço de corda em `Canvas.css`**

Acrescentar ao final da seção de edges (após a regra `.react-flow__edge.selected .react-flow__edge-path`):
```css
/* Onda 2 (F02): traço da conexão "corda" — pontilhado grosso e comprido, pontas arredondadas.
   A COR continua vindo da regra por-tipo (.ork-edge--<kind> .react-flow__edge-path); aqui só a
   espessura/dash/linecap. Classe aplicada pelo TypedEdge no path quando edgeStyle === 'corda'. */
.react-flow__edge-path.ork-rope {
  stroke-width: 3;
  stroke-dasharray: 2 9;
  stroke-linecap: round;
}
.react-flow__edge.selected .react-flow__edge-path.ork-rope {
  stroke-width: 3.5;
}
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: verdes; build empacota.

- [ ] **Step 5: Checkpoint visual (comparar com `docs/images/2.png`)**

Run: `npm run dev`
Verificar:
- Conexões novas nascem no estilo **corda** (pontilhado grosso com barriga).
- Arrastar um nó ligado faz a corda **balançar** e acomodar suavemente.
- O badge do tipo continua centrado sobre a corda.
- `Cmd/Ctrl+K` → "Estilo de conexão: corda → curva" alterna entre os 3 estilos.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/edges/useRopeSwing.ts src/renderer/src/components/TypedEdge.tsx src/renderer/src/components/Canvas.css
git commit -m "feat(edges): TypedEdge desenha a corda + balanco no arraste (F02)"
```

---

### Task 5: Handles com cara de "haltere"

**Files:**
- Modify: `src/renderer/src/components/Canvas.css` (estilo de `.react-flow__handle`)

**Interfaces:**
- Consumes: nada.
- Produces: nada (puro CSS).

- [ ] **Step 1: Estilizar os handles**

Acrescentar em `Canvas.css` (perto das outras regras `.react-flow__*`):
```css
/* Onda 2 (F02): handles com cara de "haltere/pino" (imagem 7) — um ponto arredondado destacado,
   maior que o padrão, com anel na cor de fundo para "descolar" do nó. A cor de preenchimento já
   vem de --xy-handle-background-color (accent). */
.react-flow__handle {
  width: 11px;
  height: 11px;
  border-radius: 6px;
  border-width: 2px;
  box-shadow: 0 0 0 2px var(--bg-0);
}
.react-flow__handle:hover {
  box-shadow: 0 0 0 3px var(--accent-weak);
}
```

- [ ] **Step 2: Typecheck + build + checkpoint**

Run: `npm run build`
Then: `npm run dev` — os pontos de conexão nas laterais dos nós ficam mais destacados (pino arredondado com anel). Comparar com `docs/images/7.png`; ajustar tamanho/raio se necessário.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Canvas.css
git commit -m "style(edges): handles em formato de haltere/pino (F02)"
```

---

## Self-Review

**Spec coverage (Onda 2 do spec):**
- Estilo `corda` (path com barriga, gravidade) → Tasks 1+2. ✓
- Traço pontilhado grosso/comprido → Task 4 (CSS `.ork-rope`). ✓
- Balanço ao arrastar → Tasks 3+4 (`dampedSwing` + `useRopeSwing`). ✓
- Conector "haltere" no topo → Task 5 (estilo de handle). **Parcial consciente:** estilizo o handle como pino/haltere, mas **mantenho a posição lateral (Left/Right)** dos handles atuais — mover os conectores para o topo (imagem 7) é uma mudança de modelo maior (afeta ligação/roteamento) e fica como refinamento a validar no checkpoint, não nesta onda. ✓
- Look "Claude Code" do terminal (destaque de status) → o spec já o coloca no visual do terminal (Onda 6); aqui só a corda. Não é gap desta onda.

**Placeholder scan:** sem TODO/TBD; cada passo traz o código real.

**Type consistency:** `ropePath` retorna `[string, number, number]` igual às helpers do RF, consumido pelo `TypedEdge` no lugar de `getBezierPath`; `dampedSwing(elapsedMs, energy)` e `SWING_SETTLE_MS` idênticos entre `ropeSwing.ts`, seu teste e `useRopeSwing.ts`; `useRopeSwing(sx,sy,tx,ty): number` casa com o uso no `TypedEdge` (passa o retorno como `swingX` de `ropePath`). `EdgeStyle` com os 3 valores é consistente entre `edgeStyle.ts`, `TypedEdge` e `paletteCommands`.

**Ambiguidade resolvida:** default vira `corda` (a referência usa cordas), mas preferência salva é respeitada (`resolveInitialEdgeStyle`).
