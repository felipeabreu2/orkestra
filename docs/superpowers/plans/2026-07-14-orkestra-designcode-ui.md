# Orkestra — Reformulação visual DesignCode UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a UI violeta/glass (rejeitada) pela linguagem DesignCode UI (accent azul, superfícies preto/branco+alpha, Inter, craft rico e contido), tokenizada, nos temas claro e escuro.

**Architecture:** Reaproveita a arquitetura de tokens existente em `tokens.css` (nomes de token mantidos) e só troca **valores** para os da spec. Componentes são re-estilizados **no lugar** (não há git-revert cego — lógica/arquitetura boa é preservada; só o *styling* visual violeta é substituído). Verificação é **renderizada** (app rodando, claro+escuro) a cada lote, com testes unitários onde há lógica.

**Tech Stack:** Electron + electron-vite, React 18, @xyflow/react (React Flow), xterm.js, CSS puro tokenizado (sem Tailwind), Vitest, TypeScript.

## Global Constraints

- **Fonte de verdade do design:** `docs/superpowers/specs/2026-07-14-orkestra-designcode-ui-design.md`. Referência visual: `docs/design-system/mockups/` (`orkestra-canvas.html`, `orkestra-elementos.html`, `orkestra-overlays.html`).
- **Nomes de token são preservados** (`--bg-*`, `--text-*`, `--accent*`, `--ok/--warn/--err`, `--radius-*`, `--shadow-*`, `--glass-*`, `--fs-*`, `--dur-*`, …). Só mudam valores; tokens novos permitidos.
- **Nada de hex hardcoded em componente.** Sempre `var(--token)`. Nenhum resquício de violeta (`#7c6cff`, `#6b5cf5`, `#c74bff`, `#8b5cf6`, gradientes roxos).
- **Accent = azul** `#007AFF` (claro) / `#3395FF` (escuro). Estados Apple: ok `#34C759`, warn `#FF9500`, err `#FF453A/#FF3B30`.
- **Fonte = Inter** (UI) + mono (terminal). Ambas **bundladas** no app (offline/privado).
- **Dois temas** completos; flip por `data-theme` no `<html>`.
- **KEEP (não é violeta):** `src/shared/roles.ts` (papéis → `--paper-*`, correto), `src/main/**`, `src/preload/**`, e a feature de find/replace de notas (`NoteFindBar`, `notes/findMatches*`, `notes/searchReplaceExtension`).
- **Verificar renderizado a cada lote** (claro E escuro) antes de dar como pronto — nunca concluir por teste verde (lição do violeta: passou nos testes e era feio). Manter `npm run typecheck` e `npm test` (vitest) verdes.
- Motion 130–320ms; `prefers-reduced-motion` zera; contraste ≥ 4.5:1.

## File Structure (o que cada arquivo passa a ser responsável)

- `src/renderer/src/styles/tokens.css` — **única fonte de verdade** de cor/forma/tipo/motion (valores DesignCode; nomes mantidos).
- `styles/base.css` — reset, `body` (Inter, 13px), `:focus-visible` (accent). `styles/motion.css` — keyframes (fade/scale + novos: beam/shimmer/attention). `styles/scrollbars.css` — scrollbars tokenizadas.
- `components/Canvas.{css,tsx}` — chrome do React Flow (grade, controles, minimap tema-aware, edges base).
- `components/nodes.css` + `components/nodeState.ts` (novo) — nós, **estados do nó**, notas, badges. `components/TypedEdge.tsx`, `edges/*` — edges por tipo + edge animada.
- `components/TerminalNode.tsx` + `terminal/xtermTheme.ts` (novo) — **`theme` do xterm derivado dos tokens**. `NewTerminalModal.{tsx,css}` — modal.
- `components/ProjectsSidebar.{tsx,css}`, `components/Topbar.{tsx,css}`, `components/ThemeToggle.tsx`, `components/Logo.tsx` — cromo de vidro, pílula ativa, thumb deslizante, logo tema-aware.
- `components/CommandPalette.{tsx,css}`, `components/CanvasContextMenu.{tsx,css}`, `components/GroupNode.{tsx,css}`, `components/FileTreeNode.{tsx,css}`, `components/NoteNode.tsx` — overlays/árvore/nota.
- `components/ErrorBoundary.tsx`, `components/PortalNode.tsx`, `components/Icon.tsx`, `App.tsx` — shell, erro (de-inline), portal, ícones.

