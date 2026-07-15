// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { xtermThemeFromTokens } from './xtermTheme'

// Reformulação DesignCode UI (Lote D, Task 4): o xterm não conhece CSS custom properties — ele
// precisa de um objeto `theme` com cores literais no construtor/`options`. `xtermThemeFromTokens`
// é a ponte: lê os tokens ATUAIS do `<html>` (via getComputedStyle) e devolve o shape `ITheme`.
// Mockar `getComputedStyle` (em vez de escrever tokens.css de verdade num <style> jsdom) mantém o
// teste isolado do arquivo de tokens — ele testa o MAPEAMENTO token->campo do ITheme, não os
// valores da spec (isso é responsabilidade de tokens.test.ts).
describe('xtermThemeFromTokens', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockTokens(map: Record<string, string>): void {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (k: string) => map[k] ?? ''
    } as CSSStyleDeclaration)
  }

  it('deriva background/foreground/cursor/selectionBackground dos tokens', () => {
    mockTokens({
      '--term-bg': ' #0B0C11',
      '--term-fg': ' #C3CBD9',
      '--accent': ' #3395FF',
      '--accent-weak': ' rgba(51,149,255,.18)'
    })
    const t = xtermThemeFromTokens()
    expect(t.background).toBe('#0B0C11')
    expect(t.foreground).toBe('#C3CBD9')
    expect(t.cursor).toBe('#3395FF')
    expect(t.cursorAccent).toBe('#0B0C11')
    expect(t.selectionBackground).toBe('rgba(51,149,255,.18)')
  })

  it('deriva a paleta ANSI dos tokens semânticos (ok/warn/err/paper-*/text-*)', () => {
    mockTokens({
      '--err': '#FF453A',
      '--ok': '#34C759',
      '--warn': '#FF9500',
      '--accent': '#3395FF',
      '--paper-purple': '#BF5AF2',
      '--paper-cyan': '#64D2FF',
      '--text-2': 'rgba(244,246,250,.62)',
      '--text-3': 'rgba(244,246,250,.40)',
      '--text-1': '#F4F6FA'
    })
    const t = xtermThemeFromTokens()
    expect(t.red).toBe('#FF453A')
    expect(t.green).toBe('#34C759')
    expect(t.yellow).toBe('#FF9500')
    expect(t.blue).toBe('#3395FF')
    expect(t.magenta).toBe('#BF5AF2')
    expect(t.cyan).toBe('#64D2FF')
    expect(t.white).toBe('rgba(244,246,250,.62)')
    expect(t.brightBlack).toBe('rgba(244,246,250,.40)')
    expect(t.brightWhite).toBe('#F4F6FA')
  })

  it('lê o <html> por padrão, mas aceita uma raiz explícita (ex.: testes/porções isoladas)', () => {
    mockTokens({ '--term-bg': '#111111' })
    const fakeRoot = document.createElement('div')
    xtermThemeFromTokens(fakeRoot)
    expect(window.getComputedStyle).toHaveBeenCalledWith(fakeRoot)
  })

  it('não recebendo raiz, lê document.documentElement', () => {
    mockTokens({ '--term-bg': '#111111' })
    xtermThemeFromTokens()
    expect(window.getComputedStyle).toHaveBeenCalledWith(document.documentElement)
  })
})
