import { describe, it, expect } from 'vitest'
import { buildCrossProjectIndex, type ProjectCanvasForIndex } from './crossProjectIndex'

const canvases: ProjectCanvasForIndex[] = [
  {
    project: { id: 'p1', name: 'Frontend' },
    nodes: [
      { id: 't1', type: 'terminal', data: { name: 'Dev' } },
      { id: 'n1', type: 'note', data: { html: '<h1>Deploy</h1><p>reunião sobre kubernetes</p>' } },
      { id: 'g1', type: 'group', data: {} }
    ]
  },
  {
    project: { id: 'p2', name: 'Backend' },
    nodes: [
      { id: 't2', type: 'terminal', data: { name: 'Revisor' } },
      { id: 'pt2', type: 'portal', data: { name: 'Docs' } }
    ]
  },
  // canvas ausente/corrupto (nodes null) não deve quebrar nem contribuir
  { project: { id: 'p3', name: 'Vazio' }, nodes: null }
]

describe('buildCrossProjectIndex', () => {
  it('cobre nós de TODOS os projetos (menos o ativo), cada entrada com seu projectId/projectName', () => {
    const idx = buildCrossProjectIndex(canvases, null)
    // group é ignorado; canvas null não contribui
    expect(idx.map((e) => e.nodeId).sort()).toEqual(['n1', 'pt2', 't1', 't2'])
    const dev = idx.find((e) => e.nodeId === 't1')!
    expect(dev.projectId).toBe('p1')
    expect(dev.projectName).toBe('Frontend')
    expect(dev.label).toBe('Dev')
    const rev = idx.find((e) => e.nodeId === 't2')!
    expect(rev.projectId).toBe('p2')
  })

  it('PULA o projeto ativo (ele vem do canvasStore ao vivo — não duplicar nem mostrar estado velho)', () => {
    const idx = buildCrossProjectIndex(canvases, 'p1')
    expect(idx.some((e) => e.projectId === 'p1')).toBe(false)
    expect(idx.some((e) => e.projectId === 'p2')).toBe(true)
  })

  it('nota: label truncado (Nota: <=24) e searchText com o corpo INTEIRO (HTML stripado)', () => {
    const idx = buildCrossProjectIndex(canvases, null)
    const nota = idx.find((e) => e.nodeId === 'n1')!
    expect(nota.label.startsWith('Nota: ')).toBe(true)
    expect(nota.label.length).toBeLessThanOrEqual('Nota: '.length + 24)
    expect(nota.searchText).toContain('kubernetes')
    expect(nota.searchText).toContain('Deploy')
    // nunca vaza tag crua no texto de busca
    expect(nota.searchText).not.toContain('<h1>')
  })

  it('terminal/portal usam o name; fallback estável quando falta', () => {
    const idx = buildCrossProjectIndex(
      [{ project: { id: 'p', name: 'P' }, nodes: [{ id: 'x', type: 'terminal', data: {} }] }],
      null
    )
    expect(idx[0].label.length).toBeGreaterThan(0)
  })

  it('decodifica entidades HTML comuns no texto de busca (& < > não viram &amp; etc.)', () => {
    const idx = buildCrossProjectIndex(
      [
        {
          project: { id: 'p', name: 'P' },
          nodes: [{ id: 'n', type: 'note', data: { html: '<p>a &amp; b &lt; c</p>' } }]
        }
      ],
      null
    )
    expect(idx[0].searchText).toContain('a & b < c')
  })

  it('nota antiga (data.content, sem html) também indexa', () => {
    const idx = buildCrossProjectIndex(
      [
        {
          project: { id: 'p', name: 'P' },
          nodes: [{ id: 'n', type: 'note', data: { content: 'texto legado' } }]
        }
      ],
      null
    )
    expect(idx[0].searchText).toContain('texto legado')
  })
})
