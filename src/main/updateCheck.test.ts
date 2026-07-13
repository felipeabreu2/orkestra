import { describe, it, expect } from 'vitest'
import { isNewerVersion, parseVersion } from './updateCheck'

describe('parseVersion', () => {
  it('extrai major.minor.patch', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
  })
  it('tolera o prefixo v e sufixos de pré-lançamento/build', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('1.2.3-beta.1')).toEqual([1, 2, 3])
    expect(parseVersion('v2.0.0+build.7')).toEqual([2, 0, 0])
  })
  it('completa componentes ausentes com 0', () => {
    expect(parseVersion('1.1')).toEqual([1, 1, 0])
    expect(parseVersion('2')).toEqual([2, 0, 0])
    expect(parseVersion('lixo')).toEqual([0, 0, 0])
  })
})

describe('isNewerVersion', () => {
  it('detecta versão remota maior em qualquer componente', () => {
    expect(isNewerVersion('1.0.0', '2.0.0')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.1.0')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(true)
    expect(isNewerVersion('1.9.9', '2.0.0')).toBe(true)
  })
  it('retorna false para versão igual ou mais antiga', () => {
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.1.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(false)
  })
  it('ignora o prefixo v dos dois lados', () => {
    expect(isNewerVersion('1.0.0', 'v1.1.0')).toBe(true)
    expect(isNewerVersion('v1.0.0', 'v1.0.0')).toBe(false)
  })
})
