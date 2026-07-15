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
