// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { resolveInitialEdgeStyle, nextEdgeStyle, loadEdgeStyle, saveEdgeStyle, resolveEdgeStyle } from './edgeStyle'

describe('edgeStyle', () => {
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      /* jsdom sempre tem localStorage; guard por precaução */
    }
  })

  it('resolve o valor inicial: valores válidos passam, senão o padrão "corda"', () => {
    expect(resolveInitialEdgeStyle('circuito')).toBe('circuito')
    expect(resolveInitialEdgeStyle('curva')).toBe('curva')
    expect(resolveInitialEdgeStyle('corda')).toBe('corda')
    expect(resolveInitialEdgeStyle(null)).toBe('corda')
    expect(resolveInitialEdgeStyle('lixo')).toBe('corda')
  })

  it('nextEdgeStyle cicla curva → circuito → corda → curva', () => {
    expect(nextEdgeStyle('curva')).toBe('circuito')
    expect(nextEdgeStyle('circuito')).toBe('corda')
    expect(nextEdgeStyle('corda')).toBe('curva')
  })

  it('save persiste e load lê de volta (default corda sem nada salvo)', () => {
    expect(loadEdgeStyle()).toBe('corda') // default sem nada salvo
    saveEdgeStyle('circuito')
    expect(loadEdgeStyle()).toBe('circuito')
    saveEdgeStyle('corda')
    expect(loadEdgeStyle()).toBe('corda')
  })

  describe('resolveEdgeStyle (override por aresta)', () => {
    it('data.style válido sobrepõe o global', () => {
      expect(resolveEdgeStyle('circuito', 'corda')).toBe('circuito')
      expect(resolveEdgeStyle('corda', 'curva')).toBe('corda')
      expect(resolveEdgeStyle('curva', 'circuito')).toBe('curva')
    })

    it('sem data.style cai no global', () => {
      expect(resolveEdgeStyle(undefined, 'corda')).toBe('corda')
      expect(resolveEdgeStyle(null, 'circuito')).toBe('circuito')
    })

    it('data.style inválido cai no global (data vem de snapshot em disco)', () => {
      expect(resolveEdgeStyle('lixo', 'corda')).toBe('corda')
      expect(resolveEdgeStyle(42, 'curva')).toBe('curva')
      expect(resolveEdgeStyle({}, 'circuito')).toBe('circuito')
      expect(resolveEdgeStyle('', 'corda')).toBe('corda')
    })
  })
})