---

### Task 0: Auditoria da base & preparação (não-destrutivo)

**Files:**
- Inspect: working tree (`git status`, `git diff`)
- Test: n/a

**Interfaces:**
- Produces: uma lista categorizada {SUBSTITUIR styling violeta | MANTER lógica/feature} que orienta as tasks seguintes.

- [ ] **Step 1: Listar e categorizar o diff do working tree**

Run: `git status --short && git diff --stat`
Categorize cada arquivo:
- **SUBSTITUIR (styling violeta):** `styles/tokens.css` (valores), e as mudanças *visuais* em `Canvas.css`, `nodes.css`, `CommandPalette.css`, `NewTerminalModal.css`, `CanvasContextMenu.css`, `FileTreeNode.css`, `GroupNode.css`, `Topbar.css`, `ProjectsSidebar.css`, `Logo.tsx`, `ErrorBoundary.tsx` e afins.
- **MANTER (não é violeta):** `src/main/**`, `src/preload/**`, `src/shared/roles.ts` (+test), a feature de notas find/replace, e a **arquitetura** de tokens (scales, materiais).

- [ ] **Step 2: Confirmar com o humano antes de qualquer descarte**

Não rodar `git checkout`/`git restore` em massa. A reformulação é feita **editando os arquivos** (o violeta é sobrescrito). Se algum arquivo estiver tão enroscado que compense resetá-lo pro HEAD e reconstruir, **listar quais e pedir OK** antes.

- [ ] **Step 3: Baseline verde**

Run: `npm run typecheck && npm test`
Expected: ambos PASS (registrar o estado inicial). Se algo já falha, anotar (não é regressão do plano).

- [ ] **Step 4: Commit (branch de trabalho)**

```bash
git checkout -b feat/designcode-ui
git add docs/superpowers docs/design-system
git commit -m "docs(design): spec + mockups DesignCode UI"
```

---

### Task 1 (Lote A): Fundação — tokens, base, motion, scrollbars

**Files:**
- Modify: `src/renderer/src/styles/tokens.css` (blocos `:root` e `:root[data-theme='light']`)
- Modify: `src/renderer/src/styles/base.css`, `src/renderer/src/styles/motion.css`, `src/renderer/src/styles/scrollbars.css`
- Add: fontes Inter + mono ao bundle (ver Step 4)
- Test: `src/renderer/src/styles/tokens.test.ts` (novo)

**Interfaces:**
- Produces: todos os tokens da spec §2 (nomes mantidos) + keyframes `ork-beam`, `ork-shimmer`, `ork-attention-pulse` + `@property --beam`. Consumidos por todos os lotes seguintes.

- [ ] **Step 1: Teste de tokens (falha primeiro)**

Create `src/renderer/src/styles/tokens.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')

describe('tokens.css — DesignCode UI', () => {
  it('não contém nenhum resquício violeta', () => {
    for (const hex of ['#7c6cff', '#6b5cf5', '#c74bff', '#8b5cf6', '#a855f7', '#c084fc']) {
      expect(css.toLowerCase()).not.toContain(hex)
    }
  })
  it('define o accent azul nos dois temas', () => {
    expect(css).toMatch(/--accent:\s*#3395FF/i) // escuro (:root)
    expect(css).toMatch(/--accent:\s*#007AFF/i) // claro
  })
  it('mantém os nomes de token essenciais', () => {
    for (const t of ['--bg-0', '--bg-1', '--text-1', '--text-2', '--border', '--ok', '--warn',
      '--err', '--radius-node', '--glass-1', '--scrim', '--font-ui', '--font-mono', '--dur-1',
      '--term-bg', '--term-fg', '--paper-teal', '--gradient-accent']) {
      expect(css).toContain(t)
    }
  })
})
```

