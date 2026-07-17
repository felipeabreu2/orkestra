import { describe, it, expect } from 'vitest'
import type { Node } from '@xyflow/react'
import { dissolveThinGroups } from './groups'

// Canvas #12 · T3 — auto-dissolver grupo com <2 membros. Helper puro (ambiente node, como
// arrange.test.ts): para cada nó type:'group' com menos de `threshold` filhos, reescreve os
// filhos para o topo-nível (posição absoluta = filho.position + group.position; remove
// parentId/extent) e descarta o nó group. Idempotente: devolve a MESMA referência quando não há
// nada a dissolver (evita re-render à toa no store, como os outros no-ops).

const group = (id: string, x: number, y: number): Node => ({
  id,
  type: 'group',
  position: { x, y },
  data: {}
})

const child = (id: string, parentId: string, x: number, y: number): Node => ({
  id,
  type: 'note',
  position: { x, y },
  parentId,
  extent: 'parent',
  data: {}
})

const plain = (id: string, x: number, y: number): Node => ({
  id,
  type: 'note',
  position: { x, y },
  data: {}
})

describe('dissolveThinGroups', () => {
  it('grupo com 1 filho: remove o group e absolutiza o filho (sem parentId/extent)', () => {
    const nodes = [group('g', 100, 100), child('c', 'g', 10, 20)]
    const r = dissolveThinGroups(nodes)
    expect(r.find((n) => n.id === 'g')).toBeUndefined()
    const c = r.find((n) => n.id === 'c')!
    expect(c.position).toEqual({ x: 110, y: 120 })
    expect(c.parentId).toBeUndefined()
    expect(c.extent).toBeUndefined()
  })

  it('grupo com 2 filhos (>= threshold) fica inalterado — MESMA referência', () => {
    const nodes = [group('g', 0, 0), child('a', 'g', 0, 0), child('b', 'g', 10, 10)]
    const r = dissolveThinGroups(nodes)
    expect(r).toBe(nodes)
  })

  it('grupo esvaziado (0 filhos) é removido', () => {
    const nodes = [group('g', 5, 5)]
    const r = dissolveThinGroups(nodes)
    expect(r.find((n) => n.id === 'g')).toBeUndefined()
    expect(r).toHaveLength(0)
  })

  it('sem grupos devolve o array como veio (MESMA referência)', () => {
    const nodes = [plain('a', 0, 0), plain('b', 50, 50)]
    expect(dissolveThinGroups(nodes)).toBe(nodes)
  })

  it('threshold customizado: com threshold=3, grupo de 2 filhos dissolve', () => {
    const nodes = [group('g', 0, 0), child('a', 'g', 1, 1), child('b', 'g', 2, 2)]
    const r = dissolveThinGroups(nodes, 3)
    expect(r.find((n) => n.id === 'g')).toBeUndefined()
    expect(r.filter((n) => n.parentId).length).toBe(0)
  })
})
