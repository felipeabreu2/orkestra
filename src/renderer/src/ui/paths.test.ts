import { describe, it, expect } from 'vitest'
import { basename } from './paths'

describe('basename', () => {
  it('extrai o último segmento POSIX', () => {
    expect(basename('/Users/felipe/projeto')).toBe('projeto')
  })
  it('ignora barra final', () => {
    expect(basename('/a/b/')).toBe('b')
  })
  it('funciona com caminho Windows', () => {
    expect(basename('C:\\dev\\orkestra')).toBe('orkestra')
  })
  it('devolve o próprio valor quando não há separador', () => {
    expect(basename('solto')).toBe('solto')
  })
})