- [ ] **Step 2: Rodar o teste — deve falhar**

Run: `npm test -- tokens` → Expected: FAIL (ainda há violeta / accent errado).

- [ ] **Step 3: Reescrever os valores de token**

Substituir os blocos `:root` e `:root[data-theme='light']` de `tokens.css` pelos valores **verbatim** da spec §2.1, §2.2 e §2.3 (forma/tipo/motion). Manter o bloco `@media (prefers-reduced-motion)` e `@media (prefers-contrast: more)`. Incluir `--term-bg`/`--term-fg` (spec §2.1/§2.2) e `@property --beam { syntax:'<angle>'; inherits:false; initial-value:0deg }` no topo do arquivo.

- [ ] **Step 4: base.css + fontes + motion.css + scrollbars.css**

- `base.css`: `body { font-family: var(--font-ui); font-size: var(--fs-base); -webkit-font-smoothing: antialiased; }`; `:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px }`.
- Bundlar **Inter** (400/500/600/700) e um mono (**JetBrains Mono** 400/500) via `@fontsource/inter` + `@fontsource/jetbrains-mono` (adicionar deps) importados em `base.css` ou no entry; conferir que `--font-ui`/`--font-mono` os referenciam primeiro.
- `motion.css`: manter `ork-fade-in`/`ork-scale-in`; adicionar:
```css
@keyframes ork-beam { to { --beam: 360deg } }
@keyframes ork-shimmer { 0% { transform: translateX(-130%) skewX(-18deg) } 55%,100% { transform: translateX(360%) skewX(-18deg) } }
@keyframes ork-attention-pulse { 0%{box-shadow:0 0 0 0 var(--attention-ring)} 70%{box-shadow:0 0 0 7px transparent} 100%{box-shadow:0 0 0 0 transparent} }
```
- `scrollbars.css`: thumb `--border-strong`, track transparente, `--radius-pill`, largura 10px.

- [ ] **Step 5: Verde + render smoke (dois temas)**

Run: `npm test -- tokens && npm run typecheck` → PASS.
Run: `npm run dev` (ou a skill `/run`), e **verificar renderizado**: app sobe sem erro no console; alternar `data-theme` (via ThemeToggle) troca claro↔escuro sem quebra; fonte é Inter. Nenhum roxo em lugar nenhum.

- [ ] **Step 6: Commit**
```bash
git add src/renderer/src/styles package.json package-lock.json
git commit -m "feat(design): Lote A — tokens/base/motion DesignCode UI (azul, Inter)"
```

---

### Task 2 (Lote B): Canvas / React Flow chrome

**Files:**
- Modify: `src/renderer/src/components/Canvas.tsx`, `src/renderer/src/components/Canvas.css`
- Test: n/a (verificação renderizada)

**Interfaces:**
- Consumes: tokens do Lote A. Produces: canvas base (grade, controles, minimap, edges base) tema-aware.

- [ ] **Step 1: Grade + controles + fundo**

Em `Canvas.css`: `--xy-background-color: var(--bg-0)`, `--xy-background-pattern-color: var(--border)`; controles (`.react-flow__controls*`) com `--bg-1`/`--border`/`--radius-sm`/`--shadow-1`; remover `color:#fff` e `border rgba(0,0,0,.15)` hardcoded (spec §4, inventário §Problemas).

- [ ] **Step 2: Minimap tema-aware (corrigir bug crítico)**

Em `Canvas.tsx`, o MiniMap `maskColor` hardcoded (`rgba(11,13,18,0.6)`) **não acompanha o tema**. Derivar de token: usar `maskColor="var(--scrim)"` (ou ler `--bg-0` via `getComputedStyle` e compor alpha) e `nodeColor="var(--text-3)"`. `<Background variant={Dots} gap={22} size={1} />`.

