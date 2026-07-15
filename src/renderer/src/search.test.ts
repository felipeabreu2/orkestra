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
  it('query só de espaços devolve todos (termos vazios)', () => {
    expect(rankItems('   ', items)).toHaveLength(5)
  })
  it('filtra por substring case-insensitive', () => {
    expect(rankItems('portal', items).map((i) => i.label)).toEqual(['Criar Portal'])
    // Mudança de contrato esperada (T1): sob busca fuzzy, 'dev' também é subsequência de
    // 'Backend Reviewer' (d…e…v), então o retorno passa a conter os dois. O match contíguo/
    // prefixo de 'Dev' rankeia acima da subsequência espalhada. NÃO é regressão — o teste
    // antigo era `toEqual(['Dev'])`, válido só sob substring.
    expect(rankItems('DEV', items).map((i) => i.label)[0]).toBe('Dev')
    expect(rankItems('DEV', items).map((i) => i.label)).toContain('Dev')
  })
  it('prefixo/início do label rankeia acima de match no meio', () => {
    const r = rankItems('re', [{ label: 'Backend Reviewer' }, { label: 'Reload' }])
    expect(r[0].label).toBe('Reload') // começa com "Re"
  })
  it('sem match devolve vazio', () => {
    expect(rankItems('zzz', items)).toEqual([])
  })

  // T1 — sem acento (normalização NFD, bidirecional)
  it('ignora acentos nos dois lados (NFD)', () => {
    expect(rankItems('nao', [{ label: 'Não perturbe' }]).map((i) => i.label)).toEqual(['Não perturbe'])
    expect(rankItems('não', [{ label: 'Nao perturbe' }]).map((i) => i.label)).toEqual(['Nao perturbe'])
  })

  // T1 — fuzzy (subsequência não contígua)
  it('casa subsequência não contígua e rejeita quando não é subsequência', () => {
    expect(rankItems('btS', [{ label: 'Batuta Search' }]).map((i) => i.label)).toEqual(['Batuta Search'])
    expect(rankItems('xqz', [{ label: 'Batuta Search' }])).toEqual([])
  })

  // T1 — multi-palavra AND, ordem-independente
  it('exige todos os termos (AND), independente da ordem', () => {
    expect(
      rankItems('cri term', [{ label: 'Criar Terminal' }, { label: 'Criar Nota' }]).map((i) => i.label)
    ).toEqual(['Criar Terminal'])
    expect(
      rankItems('term cri', [{ label: 'Criar Terminal' }]).map((i) => i.label)
    ).toEqual(['Criar Terminal'])
  })

  // T1 — char repetido exige as duas ocorrências no haystack
  it('char repetido exige as duas ocorrências', () => {
    expect(rankItems('ll', [{ label: 'Reload' }])).toEqual([]) // 'reload' tem só um 'l'
    expect(rankItems('ll', [{ label: 'Rolling' }]).map((i) => i.label)).toEqual(['Rolling'])
  })

  // T2 — match no corpo da nota via searchText
  it('casa termo presente só no searchText (corpo da nota)', () => {
    const r = rankItems('kubernetes', [
      { label: 'Nota: reunião sobre kube', searchText: 'reunião sobre kubernetes e deploy' }
    ])
    expect(r.map((i) => i.label)).toEqual(['Nota: reunião sobre kube'])
  })

  // T2 — match no nome precede match só no corpo
  it('match no nome vence match só no corpo', () => {
    const r = rankItems('deploy', [
      { label: 'Nota: infra', searchText: 'pipeline de deploy contínuo' },
      { label: 'Deploy manual', searchText: 'passos manuais' }
    ])
    expect(r[0].label).toBe('Deploy manual')
  })
})
