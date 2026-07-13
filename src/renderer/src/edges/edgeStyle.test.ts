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

  it('resolve o valor inicial: "circuito" só quando salvo assim, senão "curva"', () => {
    expect(resolveInitialEdgeStyle('circuito')).toBe('circuito')
    expect(resolveInitialEdgeStyle('curva')).toBe('curva')
    expect(resolveInitialEdgeStyle(null)).toBe('curva')
    expect(resolveInitialEdgeStyle('lixo')).toBe('curva')
  })

  it('nextEdgeStyle alterna entre curva e circuito', () => {
    expect(nextEdgeStyle('curva')).toBe('circuito')
    expect(nextEdgeStyle('circuito')).toBe('curva')
  })

  it('save persiste e load lê de volta', () => {
    expect(loadEdgeStyle()).toBe('curva') // default sem nada salvo
    saveEdgeStyle('circuito')
    expect(loadEdgeStyle()).toBe('circuito')
    saveEdgeStyle('curva')
    expect(loadEdgeStyle()).toBe('curva')
  })
})