- [ ] **Step 3: Edges por tipo (base)**

`Canvas.css` edges: agente→`var(--accent)`, chain→`var(--ok)`, note→`var(--warn)`, portal/link→`var(--border-strong)` (spec §4). Manter espessura da corda.

- [ ] **Step 4: Verificar renderizado (claro + escuro)**

`npm run typecheck` PASS. Rodar o app: grade de pontos correta nos dois temas; **minimap acompanha o tema** (não fica escuro no claro); controles legíveis; edges com as cores certas. Comparar com `mockups/orkestra-canvas.html`.

- [ ] **Step 5: Commit** — `git commit -m "feat(design): Lote B — canvas/minimap/edges tema-aware"`

---

### Task 3 (Lote C): Nós, estados do nó, notas, badges

**Files:**
- Add: `src/renderer/src/components/nodeState.ts`
- Modify: `src/renderer/src/components/nodes.css`, `components/TypedEdge.tsx`, `components/TerminalFlowNode.tsx`, `notes/noteColors.ts`
- Test: `src/renderer/src/components/nodeState.test.ts` (novo)

**Interfaces:**
- Produces: `nodeStateClass(state: NodeState): string` — mapeia estado → classe CSS. Consumido por `TerminalFlowNode`/`TerminalNode`.

- [ ] **Step 1: Teste do helper de estado (falha primeiro)**

Create `nodeState.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { nodeStateClass, type NodeState } from './nodeState'

describe('nodeStateClass', () => {
  it('mapeia cada estado para sua classe', () => {
    expect(nodeStateClass('idle')).toBe('')
    expect(nodeStateClass('generating')).toBe('is-generating')
    expect(nodeStateClass('needsInput')).toBe('needs-attention')
    expect(nodeStateClass('done')).toBe('is-done')
  })
  it('combina seleção com gerando', () => {
    expect(nodeStateClass('generating', true)).toBe('is-generating is-selected')
  })
})
```
Run `npm test -- nodeState` → FAIL.

- [ ] **Step 2: Implementar `nodeState.ts`**
```ts
export type NodeState = 'idle' | 'generating' | 'needsInput' | 'done'
const MAP: Record<NodeState, string> = {
  idle: '', generating: 'is-generating', needsInput: 'needs-attention', done: 'is-done'
}
export function nodeStateClass(state: NodeState, selected = false): string {
  return [MAP[state], selected ? 'is-selected' : ''].filter(Boolean).join(' ')
}
```
Run `npm test -- nodeState` → PASS.

- [ ] **Step 3: CSS dos estados do nó (`nodes.css`)** — spec §5/§6, sem glow azul:
```css
.ork-node { background:var(--bg-1); border:1px solid var(--border); border-radius:var(--radius-node); box-shadow:var(--shadow-1); transition:transform var(--dur-2) var(--spring), box-shadow var(--dur-2) var(--ease); }
.ork-node:hover { transform:translateY(-3px); box-shadow:var(--shadow-1),0 18px 38px rgba(0,0,0,.14); }
.ork-node.is-selected { box-shadow:var(--shadow-1), var(--ring-focus); }
.ork-node.needs-attention { animation:ork-attention-pulse 1.7s ease-in-out infinite; }
/* border-beam (gerando) — wrapper com conic + @property, SEM drop-shadow azul */
.ork-node.is-generating { position:relative; }
.ork-node.is-generating::after { content:''; position:absolute; inset:-1.5px; border-radius:inherit; padding:1.5px; z-index:2; pointer-events:none;
  background:conic-gradient(from var(--beam), transparent 0 250deg, var(--accent-hover) 320deg, var(--accent) 360deg);
  -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude;
  animation:ork-beam 3.4s linear infinite; }
```
Também: substituir `color:#1a1a1a`/`#0a7`/`rgba(0,0,0,.35)` do post-it por `--note-ink`/`--accent`/tokens; pulso de atenção tokenizado (`--attention-ring`).

