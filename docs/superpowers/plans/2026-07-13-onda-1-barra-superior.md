# Onda 1 — Barra superior (F01) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever a `Topbar` para o layout exato da imagem 1 (3 grupos: esquerda / centro / direita), com toggle de sidebar unificado e os disparadores dos nós.

**Architecture:** O estado `collapsed` da sidebar sai de um `useState` local da `ProjectsSidebar` e passa a viver no `canvasStore` (fonte única), persistido em `localStorage` por um módulo puro no molde de `edges/edgeStyle.ts`. A `Topbar` vira 3 grupos num grid `1fr auto 1fr`; botões cujas ações já existem (novo terminal/nota/pasta/portal, abrir editor) ficam funcionais, o toggle de sidebar lê/escreve o store, o `+ novo projeto` dispara um `CustomEvent` que a `ProjectsSidebar` escuta (reusa seu `handleCreate`), e os ícones de funções ainda inexistentes (arquivo, texto, desenho, `{}`, share) renderizam **desabilitados** ("em breve") até suas próprias ondas.

**Tech Stack:** React 18.3.1 + TypeScript, `@xyflow/react` 12, zustand 5, Vite/electron-vite, Vitest (env `node`).

## Global Constraints

- **Idioma:** todo texto de UI, comentário e mensagem de commit em **português** (com acentuação correta).
- **Sem novas dependências** nesta onda.
- **Estratégia de teste do projeto:** só há testes de **lógica pura** em `*.test.ts` (Vitest env `node`); **não** existe `@testing-library` nem testes de render `.tsx`, e **não** deve ser adicionado nesta onda. Portanto: módulos `.ts` → TDD (teste primeiro); componentes `.tsx` → implementados e verificados por `npm run typecheck`, `npm run lint` e **checkpoint visual** do usuário (`npm run dev` comparando com `docs/images/1.png`).
- **zustand v5:** qualquer seletor que derive array/objeto novo exige `useShallow` (senão loop de render). Seletores desta onda retornam primitivos (`boolean`, função) — sem risco, mas manter a regra.
- **Persistência de UI:** chave `localStorage` do colapso da sidebar continua `orkestra.sidebar.collapsed` (preserva a preferência já gravada dos usuários).
- Rodar a suíte inteira (`npm test`) deve ficar **verde** ao fim de cada task que toca lógica.

---

### Task 1: Estado `sidebarCollapsed` no store (lógica pura + persistência)

**Files:**
- Create: `src/renderer/src/ui/sidebarCollapsed.ts`
- Test: `src/renderer/src/ui/sidebarCollapsed.test.ts`
- Modify: `src/renderer/src/store/canvasStore.ts` (interface `CanvasState` ~linha 19-109; criação do store ~linha 111-122, ao lado de `edgeStyle`)
- Modify: `src/renderer/src/store/canvasStore.test.ts` (adicionar caso)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `resolveSidebarCollapsed(stored: string | null): boolean`
  - `loadSidebarCollapsed(): boolean`
  - `saveSidebarCollapsed(collapsed: boolean): void`
  - store: `sidebarCollapsed: boolean`, `setSidebarCollapsed(v: boolean): void`, `toggleSidebar(): void`

- [ ] **Step 1: Escrever o teste que falha (módulo puro)**

Create `src/renderer/src/ui/sidebarCollapsed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveSidebarCollapsed } from './sidebarCollapsed'

describe('resolveSidebarCollapsed', () => {
  it('retorna true somente quando o valor salvo é exatamente "true"', () => {
    expect(resolveSidebarCollapsed('true')).toBe(true)
  })
  it('retorna false para null (nenhuma preferência salva)', () => {
    expect(resolveSidebarCollapsed(null)).toBe(false)
  })
  it('retorna false para qualquer outra string', () => {
    expect(resolveSidebarCollapsed('false')).toBe(false)
    expect(resolveSidebarCollapsed('1')).toBe(false)
    expect(resolveSidebarCollapsed('')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/renderer/src/ui/sidebarCollapsed.test.ts`
