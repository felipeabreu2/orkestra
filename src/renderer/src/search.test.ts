import { describe, it, expect } from 'vitest'
import { rankItems, matchRanges } from './search'

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

describe('matchRanges', () => {
  it('query vazia devolve nenhum intervalo', () => {
    expect(matchRanges('', 'Qualquer')).toEqual([])
    expect(matchRanges('   ', 'Qualquer')).toEqual([])
  })

  it('sem match devolve nenhum intervalo', () => {
    expect(matchRanges('xyz', 'Batuta')).toEqual([])
  })

  // Subsequência: 'bt' casa o B (idx 0) e o primeiro t (idx 2) de 'Batuta Search'.
  it('cobre os caracteres casados como subsequência', () => {
    expect(matchRanges('bt', 'Batuta Search')).toEqual([
      [0, 1],
      [2, 3]
    ])
  })

  // Caracteres contíguos viram um único intervalo mesclado.
  it('mescla caracteres consecutivos em um intervalo', () => {
    expect(matchRanges('bat', 'Batuta Search')).toEqual([[0, 3]])
  })

  // Multi-palavra: cada termo contribui seus próprios trechos.
  it('cobre trechos de ambos os termos (multi-palavra)', () => {
    expect(matchRanges('ba se', 'Batuta Search')).toEqual([
      [0, 2],
      [7, 9]
    ])
  })

  // Acentos: os índices são no LABEL ORIGINAL — 'ão' em 'Não' fica nas posições 1..2.
  it('respeita acentos: índices no label original', () => {
    expect(matchRanges('ao', 'Não')).toEqual([[1, 3]])
    // busca sem acento casa o label acentuado na posição correta
    expect(matchRanges('nao', 'Não perturbe')).toEqual([[0, 3]])
  })

  // Termo que não casa no label (só existiria no corpo) não contribui trecho algum.
  it('ignora termo que não é subsequência do label', () => {
    expect(matchRanges('cri xyz', 'Criar Terminal')).toEqual([[0, 3]])
  })
})
