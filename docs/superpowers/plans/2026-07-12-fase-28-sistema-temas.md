# Orkestra — Fase 28 (Sistema de Temas Claro/Escuro) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** O app ganha **tema claro além do escuro atual**, alternável por um botão. O tema escuro continua o padrão; escolher claro deixa todo o app claro (canvas, nós, painéis, modais) — porque tudo consome os tokens de `var(--…)`, basta trocar os valores dos tokens via `data-theme` no `<html>`. A escolha persiste entre sessões.

**Architecture:** `tokens.css` passa a ter os valores escuros em `:root` (padrão, inalterado) e uma sobrecarga clara em `:root[data-theme='light']` — só as cores/sombras mudam; forma/tipografia/motion herdam. Um módulo `src/renderer/src/theme.ts` resolve/aplica/persiste o tema (`data-theme` no `document.documentElement` + `localStorage`). O `main.tsx` aplica o tema salvo **antes** de renderizar (sem flash). Um `ThemeToggle` (botão sol/lua) na sidebar alterna e persiste.

**Tech Stack:** CSS custom properties + `data-theme` attribute (padrão web de theming). Vitest (a lógica de resolução do tema é pura).

## Global Constraints

- **Sem regressão ao tema escuro:** os valores atuais de `:root` ficam idênticos (é o padrão quando `data-theme` ausente ou `='dark'`). Nenhum componente muda de cor no escuro.
- **Todos os componentes já usam `var(--token)`** — nenhum hardcode de cor novo. A paleta clara deve ter contraste AA razoável (texto sobre fundo, texto sobre `--accent`).
- **zustand v5:** o toggle não adiciona seletor derivado (usa estado local + `theme.ts`). Renderer não importa `fs`/`http`/`node-pty`/`child_process`.
- Zero regressão a canvas/nós/palette/projetos. PT-BR, sem marcas de terceiros.

---

### Task 1: `theme.ts` puro + tokens claros + aplicar no boot — TDD

**Files:**
- Create: `src/renderer/src/theme.ts` (+ `.test.ts`)
- Modify: `src/renderer/src/styles/tokens.css`, `src/renderer/src/main.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type Theme = 'dark' | 'light'
  export function resolveInitialTheme(stored: string | null): Theme
  export function nextTheme(current: Theme): Theme
  export function applyTheme(theme: Theme): void          // seta document.documentElement.dataset.theme
  export function loadTheme(): Theme                       // lê localStorage, aplica, retorna
  export function saveTheme(theme: Theme): void            // aplica + persiste
  ```

- [ ] **Step 1: Testes das funções puras (falham primeiro)**

`src/renderer/src/theme.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveInitialTheme, nextTheme } from './theme'

describe('resolveInitialTheme', () => {
  it('padrão é dark quando não há preferência salva', () => {
    expect(resolveInitialTheme(null)).toBe('dark')
    expect(resolveInitialTheme('')).toBe('dark')
    expect(resolveInitialTheme('qualquer-coisa')).toBe('dark')
  })
  it('respeita light salvo', () => {
    expect(resolveInitialTheme('light')).toBe('light')
  })
  it('dark salvo é dark', () => {
    expect(resolveInitialTheme('dark')).toBe('dark')
  })
})

describe('nextTheme', () => {
  it('alterna entre dark e light', () => {
    expect(nextTheme('dark')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
  })
})
```

- [ ] **Step 2: Rodar → falha** (`npm test -- theme`).

- [ ] **Step 3: Implementar `theme.ts`**
```ts
export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'orkestra-theme'

export function resolveInitialTheme(stored: string | null): Theme {
  return stored === 'light' ? 'light' : 'dark'
}

export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
  }
}

export function loadTheme(): Theme {
  let stored: string | null = null
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  } catch {
    stored = null
  }
  const theme = resolveInitialTheme(stored)
  applyTheme(theme)
  return theme
}

export function saveTheme(theme: Theme): void {
  applyTheme(theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore (localStorage indisponível) */
  }
}
```

- [ ] **Step 4: Rodar → verde** + `npm run typecheck`.

- [ ] **Step 5: Tokens claros em `tokens.css`** — manter o bloco `:root` atual INTACTO (é o dark padrão). Atualizar só o comentário do topo (agora há um seletor `[data-theme='light']`) e ADICIONAR, ao final do arquivo (antes ou depois do `@media prefers-reduced-motion`), a sobrecarga clara:
```css
/* Tema claro (Fase 28): sobrecarga aplicada quando <html data-theme="light">. Só cor/sombra
   mudam — forma/tipografia/motion herdam do :root. Contraste AA verificado nos pares
   texto/fundo e texto-branco/--accent. */
:root[data-theme='light'] {
  --bg-0: #e9ebf0; /* canvas cinza-claro */
  --bg-1: #ffffff; /* painéis/nós/modais */
  --bg-2: #eef0f4; /* elevação/hover */
  --bg-2-weak: #1a1e2710;
  --border: #e2e5ec;
  --border-strong: #cbd1db;
  --text-1: #14171f;
  --text-2: #545e74;
  --text-3: #949cae;
  --accent: #6b5cf5; /* roxo do app, levemente mais escuro p/ contraste com texto branco */
  --accent-weak: #6b5cf518;
  --accent-text: #ffffff; /* branco sobre --accent sólido (~4.6:1 AA) */
  --ok: #1f9d63;
  --warn: #b77e1e;
  --err: #cf4b48;
  --shadow-1: 0 1px 2px #0000000f, 0 2px 8px #0000000a;
  --shadow-2: 0 10px 30px #00000022;
}
```

