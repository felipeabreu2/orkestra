import { describe, it, expect } from 'vitest'
import { connectedAgentNames } from './agentTopology'
import type { CanvasMirror } from './orchestration'

describe('connectedAgentNames', () => {
  it('lista só os terminais ligados por aresta agent (exclui notas/arquivos), por nome', () => {
    const mirror: CanvasMirror = {
      nodes: [
        { id: 't1', type: 'terminal', name: 'Líder' },
        { id: 't2', type: 'terminal', name: 'Dev' },
        { id: 'a', type: 'note', name: 'Spec' }
      ],
      edges: [
        { source: 't1', target: 't2' }, // agent (terminal↔terminal)
        { source: 't1', target: 'a' } // note (não conta)
      ]
    }
    expect(connectedAgentNames(mirror, 't1')).toEqual(['Dev'])
  })

  it('é não-direcional (aresta guardada como {source:t2, target:t1} também conta)', () => {
    const mirror: CanvasMirror = {
      nodes: [
        { id: 't1', type: 'terminal', name: 'Líder' },
        { id: 't2', type: 'terminal', name: 'Dev' }
      ],
      edges: [{ source: 't2', target: 't1' }]
    }
    expect(connectedAgentNames(mirror, 't1')).toEqual(['Dev'])
  })

  it('terminal sem vizinhos-terminal devolve []', () => {
    const mirror: CanvasMirror = {
      nodes: [
        { id: 't1', type: 'terminal', name: 'Sozinho' },
        { id: 'a', type: 'note', name: 'Spec' }
      ],
      edges: [{ source: 't1', target: 'a' }]
    }
    expect(connectedAgentNames(mirror, 't1')).toEqual([])
  })

  it('deduplica multi-arestas para o mesmo terminal', () => {
    const mirror: CanvasMirror = {
      nodes: [
        { id: 't1', type: 'terminal', name: 'Líder' },
        { id: 't2', type: 'terminal', name: 'Dev' }
      ],
      edges: [
        { source: 't1', target: 't2' },
        { source: 't2', target: 't1' }
      ]
    }
    expect(connectedAgentNames(mirror, 't1')).toEqual(['Dev'])
  })

  it('from desconhecido no espelho devolve []', () => {
    const mirror: CanvasMirror = {
      nodes: [{ id: 't1', type: 'terminal', name: 'Líder' }],
      edges: []
    }
    expect(connectedAgentNames(mirror, 'fantasma')).toEqual([])
  })

  it('from que não é terminal devolve [] (aresta a terminal não é agent)', () => {
    const mirror: CanvasMirror = {
      nodes: [
        { id: 'a', type: 'note', name: 'Spec' },
        { id: 't1', type: 'terminal', name: 'Dev' }
      ],
      edges: [{ source: 'a', target: 't1' }]
    }
    expect(connectedAgentNames(mirror, 'a')).toEqual([])
  })
})
