import { describe, it, expect } from 'vitest'
import { formatListLine } from './list'

describe('formatListLine', () => {
  it('inclui o papel como 4ª coluna quando presente', () => {
    expect(formatListLine({ type: 'terminal', name: 'Dev', id: 't1', role: 'dev' })).toBe('terminal\tDev\tt1\tdev')
  })

  it('omite o papel quando ausente (as 3 colunas de sempre)', () => {
    expect(formatListLine({ type: 'note', name: 'Spec', id: 'n1' })).toBe('note\tSpec\tn1')
  })

  it('omite o papel quando vazio ou só espaços (o espelho traz role: "" para nós sem papel)', () => {
    expect(formatListLine({ type: 'terminal', name: 'Dev', id: 't1', role: '' })).toBe('terminal\tDev\tt1')
    expect(formatListLine({ type: 'terminal', name: 'Dev', id: 't1', role: '   ' })).toBe('terminal\tDev\tt1')
  })
})