- [ ] **Step 6: Aplicar no boot** — em `src/renderer/src/main.tsx`, importar e chamar `loadTheme()` ANTES do `createRoot(...).render(...)` (aplica o `data-theme` cedo, sem flash):
```ts
import './styles/tokens.css'
import './styles/base.css'
import './styles/motion.css'
import './styles/scrollbars.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { loadTheme } from './theme'

loadTheme()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 7: Testes + typecheck + build + lint** — `npm test` (verde, +5), `npm run typecheck`, `npm run build`, `npm run lint` — limpos.

- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat: sistema de temas claro/escuro (theme.ts + tokens light + aplicar no boot) (Fase 28)"`

---

### Task 2: `ThemeToggle` na sidebar (+ checkpoint)

**Files:**
- Create: `src/renderer/src/components/ThemeToggle.tsx`
- Modify: `src/renderer/src/components/ProjectsSidebar.tsx`, `src/renderer/src/components/ProjectsSidebar.css` (ou `nodes.css`/onde fizer sentido)

**Interfaces:**
- Consumes: `loadTheme`, `saveTheme`, `nextTheme`, `Theme` de `../theme`.

- [ ] **Step 1: `ThemeToggle.tsx`** — botão que alterna o tema, refletindo o estado atual (☀ no escuro = "ir p/ claro"; 🌙 no claro = "ir p/ escuro"). Estado local inicializado do tema atual:
```tsx
import { useState } from 'react'
import { loadTheme, saveTheme, nextTheme, type Theme } from '../theme'

export function ThemeToggle({ collapsed }: { collapsed?: boolean }): JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const toggle = (): void => {
    const t = nextTheme(theme)
    setTheme(t)
    saveTheme(t)
  }
  const label = theme === 'dark' ? 'Tema claro' : 'Tema escuro'
  return (
    <button
      className="ork-theme-toggle"
      onClick={toggle}
      title={label}
      aria-label={label}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
      {!collapsed && <span className="ork-theme-toggle-label">{label}</span>}
    </button>
  )
}
```
(Se o projeto usa ícones SVG próprios em vez de emoji glifo, seguir esse padrão; `☀`/`☾` são caracteres neutros, sem marca.)

- [ ] **Step 2: Montar no `ProjectsSidebar.tsx`** — READ o arquivo; adicionar `<ThemeToggle collapsed={collapsed} />` no rodapé da sidebar (perto do botão "+ Novo projeto" / do controle de colapsar), tanto no estado expandido quanto no trilho colapsado (passar o `collapsed` real que a sidebar já controla). Importar `ThemeToggle`.

- [ ] **Step 3: CSS** — `.ork-theme-toggle` no padrão dos outros botões da sidebar (usar tokens; ícone + label; hover em `--bg-2`):
```css
.ork-theme-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-2);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.ork-theme-toggle:hover {
  background: var(--bg-2);
  color: var(--text-1);
}
```

- [ ] **Step 4: Testes + typecheck + build + lint** — verdes/limpos.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: botao de alternar tema claro/escuro na sidebar (Fase 28)"`

- [ ] **Step 6: CHECKPOINT VISUAL (humano)** — `npm run dev`. Clicar no botão de tema → o app inteiro alterna claro/escuro (canvas, nós, painéis, palette, modais). Fechar/reabrir → a escolha persiste. No claro, verificar legibilidade (texto, badges, o `--accent` roxo, os estados ok/warn/err) — reportar qualquer cor que precise de ajuste fino.

---

## Notas de risco
- **Ajuste fino da paleta clara:** os valores light são um ponto de partida com contraste razoável; alguns pontos (sombras, `--accent` em badges pequenos, o realce de seleção de edge) podem precisar de ajuste ao ver rodando — é um checkpoint do usuário, e mexer é só trocar valores nos tokens.
- **Componentes com cor hardcoded:** o objetivo é que TUDO use `var(--token)`; se algum componente tiver uma cor crua (ex.: o scrim `rgba(0,0,0,0.5)` do backdrop da palette, ou o glow `rgba(224,161,58,…)` do warn), ele não mudará com o tema. O implementer deve fazer um grep por cores hardcoded nos `.css`/`.tsx` e reportar (não necessariamente corrigir todas nesta fase — listar as que destoam no claro).
- **Persistência via localStorage:** é uma preferência de UI local (não dado de projeto), aceitável no renderer; envolto em try/catch (indisponibilidade não quebra o boot).
- **Sem flash (FOUC):** `loadTheme()` roda antes do render e seta o `data-theme` no `<html>` de imediato; como os tokens já estão no CSS, não há flash de tema errado.
- A base para os próximos passos (modal Novo Terminal, toolbar) — ambos usarão os tokens e funcionarão nos dois temas automaticamente.
