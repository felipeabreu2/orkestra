import { describe, it, expect } from 'vitest'
import { attentionAgents } from './attentionList'

// Ombro T5 (docs/planejamento/ombro.md): seletor PURO que deriva a lista do HUD a partir dos nós do
// canvas + o Set `attention` (que já só contém nós monitorados). Devolve [{id, name}] só dos nós
// presentes no Set, NA ORDEM dos nós do canvas, ignorando ids órfãos (no Set mas sem nó).
describe('attentionAgents', () => {
  it('retorna só os nós no Set, na ordem do canvas', () => {
    const nodes = [
      { id: 'a', data: { name: 'Dev' } },
      { id: 'b', data: { name: 'Outro' } },
      { id: 'c', data: { name: 'Revisor' } }
    ]
    const set = new Set(['a', 'c'])
    expect(attentionAgents(nodes, set)).toEqual([
      { id: 'a', name: 'Dev' },
      { id: 'c', name: 'Revisor' }
    ])
  })

  it('omite ids no Set que não têm nó correspondente (órfãos), sem quebrar', () => {
    const nodes = [{ id: 'a', data: { name: 'Dev' } }]
    const set = new Set(['a', 'fantasma'])
    expect(attentionAgents(nodes, set)).toEqual([{ id: 'a', name: 'Dev' }])
  })

  it('Set vazio → []', () => {
    const nodes = [{ id: 'a', data: { name: 'Dev' } }]
    expect(attentionAgents(nodes, new Set())).toEqual([])
  })

  it('nó sem data.name → cai no default "Terminal" (mesmo do TerminalFlowNode)', () => {
    const nodes = [{ id: 'a', data: {} }]
    expect(attentionAgents(nodes, new Set(['a']))).toEqual([{ id: 'a', name: 'Terminal' }])
  })

  it('nó com name vazio/espaços → default "Terminal"', () => {
    const nodes = [{ id: 'a', data: { name: '   ' } }]
    expect(attentionAgents(nodes, new Set(['a']))).toEqual([{ id: 'a', name: 'Terminal' }])
  })
})
