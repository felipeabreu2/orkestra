import { describe, it, expect } from 'vitest'
import { deriveEdgeKind, EDGE_KIND_META } from './edgeKind'

describe('deriveEdgeKind', () => {
  it('terminal↔terminal = agent', () => {
    expect(deriveEdgeKind('terminal', 'terminal')).toBe('agent')
  })
  it('note↔note = chain', () => {
    expect(deriveEdgeKind('note', 'note')).toBe('chain')
  })
  it('terminal↔note = note (simétrico)', () => {
    expect(deriveEdgeKind('terminal', 'note')).toBe('note')
    expect(deriveEdgeKind('note', 'terminal')).toBe('note')
  })
  it('qualquer↔portal = portal', () => {
    expect(deriveEdgeKind('terminal', 'portal')).toBe('portal')
    expect(deriveEdgeKind('portal', 'note')).toBe('portal')
  })
  it('não classificado (ex.: filetree↔terminal, indefinido) = link', () => {
    expect(deriveEdgeKind('filetree', 'terminal')).toBe('link')
    expect(deriveEdgeKind(undefined, 'terminal')).toBe('link')
    expect(deriveEdgeKind(undefined, undefined)).toBe('link')
  })
})

describe('EDGE_KIND_META', () => {
  it('tem rótulo e título para cada tipo', () => {
    for (const k of ['agent', 'chain', 'note', 'portal', 'link'] as const) {
      expect(EDGE_KIND_META[k].label.length).toBeGreaterThan(0)
      expect(EDGE_KIND_META[k].title.length).toBeGreaterThan(0)
    }
  })
})
