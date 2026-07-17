import { describe, it, expect } from 'vitest'
import { watchDirsFor, shouldApplyWatchEvent } from './fileTreeWatch'

describe('watchDirsFor', () => {
  it('observa a raiz mesmo sem nenhuma pasta expandida', () => {
    expect(watchDirsFor('/r', new Set())).toEqual(['/r'])
  })

  it('observa a raiz + as pastas expandidas (escopo visivel)', () => {
    expect(watchDirsFor('/r', new Set(['/r/src', '/r/docs']))).toEqual(['/r', '/r/src', '/r/docs'])
  })

  it('nao duplica a raiz se ela tambem aparecer entre as expandidas', () => {
    expect(watchDirsFor('/r', new Set(['/r', '/r/src']))).toEqual(['/r', '/r/src'])
  })

  it('sem raiz nao ha o que observar (no resolvendo a pasta / sem pasta)', () => {
    expect(watchDirsFor(undefined, new Set(['/r/src']))).toEqual([])
    expect(watchDirsFor('', new Set(['/r/src']))).toEqual([])
  })

  it('a raiz vem sempre primeiro', () => {
    expect(watchDirsFor('/r', new Set(['/r/z', '/r/a']))[0]).toBe('/r')
  })

  it('ignora entradas vazias entre as expandidas', () => {
    expect(watchDirsFor('/r', new Set(['', '/r/src']))).toEqual(['/r', '/r/src'])
  })

  it('NAO tenta observar a arvore inteira: so o que foi pedido', () => {
    // Guarda de regressão da decisão de escopo: uma pasta colapsada (/r/oculta) não entra.
    const dirs = watchDirsFor('/r', new Set(['/r/src']))
    expect(dirs).not.toContain('/r/oculta')
    expect(dirs.length).toBe(2)
  })
})

describe('shouldApplyWatchEvent', () => {
  const ev = (subscriptionId: string, projectId: string | null) => ({ subscriptionId, projectId })

  it('aplica o push da minha assinatura, no meu projeto', () => {
    expect(shouldApplyWatchEvent(ev('s1', 'proj-a'), 's1', 'proj-a')).toBe(true)
  })

  it('descarta push de OUTRA assinatura (outro no de arvore no canvas)', () => {
    expect(shouldApplyWatchEvent(ev('s2', 'proj-a'), 's1', 'proj-a')).toBe(false)
  })

  // O ponto da guarda de escopo: o incidente de corrupção cross-project.
  it('descarta push do projeto A quando o canvas ja exibe o projeto B', () => {
    expect(shouldApplyWatchEvent(ev('s1', 'proj-a'), 's1', 'proj-b')).toBe(false)
  })

  it('aplica quando o push nao tem carimbo de projeto (legado/boot)', () => {
    expect(shouldApplyWatchEvent(ev('s1', null), 's1', 'proj-a')).toBe(true)
  })

  it('aplica quando o canvas ainda nao sabe o projeto ativo (boot)', () => {
    expect(shouldApplyWatchEvent(ev('s1', 'proj-a'), 's1', null)).toBe(true)
  })

  it('a guarda de assinatura vence mesmo com o projeto batendo', () => {
    expect(shouldApplyWatchEvent(ev('s2', null), 's1', null)).toBe(false)
  })

  it('mesma regra do relay do orq: so descarta quando AMBOS os lados sao conhecidos e diferem', () => {
    expect(shouldApplyWatchEvent(ev('s1', null), 's1', null)).toBe(true)
    expect(shouldApplyWatchEvent(ev('s1', 'x'), 's1', 'x')).toBe(true)
    expect(shouldApplyWatchEvent(ev('s1', 'x'), 's1', 'y')).toBe(false)
  })
})
