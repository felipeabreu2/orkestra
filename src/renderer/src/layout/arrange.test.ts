import { describe, it, expect } from 'vitest'
import { alignNodes, distributeNodes, gridArrange } from './arrange'

const N = (id: string, x: number, y: number, w = 100, h = 100): {
  id: string
  position: { x: number; y: number }
  width: number
  height: number
} => ({ id, position: { x, y }, width: w, height: h })

describe('alignNodes', () => {
  it("'left' alinha todos ao menor x", () => {
    const r = alignNodes([N('a', 10, 0), N('b', 50, 0), N('c', 30, 0)], 'left')
    expect(r.a.x).toBe(10)
    expect(r.b.x).toBe(10)
    expect(r.c.x).toBe(10)
  })

  it("'right' alinha as bordas direitas (x + width) ao maior valor", () => {
    const r = alignNodes([N('a', 0, 0, 100), N('b', 0, 0, 50)], 'right')
    expect(r.a.x + 100).toBe(r.b.x + 50)
    expect(r.a.x + 100).toBe(100) // maior borda direita da seleção
  })

  it("'hcenter' alinha os centros horizontais", () => {
    const r = alignNodes([N('a', 0, 0, 100), N('b', 0, 0, 50)], 'hcenter')
    // centros iguais: a.center = 50, b deve mover p/ center 50 => x = 25
    expect(r.a.x + 50).toBe(r.b.x + 25)
  })

  it("'top' alinha todos ao menor y", () => {
    const r = alignNodes([N('a', 0, 10), N('b', 0, 50), N('c', 0, 30)], 'top')
    expect(r.a.y).toBe(10)
    expect(r.b.y).toBe(10)
    expect(r.c.y).toBe(10)
  })

  it("'bottom' alinha as bordas inferiores (y + height) ao maior valor", () => {
    const r = alignNodes([N('a', 0, 0, 100, 100), N('b', 0, 0, 100, 40)], 'bottom')
    expect(r.a.y + 100).toBe(r.b.y + 40)
    expect(r.a.y + 100).toBe(100)
  })

  it("'vcenter' alinha os centros verticais", () => {
    const r = alignNodes([N('a', 0, 0, 100, 100), N('b', 0, 0, 100, 50)], 'vcenter')
    expect(r.a.y + 50).toBe(r.b.y + 25)
  })

  it('preserva a coordenada do outro eixo (align horizontal não mexe em y)', () => {
    const r = alignNodes([N('a', 10, 7), N('b', 50, 42)], 'left')
    expect(r.a.y).toBe(7)
    expect(r.b.y).toBe(42)
  })

  it('nós sem width/height não quebram (tratados como 0)', () => {
    const r = alignNodes(
      [
        { id: 'a', position: { x: 0, y: 0 } },
        { id: 'b', position: { x: 20, y: 0 } }
      ],
      'right'
    )
    expect(r.a.x).toBe(20)
    expect(r.b.x).toBe(20)
  })

  it('lista vazia devolve objeto vazio sem lançar', () => {
    expect(alignNodes([], 'left')).toEqual({})
  })
})

describe('distributeNodes', () => {
  it('espaça igualmente na horizontal (extremos fixos)', () => {
    const r = distributeNodes([N('a', 0, 0, 10), N('b', 5, 0, 10), N('c', 100, 0, 10)], 'horizontal')
    expect(r.a.x).toBe(0)
    expect(r.c.x).toBe(100) // extremos não movem
    expect(r.b.x).toBeGreaterThan(0)
    expect(r.b.x).toBeLessThan(100)
  })

  it('espaça igualmente na vertical (extremos fixos)', () => {
    const r = distributeNodes([N('a', 0, 0, 10, 10), N('b', 0, 5, 10, 10), N('c', 0, 100, 10, 10)], 'vertical')
    expect(r.a.y).toBe(0)
    expect(r.c.y).toBe(100)
    expect(r.b.y).toBeGreaterThan(0)
    expect(r.b.y).toBeLessThan(100)
  })

  it('não mexe na coordenada do outro eixo', () => {
    const r = distributeNodes([N('a', 0, 3, 10), N('b', 5, 7, 10), N('c', 100, 9, 10)], 'horizontal')
    expect(r.a.y).toBe(3)
    expect(r.b.y).toBe(7)
    expect(r.c.y).toBe(9)
  })

  it('com 2 nós, ambos são extremos e ficam parados', () => {
    const r = distributeNodes([N('a', 0, 0, 10), N('b', 100, 0, 10)], 'horizontal')
    expect(r.a.x).toBe(0)
    expect(r.b.x).toBe(100)
  })

  it('com 0 ou 1 nó, devolve sem lançar', () => {
    expect(distributeNodes([], 'horizontal')).toEqual({})
    const r = distributeNodes([N('a', 5, 5, 10)], 'horizontal')
    expect(r.a).toEqual({ x: 5, y: 5 })
  })
})

describe('gridArrange', () => {
  it('coloca N nós numa grade sem sobrepor', () => {
    const r = gridArrange([N('a', 0, 0), N('b', 0, 0), N('c', 0, 0), N('d', 0, 0)])
    const pts = Object.values(r)
    expect(new Set(pts.map((p) => `${p.x},${p.y}`)).size).toBe(4) // 4 posições distintas
  })

  it('usa ceil(sqrt(n)) colunas (4 nós -> 2 colunas -> 2 linhas)', () => {
    const r = gridArrange([N('a', 0, 0, 100, 100), N('b', 0, 0, 100, 100), N('c', 0, 0, 100, 100), N('d', 0, 0, 100, 100)], {
      gap: 20
    })
    expect(r.a).toEqual({ x: 0, y: 0 })
    expect(r.b).toEqual({ x: 120, y: 0 }) // step = width(100) + gap(20)
    expect(r.c).toEqual({ x: 0, y: 120 })
    expect(r.d).toEqual({ x: 120, y: 120 })
  })

  it('ancora no menor x/y da seleção', () => {
    const r = gridArrange([N('a', 40, 60, 100, 100), N('b', 40, 60, 100, 100)], { gap: 10 })
    expect(r.a).toEqual({ x: 40, y: 60 })
    expect(r.b).toEqual({ x: 150, y: 60 })
  })

  it('lista vazia devolve objeto vazio sem lançar', () => {
    expect(gridArrange([])).toEqual({})
  })

  it('nó único devolve uma única posição no anchor', () => {
    const r = gridArrange([N('a', 5, 5)])
    expect(r.a).toEqual({ x: 5, y: 5 })
  })
})
