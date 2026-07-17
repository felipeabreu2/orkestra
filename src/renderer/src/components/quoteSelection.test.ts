import { describe, it, expect } from 'vitest'
import { resolveConnectedTerminal, selectionLineRange, quoteLabel } from './quoteSelection'

describe('resolveConnectedTerminal', () => {
  const T = (ids: string[]): Set<string> => new Set(ids)

  it('resolve o terminal do outro lado quando a árvore é o SOURCE da aresta', () => {
    expect(
      resolveConnectedTerminal('ft1', [{ source: 'ft1', target: 'term9' }], T(['term9']))
    ).toBe('term9')
  })

  it('resolve independente da direção (árvore como TARGET)', () => {
    expect(
      resolveConnectedTerminal('ft1', [{ source: 'term9', target: 'ft1' }], T(['term9']))
    ).toBe('term9')
  })

  it('sem aresta → undefined', () => {
    expect(resolveConnectedTerminal('ft1', [], T(['term9']))).toBeUndefined()
  })

  it('ignora vizinho que NÃO é terminal (ex.: nota) → undefined', () => {
    expect(
      resolveConnectedTerminal('ft1', [{ source: 'ft1', target: 'note2' }], T(['term9']))
    ).toBeUndefined()
  })

  it('com vários vizinhos, devolve o PRIMEIRO terminal na ordem das arestas', () => {
    const edges = [
      { source: 'ft1', target: 'note2' },
      { source: 'ft1', target: 'termA' },
      { source: 'ft1', target: 'termB' }
    ]
    expect(resolveConnectedTerminal('ft1', edges, T(['termA', 'termB']))).toBe('termA')
  })

  it('ignora auto-loop (aresta do nó para ele mesmo)', () => {
    expect(
      resolveConnectedTerminal('ft1', [{ source: 'ft1', target: 'ft1' }], T(['ft1']))
    ).toBeUndefined()
  })
})

describe('selectionLineRange', () => {
  it('seleção numa única linha → mesma linha nos dois extremos', () => {
    expect(selectionLineRange('const x = 1', 0, 5)).toEqual({ startLine: 1, endLine: 1 })
  })

  it('seleção multi-linha conta as quebras', () => {
    // 'a\nb\nc' → índices: a=0, \n=1, b=2, \n=3, c=4. Selecionar 'b\nc' = [2,5).
    expect(selectionLineRange('a\nb\nc', 2, 5)).toEqual({ startLine: 2, endLine: 3 })
  })

  it('seleção que termina logo APÓS um \\n não conta a linha vazia seguinte', () => {
    // 'a\nb\n' → selecionar 'a\n' = [0,2): fim exclusivo, endLine permanece 1.
    expect(selectionLineRange('a\nb\n', 0, 2)).toEqual({ startLine: 1, endLine: 1 })
  })

  it('offsets fora do intervalo são grampeados; end<start vira seleção pontual', () => {
    expect(selectionLineRange('a\nb', 99, 100)).toEqual({ startLine: 2, endLine: 2 })
    expect(selectionLineRange('a\nb', 2, 0)).toEqual({ startLine: 2, endLine: 2 })
  })
})

describe('quoteLabel', () => {
  it('multi-linha → arquivo:L<a>-<b> (basename do path)', () => {
    expect(quoteLabel('/x/a.ts', { startLine: 12, endLine: 20 })).toBe('a.ts:L12-20')
  })

  it('linha única → arquivo:L<n>', () => {
    expect(quoteLabel('/x/y/a.ts', { startLine: 5, endLine: 5 })).toBe('a.ts:L5')
  })
})