- [ ] **Step 4: `noteColors.ts` + tags de papel**

`noteColors.ts`: refinar os 6 hex para pastéis (claro) com par escuro tema-consciente; texto = `--note-ink`. Tags de papel em `TerminalFlowNode.tsx`/`nodes.css`: receita "papel a ~14% + dot sólido" usando os `--paper-*` já referenciados por `roles.ts` (Líder=accent, Dev=`--paper-teal`, Revisor=`--paper-amber`, Testador=`--paper-pink`).

> Nota de reconciliação: o mockup ilustrou Dev=verde/Revisor=laranja, mas `roles.ts` (mantido) usa teal/amber/pink pra **separar papel de estado**. Seguir `roles.ts`. Confirmar a paleta de papéis com o humano se houver dúvida.

- [ ] **Step 5: Wire do estado**

Em `TerminalFlowNode.tsx`/`TerminalNode.tsx`, aplicar `nodeStateClass(state, selected)` na classe do nó. O `state` vem do estado do PTY/agente (heurística de "busy" do terminal ou sinal do wrapper `claude` — **definir o sinal concreto neste step**; se ainda não houver, expor `generating` via prop e ligar num passo posterior, deixando `idle` como default).

- [ ] **Step 6: Verde + render (claro+escuro)** — `npm test && npm run typecheck` PASS; rodar app: nó idle normal; forçar `is-generating` (temporariamente) → borda corre **sem glow azul**; `needs-attention` pulsa; seleção = anel. Comparar com `mockups/orkestra-canvas.html`.

- [ ] **Step 7: Commit** — `git commit -m "feat(design): Lote C — nós, estados (border-beam), notas, tags"`

---

### Task 4 (Lote D): Terminal / xterm — theme tokenizado (crítico)

**Files:**
- Add: `src/renderer/src/terminal/xtermTheme.ts`
- Modify: `src/renderer/src/components/TerminalNode.tsx` (linhas ~27-31), `components/NewTerminalModal.{tsx,css}`
- Test: `src/renderer/src/terminal/xtermTheme.test.ts`

**Interfaces:**
- Produces: `xtermThemeFromTokens(): ITheme` — lê os CSS custom properties atuais e devolve o objeto `theme` do xterm. Reexecutado no flip de tema.

- [ ] **Step 1: Teste (falha primeiro)**
```ts
import { describe, it, expect, vi } from 'vitest'
import { xtermThemeFromTokens } from './xtermTheme'
it('deriva o theme dos tokens (background/foreground/cursor)', () => {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue:(k:string)=>
    ({'--term-bg':' #0B0C11','--term-fg':' #C3CBD9','--accent':' #3395FF','--accent-weak':' rgba(51,149,255,.18)'} as Record<string,string>)[k] ?? '' } as CSSStyleDeclaration)
  const t = xtermThemeFromTokens()
  expect(t.background).toBe('#0B0C11'); expect(t.foreground).toBe('#C3CBD9'); expect(t.cursor).toBe('#3395FF')
})
```
Run `npm test -- xtermTheme` → FAIL.

- [ ] **Step 2: Implementar `xtermTheme.ts`**
```ts
import type { ITheme } from '@xterm/xterm'
const v = (s: CSSStyleDeclaration, k: string) => s.getPropertyValue(k).trim()
export function xtermThemeFromTokens(root: HTMLElement = document.documentElement): ITheme {
  const s = getComputedStyle(root)
  return {
    background: v(s,'--term-bg'), foreground: v(s,'--term-fg'),
    cursor: v(s,'--accent'), cursorAccent: v(s,'--term-bg'), selectionBackground: v(s,'--accent-weak'),
    black:'#1d1d1f', red:v(s,'--err'), green:v(s,'--ok'), yellow:v(s,'--warn'), blue:v(s,'--accent'),
    magenta:v(s,'--paper-purple'), cyan:v(s,'--paper-cyan'), white:v(s,'--text-2'),
    brightBlack:v(s,'--text-3'), brightWhite:v(s,'--text-1')
  }
}
```
Run `npm test -- xtermTheme` → PASS.

