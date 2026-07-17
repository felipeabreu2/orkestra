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
  // Realce de sintaxe do editor (CodeMirror): o cmTheme consome só var(--syn-*), então cada um
  // PRECISA existir nos dois temas — se só existisse no escuro, o claro herdaria a cor do escuro
  // (ex.: comentário #6C7986 no branco) sem erro nenhum em runtime. Este teste é o guarda.
  it('define a paleta de sintaxe (--syn-*) nos DOIS temas', () => {
    // corta no SELETOR do tema claro (início de linha) — o header do arquivo cita
    // ":root[data-theme='light']" em comentário, e um indexOf ingênuo casaria com ele.
    const corte = css.search(/^:root\[data-theme='light'\]/m)
    expect(corte).toBeGreaterThan(0)
    const escuro = css.slice(0, corte)
    const claro = css.slice(corte)
    for (const t of ['--syn-keyword', '--syn-string', '--syn-number', '--syn-comment', '--syn-type',
      '--syn-function', '--syn-meta', '--syn-link']) {
      expect(escuro).toContain(`${t}:`)
      expect(claro).toContain(`${t}:`)
    }
  })
})
