import { describe, it, expect } from 'vitest'
import { planSquad } from './squad'

describe('planSquad', () => {
  it('monta 4 recrutas (Dev/Revisor/Testador/Docs) + 4 conexões à nota-spec', () => {
    const ops = planSquad({ preset: 'claude', spec: 'Spec' })
    const recruits = ops.filter((o) => o.op === 'recruit')
    const connects = ops.filter((o) => o.op === 'connect')
    expect(recruits).toHaveLength(4)
    expect(connects).toHaveLength(4)
    expect(recruits.map((o) => (o.op === 'recruit' ? o.name : ''))).toEqual([
      'Dev',
      'Revisor',
      'Testador',
      'Docs'
    ])
    expect(recruits.every((o) => o.op === 'recruit' && o.preset === 'claude')).toBe(true)
    expect(connects.every((o) => o.op === 'connect' && o.target === 'Spec')).toBe(true)
  })

  it('recruta ANTES de conectar (o alvo precisa existir antes da aresta)', () => {
    const ops = planSquad({ preset: 'claude', spec: 'Spec' })
    expect(ops.slice(0, 4).every((o) => o.op === 'recruit')).toBe(true)
    expect(ops.slice(4).every((o) => o.op === 'connect')).toBe(true)
  })

  it('herda o preset pedido em todos os recrutas', () => {
    const ops = planSquad({ preset: 'codex', spec: 'Plano' })
    expect(ops.filter((o) => o.op === 'recruit').every((o) => o.op === 'recruit' && o.preset === 'codex')).toBe(true)
    expect(ops.filter((o) => o.op === 'connect').every((o) => o.op === 'connect' && o.target === 'Plano')).toBe(true)
  })
})
