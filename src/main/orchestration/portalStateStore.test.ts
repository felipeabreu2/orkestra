import { describe, it, expect } from 'vitest'
import { PortalStateStore } from './portalStateStore'

describe('PortalStateStore (chave composta projectId+name)', () => {
  it('estado de um projeto NÃO é lido por outro (o resíduo cross-project do gap #8)', () => {
    const store = new PortalStateStore<string>()
    store.set('proj-A', 'P', 'estado de A')
    expect(store.get('proj-A', 'P')).toBe('estado de A')
    expect(store.get('proj-B', 'P')).toBeNull()
  })

  it('mesmo nome em projetos diferentes convive sem sobrescrever', () => {
    const store = new PortalStateStore<string>()
    store.set('proj-A', 'P', 'de A')
    store.set('proj-B', 'P', 'de B')
    expect(store.get('proj-A', 'P')).toBe('de A')
    expect(store.get('proj-B', 'P')).toBe('de B')
  })

  it('projectId null (boot/legado) é um escopo próprio — casa só com leitura sem projeto', () => {
    const store = new PortalStateStore<string>()
    store.set(null, 'P', 'legado')
    expect(store.get(null, 'P')).toBe('legado')
    expect(store.get('proj-A', 'P')).toBeNull()
  })

  it('clearProject remove SÓ as entradas daquele projeto', () => {
    const store = new PortalStateStore<string>()
    store.set('proj-A', 'P1', 'a1')
    store.set('proj-A', 'P2', 'a2')
    store.set('proj-B', 'P1', 'b1')
    store.clearProject('proj-A')
    expect(store.get('proj-A', 'P1')).toBeNull()
    expect(store.get('proj-A', 'P2')).toBeNull()
    expect(store.get('proj-B', 'P1')).toBe('b1')
  })

  it('chave ausente devolve null (nunca lança)', () => {
    const store = new PortalStateStore<string>()
    expect(store.get('x', 'nada')).toBeNull()
  })

  it('nomes não colidem entre projetos por concatenação ingênua (separador fora do alfabeto de ids)', () => {
    const store = new PortalStateStore<string>()
    // se a chave fosse `${projectId}${name}`, 'ab'+'c' colidiria com 'a'+'bc'
    store.set('ab', 'c', 'um')
    store.set('a', 'bc', 'dois')
    expect(store.get('ab', 'c')).toBe('um')
    expect(store.get('a', 'bc')).toBe('dois')
  })
})