- [ ] **Step 3: Consumir no `TerminalNode.tsx`**

Onde o `Terminal` do xterm é criado (linhas ~27-31), passar `theme: xtermThemeFromTokens()`, `fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim()` (ou a var direta), `fontSize: 13`. Assinar o flip de tema (observar `data-theme` via `MutationObserver` no `<html>`) e chamar `term.options.theme = xtermThemeFromTokens()`.

- [ ] **Step 4: Modal de novo terminal (`NewTerminalModal.*`)**

Aplicar spec §4 modal: `--glass-3`/`--material-thick`/`--radius-lg`/`--shadow-3` sobre `--scrim`; campos com anel de foco; segmented de papel deslizante; CTA "Criar terminal" primário (shimmer). Remover overlay `rgba(0,0,0,0.5)` hardcoded → `--scrim`. Comparar com `mockups/orkestra-overlays.html`.

- [ ] **Step 5: Verde + render (claro+escuro)** — `npm test && npm run typecheck` PASS; rodar app: **terminal acompanha o tema** (fundo/texto/cursor), fonte mono correta; modal em vidro com foco/segmented/CTA.

- [ ] **Step 6: Commit** — `git commit -m "feat(design): Lote D — xterm theme tokenizado + modal"`

---

### Task 5 (Lote E): Sidebar / Topbar / Logo / Tema

**Files:** Modify `components/ProjectsSidebar.{tsx,css}`, `components/Topbar.{tsx,css}`, `components/ThemeToggle.tsx`, `components/Logo.tsx`.

- [ ] **Step 1: Sidebar** — material `.sidebar` (`--glass-1`+`--material-chrome`), borda+hairline; logo com `--gradient-brand`; busca `--bg-2-weak`; **projeto ativo = pílula `--accent` cheia** (texto branco, sombra azul suave); normalizar font-sizes fracionários → `--fs-*` (spec §4).
- [ ] **Step 2: Topbar** — pílulas de vidro (`--glass-1`, `--radius-pill`, `--shadow-1`, hairline); **tool ativo = thumb azul deslizante** (`transform`+`--spring`); CTA "Novo" primário (shimmer/gloss/glow).
- [ ] **Step 3: Logo tema-aware** — remover hex de marca inline do SVG; usar `--gradient-brand` + `currentColor`/tokens; reagir ao tema.
- [ ] **Step 4: Verificar renderizado (claro+escuro)** vs `mockups/orkestra-canvas.html`: vidro no cromo, pílula ativa azul, thumb desliza, logo correto nos dois temas. `npm run typecheck` PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(design): Lote E — sidebar/topbar/logo/tema"`

---

### Task 6 (Lote F): Overlays / paleta / menus / árvore / nota

**Files:** Modify `components/CommandPalette.{tsx,css}`, `components/CanvasContextMenu.{tsx,css}`, `components/GroupNode.{tsx,css}`, `components/FileTreeNode.{tsx,css}`, `components/NoteNode.tsx`, `components/MarkdownView.tsx`.

- [ ] **Step 1: Command Palette** — card `--glass-2`/`--material-regular`/`--radius-lg`/`--shadow-2` sobre `--scrim`; hairline; item ativo = `--accent-weak` + barra azul 3px + texto/ícone `--accent`; atalhos em `kbd` (mono); grupos + footer (spec §4). Comparar `mockups/orkestra-overlays.html`.
- [ ] **Step 2: Context menu** — material `.menu` (`--glass-2`/`--material-thin`); danger = `--danger`+`--err-weak`; remover fallbacks `var(--err,#hex)` duplicados.
- [ ] **Step 3: GroupNode + FileTree** — GroupNode `--bg-2-weak` + tracejado `--border`; FileTree `12.5px`→`--fs-sm`, gitmark semântico (ok/warn/err), row ativa `--accent-weak`.
- [ ] **Step 4: NoteNode/Markdown** — texto sobre papel `--note-ink`; links `--accent`; preservar a feature find/replace (não regredir `NoteFindBar`).
- [ ] **Step 5: Verificar renderizado (claro+escuro)**; `npm test && npm run typecheck` PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(design): Lote F — paleta/menus/árvore/nota"`

