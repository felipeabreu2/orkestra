// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { resolveInitialEdgeStyle, nextEdgeStyle, loadEdgeStyle, saveEdgeStyle } from './edgeStyle'

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
})
