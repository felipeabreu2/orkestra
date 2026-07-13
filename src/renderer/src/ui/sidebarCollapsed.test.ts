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
