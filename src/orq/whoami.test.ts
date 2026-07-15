import { describe, it, expect } from 'vitest'
import { describeSelf } from './whoami'
import type { CanvasMirror } from '../shared/orchestration'

describe('describeSelf', () => {
  it('descreve o próprio nó (nome + papel) e lista os blocos/agentes conectados em qualquer direção', () => {
    const mirror: CanvasMirror = {
      nodes: [
        { id: 't1', type: 'terminal', name: 'Líder', role: 'Líder' },
        { id: 'n1', type: 'note', name: 'Spec' },
        { id: 't2', type: 'terminal', name: 'Dev' }
      ],
      edges: [
        { source: 'n1', target: 't1' }, // aresta chega no t1 (nota → líder)
        { source: 't1', target: 't2' } // aresta sai do t1 (líder → dev)
      ]
    }
    const out = describeSelf(mirror, 't1')
    expect(out).toContain('Líder') // nome próprio
    expect(out).toContain('papel: Líder') // papel
    expect(out).toContain('Spec') // vizinho por aresta que chega
    expect(out).toContain('Dev') // vizinho por aresta que sai
  })

  it('id ausente no mirror → mensagem amigável de não-identificação', () => {
    const mirror: CanvasMirror = {
      nodes: [{ id: 't1', type: 'terminal', name: 'Líder' }],
      edges: []
    }
    const out = describeSelf(mirror, 'inexistente')
    expect(out).toContain('não foi possível identificar')
  })

  it('nó sem papel e sem conexões ainda descreve o próprio nome (não é o caso de não-identificação)', () => {
    const mirror: CanvasMirror = {
      nodes: [{ id: 't1', type: 'terminal', name: 'Sozinho' }],
      edges: []
    }
    const out = describeSelf(mirror, 't1')
    expect(out).toContain('Sozinho')
    expect(out).not.toContain('não foi possível identificar')
  })
})
