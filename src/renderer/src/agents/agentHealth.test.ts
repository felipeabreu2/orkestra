import { describe, it, expect } from 'vitest'
import { buildAgentHealth } from './agentHealth'

type NodeLike = { id: string; type?: string; data?: Record<string, unknown> }
const t = (id: string, name: string): NodeLike => ({ id, type: 'terminal', data: { name } })

describe('buildAgentHealth', () => {
  const nodes: NodeLike[] = [
    t('t1', 'Dev'),
    t('t2', 'Revisor'),
    t('t3', 'Docs'),
    { id: 'n1', type: 'note', data: { html: '<p>x</p>' } }
  ]

  it('só terminais entram; status deriva dos Sets (gerando/aguardando/ocioso)', () => {
    const health = buildAgentHealth(nodes as never, new Set(['t1']), new Set(['t2']))
    expect(health).toHaveLength(3)
    expect(health.find((h) => h.id === 't1')?.status).toBe('aguardando')
    expect(health.find((h) => h.id === 't2')?.status).toBe('gerando')
    expect(health.find((h) => h.id === 't3')?.status).toBe('ocioso')
    expect(health.some((h) => h.id === 'n1')).toBe(false)
  })

  it('gerando tem prioridade sobre aguardando (o agente voltou a trabalhar)', () => {
    const health = buildAgentHealth([t('t1', 'Dev')] as never, new Set(['t1']), new Set(['t1']))
    expect(health[0].status).toBe('gerando')
  })

  it('ordena por status (gerando → aguardando → ocioso) e por nome dentro do grupo', () => {
    const health = buildAgentHealth(
      [t('a', 'Zeta'), t('b', 'Alfa'), t('c', 'Beta'), t('d', 'Caso')] as never,
      new Set(['a']),
      new Set(['c'])
    )
    expect(health.map((h) => h.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('terminal sem nome ganha fallback estável', () => {
    const health = buildAgentHealth([{ id: 'x', type: 'terminal', data: {} }] as never, new Set(), new Set())
    expect(health[0].name.length).toBeGreaterThan(0)
  })
})
