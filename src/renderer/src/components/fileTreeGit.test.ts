import { describe, it, expect } from 'vitest'
import { relativeToRoot, gitKeyForEntry } from './fileTreeGit'

describe('relativeToRoot', () => {
  it('remove o prefixo da raiz do path absoluto', () => {
    expect(relativeToRoot('/repo', '/repo/deep/a.txt')).toBe('deep/a.txt')
  })
  it('tolera raiz já terminada em barra', () => {
    expect(relativeToRoot('/repo/', '/repo/deep/a.txt')).toBe('deep/a.txt')
  })
  it('devolve o path cru se ele não estiver sob a raiz', () => {
    expect(relativeToRoot('/repo', '/outro/a.txt')).toBe('/outro/a.txt')
  })
})

describe('gitKeyForEntry', () => {
  it('raiz = toplevel (prefix vazio): chave = relativo à raiz', () => {
    expect(gitKeyForEntry('', '/repo', '/repo/deep/a.txt')).toBe('deep/a.txt')
  })
  it('raiz = subdiretório: compõe prefix + relativo à raiz (chave do git = relativa ao toplevel)', () => {
    expect(gitKeyForEntry('sub/', '/repo/sub', '/repo/sub/deep/a.txt')).toBe('sub/deep/a.txt')
  })
})