Expected: FAIL — `Failed to resolve import './sidebarCollapsed'` (módulo ainda não existe).

- [ ] **Step 3: Implementar o módulo puro**

Create `src/renderer/src/ui/sidebarCollapsed.ts` (espelha `edges/edgeStyle.ts`: resolução pura + wrappers de `localStorage` com try/catch):

```ts
// Preferência de UI: sidebar de projetos colapsada. Fonte única lida pelo canvasStore (a
// ProjectsSidebar e a Topbar reagem a s.sidebarCollapsed). Molde de edges/edgeStyle.ts: a
// reatividade vem do store; aqui só resolvemos/persistimos o valor. Chave mantida do estado
// local anterior da sidebar (Fase 18 Task 4) para preservar a preferência já gravada.
const STORAGE_KEY = 'orkestra.sidebar.collapsed'

export function resolveSidebarCollapsed(stored: string | null): boolean {
  return stored === 'true'
}

export function loadSidebarCollapsed(): boolean {
  let stored: string | null = null
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  } catch {
    stored = null
  }
  return resolveSidebarCollapsed(stored)
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed))
  } catch {
    /* localStorage indisponível — o valor segue em memória no store */
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/renderer/src/ui/sidebarCollapsed.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Escrever o teste que falha (store)**

Em `src/renderer/src/store/canvasStore.test.ts`, adicionar (ajuste os imports `describe/it/expect` ao topo se já existirem — reuse-os):

```ts
describe('sidebarCollapsed', () => {
  it('toggleSidebar inverte o valor e setSidebarCollapsed fixa', () => {
    const store = useCanvasStore.getState()
    store.setSidebarCollapsed(false)
    expect(useCanvasStore.getState().sidebarCollapsed).toBe(false)
    store.toggleSidebar()
    expect(useCanvasStore.getState().sidebarCollapsed).toBe(true)
    store.toggleSidebar()
    expect(useCanvasStore.getState().sidebarCollapsed).toBe(false)
  })
})
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npx vitest run src/renderer/src/store/canvasStore.test.ts`
Expected: FAIL — `toggleSidebar is not a function` (ainda não existe no store).

- [ ] **Step 7: Implementar no store**

Em `canvasStore.ts`:

1. Adicionar o import ao topo (ao lado do import de `edgeStyle`):
```ts
import { loadSidebarCollapsed, saveSidebarCollapsed } from '../ui/sidebarCollapsed'
```

2. Na interface `CanvasState`, logo abaixo de `setEdgeStyle` (~linha 36), acrescentar:
```ts
  // Onda 1 (F01): sidebar de projetos colapsada. Fonte única — lida pela ProjectsSidebar (render)
  // e pela Topbar (botão de painel). Persistida em localStorage (ui/sidebarCollapsed). Efêmera do
  // ponto de vista do canvas: NÃO entra em serialize()/hydrate().
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean) => void
  toggleSidebar: () => void
