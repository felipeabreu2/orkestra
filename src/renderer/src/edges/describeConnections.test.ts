import { describe, it, expect } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import { describeNodeConnections } from './describeConnections'

// Fábricas minimalistas: só o que o helper lê (id/type/data.name). `position` é exigido pelo
// tipo Node do React Flow, então preenchemos com zero.
function n(id: string, type: string, name?: string): Node {
  return { id, type, position: { x: 0, y: 0 }, data: name ? { name } : {} }
}
function e(id: string, source: string, target: string): Edge {
  return { id, source, target }
}

describe('describeNodeConnections', () => {
  it('lista cada conexão do nó com nome/tipo/kind do outro lado', () => {
    const nodes = [n('T', 'terminal', 'Term'), n('A', 'note', 'Ideias'), n('P', 'portal', 'Docs')]
    const edges = [e('e1', 'T', 'A'), e('e2', 'T', 'P')]

    const rows = describeNodeConnections(nodes, edges, 'T')

    expect(rows).toHaveLength(2)
    // Ordenado de forma estável por otherName: "Docs" (P) antes de "Ideias" (A).
    expect(rows.map((r) => r.otherId)).toEqual(['P', 'A'])

    const toA = rows.find((r) => r.otherId === 'A')!
    expect(toA).toMatchObject({
      edgeId: 'e1',
      otherId: 'A',
      otherName: 'Ideias',
      otherType: 'note',
      kind: 'note', // deriveEdgeKind('terminal','note')
      direction: 'outgoing'
    })

    const toP = rows.find((r) => r.otherId === 'P')!
    expect(toP).toMatchObject({
      edgeId: 'e2',
      otherId: 'P',
      otherName: 'Docs',
      otherType: 'portal',
      kind: 'portal',
      direction: 'outgoing'
    })
  })

  it('resolve o "outro lado" independente da direção da aresta', () => {
    const nodes = [n('T', 'terminal', 'Term'), n('A', 'note', 'A'), n('B', 'note', 'B')]
    // A→T (T é target) e T→B (T é source): os dois devem aparecer como vizinhos de T.
    const edges = [e('e1', 'A', 'T'), e('e2', 'T', 'B')]

    const rows = describeNodeConnections(nodes, edges, 'T')

    expect(rows.map((r) => r.otherId).sort()).toEqual(['A', 'B'])
    expect(rows.find((r) => r.otherId === 'A')!.direction).toBe('incoming')
    expect(rows.find((r) => r.otherId === 'B')!.direction).toBe('outgoing')
  })

  it('nó com N conexões devolve N linhas', () => {
    const nodes = [
      n('T', 'terminal', 'T'),
      n('A', 'note', 'A'),
      n('B', 'note', 'B'),
      n('C', 'note', 'C')
    ]
    const edges = [e('e1', 'T', 'A'), e('e2', 'T', 'B'), e('e3', 'T', 'C')]
    expect(describeNodeConnections(nodes, edges, 'T')).toHaveLength(3)
  })

  it('nó sem conexões => []', () => {
    const nodes = [n('T', 'terminal', 'T'), n('A', 'note', 'A')]
    const edges = [e('e1', 'A', 'A')] // aresta que não toca T
    expect(describeNodeConnections(nodes, edges, 'T')).toEqual([])
  })

  it('id inexistente => []', () => {
    const nodes = [n('T', 'terminal', 'T'), n('A', 'note', 'A')]
    const edges = [e('e1', 'T', 'A')]
    expect(describeNodeConnections(nodes, edges, 'ZZZ')).toEqual([])
  })

  it('ignora arestas órfãs (o outro lado não existe na lista de nós)', () => {
    const nodes = [n('T', 'terminal', 'T'), n('A', 'note', 'A')]
    // e2 aponta para "GHOST", que não está em `nodes` — deve ser ignorada.
    const edges = [e('e1', 'T', 'A'), e('e2', 'T', 'GHOST')]

    const rows = describeNodeConnections(nodes, edges, 'T')
    expect(rows).toHaveLength(1)
    expect(rows[0].otherId).toBe('A')
  })

  it('deriva kind = agent para terminal↔terminal e chain para note↔note', () => {
    const nodes = [n('T', 'terminal', 'T'), n('U', 'terminal', 'U'), n('N', 'note', 'N')]
    const edges = [e('e1', 'T', 'U'), e('e2', 'N', 'T')]

    const rows = describeNodeConnections(nodes, edges, 'T')
    expect(rows.find((r) => r.otherId === 'U')!.kind).toBe('agent')

    const chainRows = describeNodeConnections([n('N1', 'note', 'N1'), n('N2', 'note', 'N2')], [e('c', 'N1', 'N2')], 'N1')
    expect(chainRows[0].kind).toBe('chain')
  })

  it('ordena de forma estável por otherName (popover previsível)', () => {
    const nodes = [
      n('T', 'terminal', 'T'),
      n('Z', 'note', 'Zebra'),
      n('A', 'note', 'Alfa'),
      n('M', 'note', 'Meio')
    ]
    const edges = [e('e1', 'T', 'Z'), e('e2', 'T', 'A'), e('e3', 'T', 'M')]
    const rows = describeNodeConnections(nodes, edges, 'T')
    expect(rows.map((r) => r.otherName)).toEqual(['Alfa', 'Meio', 'Zebra'])
  })
})
