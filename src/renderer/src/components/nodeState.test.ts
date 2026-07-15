import { describe, it, expect } from 'vitest'
import { nodeStateClass, type NodeState } from './nodeState'

describe('nodeStateClass', () => {
  it('mapeia cada estado para sua classe', () => {
    expect(nodeStateClass('idle')).toBe('')
    expect(nodeStateClass('generating')).toBe('is-generating')
    expect(nodeStateClass('needsInput')).toBe('needs-attention')
    expect(nodeStateClass('done')).toBe('is-done')
  })

  it('combina seleção com gerando', () => {
    expect(nodeStateClass('generating', true)).toBe('is-generating is-selected')
  })

  it('seleção sozinha (idle + selected) só adiciona is-selected', () => {
    expect(nodeStateClass('idle', true)).toBe('is-selected')
  })

  it('sem seleção não adiciona is-selected', () => {
    expect(nodeStateClass('needsInput', false)).toBe('needs-attention')
  })

  it('aceita todos os NodeState válidos sem lançar', () => {
    const states: NodeState[] = ['idle', 'generating', 'needsInput', 'done']
    for (const s of states) {
      expect(() => nodeStateClass(s)).not.toThrow()
    }
  })
})
