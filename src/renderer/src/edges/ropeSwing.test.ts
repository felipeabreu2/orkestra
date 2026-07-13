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
