import { describe, it, expect } from 'vitest'
import { rankItems } from './search'

const items = [
  { label: 'Criar Terminal' }, { label: 'Criar Nota' }, { label: 'Criar Portal' },
  { label: 'Dev' }, { label: 'Backend Reviewer' }
]

describe('rankItems', () => {
  it('query vazia devolve todos na ordem', () => {
    expect(rankItems('', items)).toHaveLength(5)
  })
  it('filtra por substring case-insensitive', () => {
    expect(rankItems('portal', items).map((i) => i.label)).toEqual(['Criar Portal'])
    expect(rankItems('DEV', items).map((i) => i.label)).toEqual(['Dev'])
  })
  it('prefixo/início do label rankeia acima de match no meio', () => {
    const r = rankItems('re', [{ label: 'Backend Reviewer' }, { label: 'Reload' }])
    expect(r[0].label).toBe('Reload') // começa com "Re"
  })
  it('sem match devolve vazio', () => {
    expect(rankItems('zzz', items)).toEqual([])
  })
})