---

### Task 7 (Lote G): Shell / erro / portal / ícones

**Files:** Modify `App.tsx`, `components/ErrorBoundary.tsx`, `components/PortalNode.tsx`, `components/PortalFlowNode.tsx`, `components/Icon.tsx`.

- [ ] **Step 1: ErrorBoundary** — remover estilos inline; usar classes tokenizadas (`--err`, `--bg-1`, `--radius`); sem fallback hex.
- [ ] **Step 2: Portal** — cartão opaco `--radius-node`; barra de URL/sessão `--bg-2` + `:focus-within` (anel de foco).
- [ ] **Step 3: Icon.tsx** — garantir linha 1.7px, `stroke:currentColor`, cap/join round; micro-motion opcional no hover via classe (`--spring`).
- [ ] **Step 4: Verificar renderizado (claro+escuro)**; `npm run typecheck` PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(design): Lote G — shell/erro/portal/ícones"`

---

### Task 8: Integração, polish & acessibilidade

**Files:** varredura transversal (qualquer arquivo com resíduo).

- [ ] **Step 1: Caça a resíduos** — `grep -rniE '#7c6cff|#6b5cf5|#c74bff|#8b5cf6|rgba\(0,\s*0,\s*0,\s*0\.5\)|color:\s*#fff' src/renderer/src` → corrigir qualquer hardcode/violeta restante.
- [ ] **Step 2: Passe renderizado completo** — rodar o app e percorrer TODAS as superfícies (canvas, nós/estados, terminal, sidebar, topbar, paleta, modal, menu, nota, portal, erro) **nos dois temas**, comparando com `docs/design-system/mockups/`. Corrigir divergências.
- [ ] **Step 3: A11y** — verificar `prefers-reduced-motion` (beam/pulsos/shimmer param), `prefers-contrast: more` (hairlines), contraste ≥ 4.5:1 nos dois temas, `:focus-visible` sempre visível.
- [ ] **Step 4: Suite final** — `npm run typecheck && npm test && npm run lint` → tudo PASS.
- [ ] **Step 5: Commit final** — `git commit -m "feat(design): Lote H — polish, a11y, remoção de resíduos"`

---

## Self-Review

**Spec coverage:** §1 essência → Tasks 1-8 (princípios aplicados). §2 tokens → Task 1. §3 materiais → Tasks 1/4/5/6. §4 componentes → Tasks 2-7 (cada componente mapeado). §5 estados do nó → Task 3. §6 motion → Tasks 1 (keyframes) + 3/4/5/6 (uso). §7 checklist por arquivo → Tasks 1-7 (Lotes A-G) 1:1. §8 estratégia → Task 0. §9 a11y → Task 8. ✅ sem lacunas.

**Placeholder scan:** o "sinal concreto" do estado `generating` (Task 3 Step 5) é a única parte com decisão em aberto — mitigada com fallback explícito (`idle` default, prop `generating`), a ser ligada ao PTY/wrapper na execução. Restante tem código/comandos concretos.

**Type consistency:** `NodeState`/`nodeStateClass` (Task 3) e `xtermThemeFromTokens` (Task 4) consistentes entre definição e uso. Nomes de token batem com a spec §2.

---

## Notas de execução
- Lotes B–G são disjuntos por arquivo (paralelizáveis), mas **A é pré-requisito** de todos.
- Regra de ouro: **ver renderizado nos dois temas antes de commitar cada lote** (a razão do fracasso violeta).
