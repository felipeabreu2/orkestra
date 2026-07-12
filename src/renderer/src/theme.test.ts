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
