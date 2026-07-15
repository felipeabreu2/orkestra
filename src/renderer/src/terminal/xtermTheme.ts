import type { ITheme } from '@xterm/xterm'

// Reformulação DesignCode UI (Lote D, Task 4 — crítico): o xterm NÃO conhece CSS custom
// properties — sem um `theme` explícito ele cai no preto/branco padrão embutido na lib, que
// ignora completamente o tema (claro/escuro) do app. `xtermThemeFromTokens` é a ponte: lê os
// tokens ATUAIS do `<html>` via `getComputedStyle` e devolve o objeto `ITheme` do xterm — chamado
// uma vez na criação do terminal (TerminalNode.tsx) e de novo a cada flip de `data-theme`
// (MutationObserver), sem recriar o `Terminal` (preserva pty/scrollback/foco).
//
// `root` é parametrizável (default `document.documentElement`) só para testabilidade — em
// produção é sempre chamado sem argumento.
const v = (s: CSSStyleDeclaration, k: string): string => s.getPropertyValue(k).trim()

export function xtermThemeFromTokens(root: HTMLElement = document.documentElement): ITheme {
  const s = getComputedStyle(root)
  return {
    background: v(s, '--term-bg'),
    foreground: v(s, '--term-fg'),
    cursor: v(s, '--accent'),
    cursorAccent: v(s, '--term-bg'),
    selectionBackground: v(s, '--accent-weak'),
    // Paleta ANSI (16 cores): mapeada dos tokens semânticos existentes — sem paleta ANSI própria
    // na spec de design, os estados (ok/warn/err) e os tons "paper-*" (já usados nas tags de
    // papel dos nós) cobrem o conjunto sem introduzir cor nova/hex cru. `black`/`brightBlack` não
    // têm token semântico dedicado; usam `--term-bg`/`--text-3` (fundo do terminal / texto
    // apagado), ambos tema-aware.
    black: v(s, '--term-bg'),
    red: v(s, '--err'),
    green: v(s, '--ok'),
    yellow: v(s, '--warn'),
    blue: v(s, '--accent'),
    magenta: v(s, '--paper-purple'),
    cyan: v(s, '--paper-cyan'),
    white: v(s, '--text-2'),
    brightBlack: v(s, '--text-3'),
    brightRed: v(s, '--err'),
    brightGreen: v(s, '--ok'),
    brightYellow: v(s, '--warn'),
    brightBlue: v(s, '--accent-hover'),
    brightMagenta: v(s, '--paper-purple'),
    brightCyan: v(s, '--paper-cyan'),
    brightWhite: v(s, '--text-1')
  }
}