```

3. Na criação do store, logo abaixo de `setEdgeStyle` (~linha 122), acrescentar:
```ts
  sidebarCollapsed: loadSidebarCollapsed(),
  setSidebarCollapsed: (v): void => {
    saveSidebarCollapsed(v)
    set({ sidebarCollapsed: v })
  },
  toggleSidebar: (): void => {
    const next = !get().sidebarCollapsed
    saveSidebarCollapsed(next)
    set({ sidebarCollapsed: next })
  },
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/renderer/src/store/canvasStore.test.ts`
Expected: PASS (inclusive o novo caso).

- [ ] **Step 9: Typecheck + commit**

Run: `npm run typecheck`
Expected: sem erros.

```bash
git add src/renderer/src/ui/sidebarCollapsed.ts src/renderer/src/ui/sidebarCollapsed.test.ts src/renderer/src/store/canvasStore.ts src/renderer/src/store/canvasStore.test.ts
git commit -m "feat(ui): estado sidebarCollapsed no store (fonte unica p/ topbar e sidebar)"
```

---

### Task 2: `ProjectsSidebar` consome o store (remove estado local)

**Files:**
- Modify: `src/renderer/src/components/ProjectsSidebar.tsx` (constante `SIDEBAR_COLLAPSED_KEY` ~linha 19; `useState collapsed` ~linha 73-79; `toggleCollapsed` ~linha 229-239; uso em render)

**Interfaces:**
- Consumes: `useCanvasStore` → `sidebarCollapsed`, `toggleSidebar` (Task 1).
- Produces: nada novo (comportamento idêntico, fonte de estado trocada).

- [ ] **Step 1: Trocar o estado local pelo store**

Em `ProjectsSidebar.tsx`:

1. Remover a constante `SIDEBAR_COLLAPSED_KEY` (~linha 17-19) — a chave agora vive só em `ui/sidebarCollapsed.ts`.

2. Remover o bloco `const [collapsed, setCollapsed] = useState<boolean>(() => { … })` (~linha 69-79).

3. Logo após a primeira linha de hooks do componente, ler do store:
```ts
  const collapsed = useCanvasStore((s) => s.sidebarCollapsed)
  const toggleCollapsed = useCanvasStore((s) => s.toggleSidebar)
```

4. Remover a função local `toggleCollapsed` (~linha 226-239) — agora vem do store (o `onClick={toggleCollapsed}` do botão `«/»` continua igual, apontando para a versão do store).

`useCanvasStore` já está importado no arquivo (usado em outros pontos). `useState` continua importado (usado por outros estados). Não sobra referência a `SIDEBAR_COLLAPSED_KEY` nem ao `setCollapsed`.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros (nenhuma variável não usada, nenhum import órfão).

- [ ] **Step 3: Checkpoint visual**

Run: `npm run dev`
Verificar: o botão `«/»` no topo da sidebar ainda colapsa/expande; a preferência sobrevive a um reload (`Cmd+R`). Nada mais mudou visualmente.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ProjectsSidebar.tsx
git commit -m "refactor(sidebar): le o colapso do store (fonte unica) em vez de useState local"
```

---

### Task 3: `basename` compartilhado (lógica pura) + rótulo do workspace

**Files:**
- Create: `src/renderer/src/ui/paths.ts`
- Test: `src/renderer/src/ui/paths.test.ts`
- Modify: `src/renderer/src/components/ProjectsSidebar.tsx` (função local `basename` ~linha 28-31 → import)

**Interfaces:**
- Consumes: nada.
- Produces: `basename(path: string): string` — último segmento não-vazio de um caminho POSIX ou Windows.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/renderer/src/ui/paths.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { basename } from './paths'

