import { describe, it, expect } from 'vitest'
import { findMatches, type TextSegment } from './findMatches'

describe('findMatches', () => {
  it('acha todas as ocorrências num segmento, com from/to no doc', () => {
    // um nó de texto "foo bar foo" começando na posição 1 do doc
    const segs: TextSegment[] = [{ text: 'foo bar foo', pos: 1 }]
    const m = findMatches(segs, 'foo')
    expect(m).toEqual([
      { from: 1, to: 4 },
      { from: 9, to: 12 }
    ])
  })

  it('é case-insensitive por padrão; respeita caseSensitive quando pedido', () => {
    const segs: TextSegment[] = [{ text: 'Foo foo FOO', pos: 0 }]
    expect(findMatches(segs, 'foo')).toHaveLength(3)
    expect(findMatches(segs, 'foo', true)).toHaveLength(1) // só o 'foo' minúsculo
  })

  it('busca em cada segmento independentemente, somando as posições', () => {
    const segs: TextSegment[] = [
      { text: ' abc ', pos: 5 },
      { text: 'abc', pos: 20 }
    ]
    expect(findMatches(segs, 'abc')).toEqual([
      { from: 6, to: 9 },
      { from: 20, to: 23 }
    ])
  })

  it('termo vazio → nenhum match', () => {
    expect(findMatches([{ text: 'qualquer', pos: 0 }], '')).toEqual([])
  })

  it('ocorrências sobrepostas não são contadas duas vezes (avança pelo comprimento do termo)', () => {
    // "aaaa" com termo "aa" → posições 0 e 2 (não 0,1,2)
    expect(findMatches([{ text: 'aaaa', pos: 0 }], 'aa')).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 }
    ])
  })
})
