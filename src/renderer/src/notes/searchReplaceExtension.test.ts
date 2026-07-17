import { describe, it, expect } from 'vitest'
import type { Node as PMNode } from '@tiptap/pm/model'
import { collectMatches } from './searchReplaceExtension'

// T10 — o parâmetro caseSensitive precisa FLUIR pelo collectMatches (a lógica em si já é testada
// em findMatches.test.ts; aqui provamos só a passagem). Fake mínimo de doc: collectMatches usa
// apenas doc.descendants sobre nós de texto.
function fakeDoc(text: string): PMNode {
  return {
    descendants(cb: (node: { isText: boolean; text: string }, pos: number) => boolean) {
      cb({ isText: true, text }, 1)
    }
  } as unknown as PMNode
}

describe('collectMatches (fluxo do caseSensitive)', () => {
  it('default é case-insensitive (comportamento atual preservado)', () => {
    expect(collectMatches(fakeDoc('Abc abc'), 'abc').length).toBe(2)
  })

  it('caseSensitive=true casa só o caso exato', () => {
    expect(collectMatches(fakeDoc('Abc abc'), 'abc', true).length).toBe(1)
    expect(collectMatches(fakeDoc('Abc abc'), 'Abc', true).length).toBe(1)
  })
})