describe('basename', () => {
  it('extrai o último segmento POSIX', () => {
    expect(basename('/Users/felipe/projeto')).toBe('projeto')
  })
  it('ignora barra final', () => {
    expect(basename('/a/b/')).toBe('b')
  })
  it('funciona com caminho Windows', () => {
    expect(basename('C:\\dev\\orkestra')).toBe('orkestra')
  })
  it('devolve o próprio valor quando não há separador', () => {
    expect(basename('solto')).toBe('solto')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/renderer/src/ui/paths.test.ts`
Expected: FAIL — módulo `./paths` não existe.

- [ ] **Step 3: Implementar (extraído verbatim da lógica já usada na sidebar)**

Create `src/renderer/src/ui/paths.ts`:

```ts
// Último segmento não-vazio de um caminho (POSIX "/a/b/" e Windows "C:\\a\\b\\"). Extraído da
// ProjectsSidebar (Fase 17) para reuso na Topbar (rótulo do workspace) — DRY.
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/renderer/src/ui/paths.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Migrar a sidebar para o módulo (DRY)**

Em `ProjectsSidebar.tsx`: remover a função local `basename` (~linha 27-31) e adicionar o import ao topo:
```ts
import { basename } from '../ui/paths'
```
Os usos existentes (`basename(cwd)`, `basename(p.cwd)`) continuam iguais.

- [ ] **Step 6: Typecheck + testes + commit**

Run: `npm run typecheck && npx vitest run src/renderer/src/ui/paths.test.ts`
Expected: sem erros; PASS.

```bash
git add src/renderer/src/ui/paths.ts src/renderer/src/ui/paths.test.ts src/renderer/src/components/ProjectsSidebar.tsx
git commit -m "refactor(ui): extrai basename p/ ui/paths (reuso topbar) + teste"
```

---

### Task 4: Reescrever a `Topbar` (3 grupos + ícones) e o CSS

**Files:**
- Modify: `src/renderer/src/components/Topbar.tsx` (arquivo inteiro)
- Modify: `src/renderer/src/components/Topbar.css` (layout de 3 grupos + estado disabled)

**Interfaces:**
- Consumes: `basename` (Task 3).
- Produces: nova assinatura da `Topbar` consumida pelo `Canvas` na Task 5:
```ts
Topbar(props: {
  cwd: string | null
  collapsed: boolean
  onToggleSidebar: () => void
  onNewProject: () => void
  onSelectMode: () => void      // "cursor" — no-op visual nesta onda
  onNewTerminal: () => void
  onNote: () => void
  onFiles: () => void           // pasta (filetree)
  onPortal: () => void          // globo (site)
  onOpenIde: () => void
}): JSX.Element
```
Ícones **desabilitados** nesta onda (sem handler): arquivo (clip), texto (`Aa`), desenho (⊘), `{}`, share.

- [ ] **Step 1: Reescrever `Topbar.tsx`**

Substituir todo o conteúdo por (ícones SVG no mesmo padrão do arquivo atual — `viewBox 0 0 24 24`, `stroke currentColor 1.8`; os `path` são um ponto de partida a afinar no checkpoint visual contra `docs/images/1.png`):

```tsx
import type { JSX } from 'react'
import { basename } from '../ui/paths'
import './Topbar.css'

const svg = {
  width: 17,
  height: 17,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
}

function PlusIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function PanelIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M9 5v14" />
    </svg>
  )
}
function CursorIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <path d="M5 3l6 16 2-6 6-2z" />
    </svg>
  )
}
function TerminalIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <path d="M6 16l4-4-4-4" />
      <line x1="12" y1="17" x2="18" y2="17" />
    </svg>
  )
}
function NoteIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M9 10h6M9 14h6M9 18h3" />
    </svg>
  )
}
function ClipIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <path d="M21 12l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />
    </svg>
  )
}
function FolderIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}
function GlobeIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
    </svg>
  )
}
function DrawIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  )
}
function BracesIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <path d="M8 4c-1.5 0-2 1-2 2v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 1 .5 2 2 2" />
      <path d="M16 4c1.5 0 2 1 2 2v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 1-.5 2-2 2" />
    </svg>
  )
}
function CodeIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <path d="M9 8l-4 4 4 4" />
      <path d="M15 8l4 4-4 4" />
    </svg>
  )
}
function ShareIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 13v6h14v-6" />
    </svg>
  )
}

export function Topbar({
  cwd,
  collapsed,
  onToggleSidebar,
  onNewProject,
  onSelectMode,
  onNewTerminal,
  onNote,
  onFiles,
  onPortal,
  onOpenIde
}: {
  cwd: string | null
  collapsed: boolean
  onToggleSidebar: () => void
  onNewProject: () => void
  onSelectMode: () => void
  onNewTerminal: () => void
  onNote: () => void
  onFiles: () => void
  onPortal: () => void
  onOpenIde: () => void
}): JSX.Element {
  const workspace = cwd ? basename(cwd) : 'My Workspace'
  return (
    <div className="ork-topbar">
      <div className="ork-topbar-left">
        <button className="ork-topbar-tool" title="Novo projeto" aria-label="Novo projeto" onClick={onNewProject}>
          <PlusIcon />
        </button>
        <button
          className="ork-topbar-tool"
          title={collapsed ? 'Exibir menu lateral' : 'Ocultar menu lateral'}
          aria-label={collapsed ? 'Exibir menu lateral' : 'Ocultar menu lateral'}
          onClick={onToggleSidebar}
        >
          <PanelIcon />
        </button>
        <span className="ork-topbar-workspace" title={cwd ?? 'Nenhuma pasta vinculada'}>
          {workspace}
        </span>
      </div>

      <div className="ork-topbar-center">
        <button className="ork-topbar-tool ork-topbar-tool--active" title="Selecionar / navegar" aria-label="Selecionar / navegar" onClick={onSelectMode}>
          <CursorIcon />
        </button>
        <button className="ork-topbar-tool" title="Novo terminal" aria-label="Novo terminal" onClick={onNewTerminal}>
          <TerminalIcon />
        </button>
        <button className="ork-topbar-tool" title="Nova nota" aria-label="Nova nota" onClick={onNote}>
          <NoteIcon />
        </button>
        <button className="ork-topbar-tool" title="Anexar arquivo (em breve)" aria-label="Anexar arquivo" disabled>
          <ClipIcon />
        </button>
        <button className="ork-topbar-tool" title="Árvore de arquivos" aria-label="Árvore de arquivos" onClick={onFiles}>
          <FolderIcon />
        </button>
        <button className="ork-topbar-tool" title="Anexar site" aria-label="Anexar site" onClick={onPortal}>
          <GlobeIcon />
        </button>
        <button className="ork-topbar-tool ork-topbar-tool--text" title="Texto (em breve)" aria-label="Texto" disabled>
          Aa
        </button>
        <button className="ork-topbar-tool" title="Desenhar (em breve)" aria-label="Desenhar" disabled>
          <DrawIcon />
        </button>
      </div>

      <div className="ork-topbar-right">
        <button className="ork-topbar-tool" title="Em breve" aria-label="Snippet" disabled>
          <BracesIcon />
        </button>
        <button
          className="ork-topbar-tool"
          title={cwd ? 'Abrir no editor de código' : 'Vincule uma pasta ao projeto para abrir no editor'}
          aria-label="Abrir no editor de código"
          onClick={onOpenIde}
          disabled={!cwd}
        >
          <CodeIcon />
        </button>
        <button className="ork-topbar-tool" title="Compartilhar (em breve)" aria-label="Compartilhar" disabled>
          <ShareIcon />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Atualizar `Topbar.css` para 3 grupos**

Substituir o seletor `.ork-topbar` (flex) e os blocos `.ork-topbar-left`/`.ork-topbar-path`/`.ork-topbar-ide`/`.ork-topbar-tools`/`.ork-topbar-sep` pelo layout em grid. Conteúdo novo do arquivo:

```css
/* Barra superior (Onda 1 / F01): 3 grupos — esquerda (novo projeto, painel, workspace),
   centro (ferramentas de criação) e direita (código/ações). Grid 1fr auto 1fr centraliza o
   grupo do meio independentemente da largura dos outros dois. Tokens => tema. */

.ork-topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 44px;
  z-index: 10;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 10px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-1);
}

.ork-topbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  justify-self: start;
  color: var(--text-2);
}
.ork-topbar-center {
  display: flex;
  align-items: center;
  gap: 2px;
  justify-self: center;
}
.ork-topbar-right {
  display: flex;
  align-items: center;
  gap: 2px;
  justify-self: end;
}

.ork-topbar-workspace {
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 22vw;
  padding: 0 4px;
}

.ork-topbar-tool {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  font-size: 13px;
  color: var(--text-2);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    background var(--dur-1) var(--ease),
    color var(--dur-1) var(--ease);
}
.ork-topbar-tool:hover:not(:disabled) {
  background: var(--bg-2);
  color: var(--text-1);
}
.ork-topbar-tool--active {
  color: var(--accent);
}
.ork-topbar-tool--text {
  font-weight: 600;
  letter-spacing: -0.5px;
}
.ork-topbar-tool:disabled {
  opacity: 0.35;
  cursor: default;
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros. (A `Topbar` ainda não é chamada com a nova assinatura pelo `Canvas` — a Task 5 conserta isso; se o typecheck acusar props faltando no `Canvas.tsx`, é esperado e será resolvido na Task 5. Se preferir manter o typecheck verde a cada task, faça as Tasks 4 e 5 numa sequência sem commit intermediário.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/Topbar.tsx src/renderer/src/components/Topbar.css
git commit -m "feat(topbar): layout de 3 grupos com icones da imagem 1 (F01)"
```

---

### Task 5: Ligar a `Topbar` no `Canvas` + `CustomEvent` de novo projeto

**Files:**
- Create: `src/renderer/src/ui/appEvents.ts`
- Modify: `src/renderer/src/components/Canvas.tsx` (bloco `<Topbar … />` ~linha 220-232)
- Modify: `src/renderer/src/components/ProjectsSidebar.tsx` (adicionar listener; `handleCreate` ~linha 196)

**Interfaces:**
- Consumes: nova assinatura da `Topbar` (Task 4); `useCanvasStore` → `sidebarCollapsed`, `toggleSidebar`.
- Produces: `NEW_PROJECT_EVENT` (nome do `CustomEvent`), `emitNewProject(): void`.

- [ ] **Step 1: Criar o helper de evento (com teste do nome)**

Create `src/renderer/src/ui/appEvents.ts`:

```ts
// Comandos de UI globais disparados de um ponto da árvore e tratados em outro (ex.: o "+" da
// Topbar, dentro do Canvas, pede à ProjectsSidebar — sua irmã — para criar um projeto). Segue o
// padrão de window-events que o Canvas já usa para atalhos/drag. Nome em constante p/ não divergir
// entre o emissor e o ouvinte.
export const NEW_PROJECT_EVENT = 'orkestra:new-project'

export function emitNewProject(): void {
  window.dispatchEvent(new CustomEvent(NEW_PROJECT_EVENT))
}
```

Create `src/renderer/src/ui/appEvents.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { NEW_PROJECT_EVENT } from './appEvents'

describe('appEvents', () => {
  it('o nome do evento de novo projeto é estável', () => {
    expect(NEW_PROJECT_EVENT).toBe('orkestra:new-project')
  })
})
```

- [ ] **Step 2: Rodar o teste**

Run: `npx vitest run src/renderer/src/ui/appEvents.test.ts`
Expected: PASS (o módulo é trivial; o teste trava o nome do contrato entre emissor/ouvinte).

- [ ] **Step 3: Ligar a `Topbar` no `Canvas`**

Em `Canvas.tsx`:

1. Imports ao topo:
```ts
import { emitNewProject } from '../ui/appEvents'
```

2. Ler o estado da sidebar junto dos outros seletores (perto de `activeCwd`, ~linha 69):
```ts
  const sidebarCollapsed = useCanvasStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useCanvasStore((s) => s.toggleSidebar)
```

3. Substituir o bloco `<Topbar … />` (~linha 220-232) por:
```tsx
      <Topbar
        cwd={activeCwd}
        collapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        onNewProject={emitNewProject}
        onSelectMode={() => {}}
        onNewTerminal={() => setNewTermOpen(true)}
        onNote={() => addNoteNode()}
        onFiles={() => addFileTreeNode()}
        onPortal={() => addPortalNode()}
        onOpenIde={() => {
          if (activeCwd) void window.orkestra.ide.open(activeCwd)
        }}
      />
```

- [ ] **Step 4: Ouvir o evento na `ProjectsSidebar`**

Em `ProjectsSidebar.tsx`:

1. Import ao topo:
```ts
import { NEW_PROJECT_EVENT } from '../ui/appEvents'
```

2. Adicionar um `useEffect` (após o `useEffect` de `void refresh()`, ~linha 97). `handleCreate` é uma closure recriada a cada render, então o listener é religado por render — barato e sempre aponta para a versão atual:
```ts
  // Onda 1 (F01): o "+" da Topbar (irmã, dentro do Canvas) pede a criação de um projeto por aqui,
  // reusando exatamente o fluxo de handleCreate (pickDirectory → create → switch). Window-event no
  // mesmo estilo dos atalhos globais do Canvas.
  useEffect(() => {
    const onNew = (): void => void handleCreate()
    window.addEventListener(NEW_PROJECT_EVENT, onNew)
    return () => window.removeEventListener(NEW_PROJECT_EVENT, onNew)
  })
```

- [ ] **Step 5: Typecheck + lint + testes**

Run: `npm run typecheck && npm run lint && npm test`
Expected: sem erros; toda a suíte PASS.

- [ ] **Step 6: Checkpoint visual (comparar com `docs/images/1.png`)**

Run: `npm run dev`
Verificar:
- Barra em 3 grupos: esquerda (`+`, painel, nome do workspace), centro (cursor destacado, terminal, nota, clip apagado, pasta, globo, `Aa` apagado, desenhar apagado), direita (`{}` apagado, `</>`, share apagado).
- `+` abre o seletor de pasta e cria um projeto (a sidebar atualiza e troca para ele).
- O botão de painel oculta/exibe a sidebar (mesmo efeito do `«/»`).
- `</>` abre a pasta no editor; fica apagado sem pasta vinculada.
- Terminal/nota/pasta/site criam seus nós.
- Ajustar os `path` dos SVGs, se necessário, para casar com a imagem.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/ui/appEvents.ts src/renderer/src/ui/appEvents.test.ts src/renderer/src/components/Canvas.tsx src/renderer/src/components/ProjectsSidebar.tsx
git commit -m "feat(topbar): liga acoes no Canvas + novo projeto via CustomEvent (F01)"
```

---

## Self-Review

**Spec coverage (Onda 1 do spec):**
- Grupo esquerda (`+`, painel, My Workspace) → Tasks 4/5 (`+` via evento, painel via store, workspace via `basename`). ✓
- Grupo centro (cursor, terminal, nota, clip, pasta, globo, Aa, desenhar) → Task 4 (funcionais os que existem; clip/Aa/desenhar desabilitados até ondas 7). ✓
- Grupo direita (`{}`, `</>`▾, share) → Task 4 (`</>` abre editor; `{}`/share desabilitados; o **dropdown ▾ de escolha de editor** fica fora desta onda — depende de estender `ide.open` no main; anotado como refinamento). ✓ (parcial consciente)
- Toggle de sidebar (colapsar `ProjectsSidebar`) → Tasks 1/2/5. ✓
- `sidebarCollapsed` elevado a fonte única → Task 1. ✓

**Gaps assumidos de propósito (documentados no spec como escopo/ondas futuras):** ação real de clip (Onda 7), Aa/texto (onda de nós), desenho (Onda 7), dropdown de editor e `{}`/share (fora de escopo v1).

**Placeholder scan:** nenhum "TODO/TBD" no código; os botões "em breve" são estado `disabled` real e testável visualmente, não placeholder de plano.

**Type consistency:** `basename` (paths.ts) usado igual na Topbar e na sidebar; assinatura da `Topbar` na Task 4 casa exatamente com o uso no `Canvas` na Task 5; `sidebarCollapsed`/`toggleSidebar`/`setSidebarCollapsed` idênticos entre store (Task 1), sidebar (Task 2) e Canvas (Task 5); `NEW_PROJECT_EVENT`/`emitNewProject` idênticos entre emissor (Canvas) e ouvinte (sidebar).

**Nota de ordem:** as Tasks 4 e 5 deixam o typecheck vermelho entre uma e outra (a `Topbar` muda de assinatura na 4 e o `Canvas` só se ajusta na 5). Executá-las em sequência antes do checkpoint mantém a árvore compilável; os commits intermediários são aceitáveis (branch de feature).
