import { describe, it, expect } from 'vitest'
import { decideVisibility } from './nodeVisibility'

describe('decideVisibility (histerese)', () => {
  it('entrar na viewport mostra imediatamente (e cancela hide pendente)', () => {
    expect(decideVisibility(true, false)).toBe('show')
    expect(decideVisibility(true, true)).toBe('show')
  })
  it('sair da viewport arma a suspensão só se ainda não estiver agendada', () => {
    expect(decideVisibility(false, false)).toBe('arm-hide')
    expect(decideVisibility(false, true)).toBe('noop')
  })
})
