import { describe, it, expect } from 'vitest'
import { noteFileSlug, notePathCandidate } from './noteFileLink'

describe('noteFileSlug', () => {
  it('nome vira slug seguro de arquivo, preservando acentos legíveis', () => {
    expect(noteFileSlug('Plano de Lançamento')).toBe('Plano-de-Lançamento')
  })

  it('separadores de path e controle nunca sobrevivem', () => {
    expect(noteFileSlug('../../etc/passwd')).not.toContain('/')
    expect(noteFileSlug('a/b\\c')).toBe('a-b-c')
    expect(noteFileSlug('x\ny')).toBe('x-y')
  })

  it('nome vazio/só-lixo cai no fallback estável', () => {
    expect(noteFileSlug('')).toBe('nota')
    expect(noteFileSlug('///')).toBe('nota')
    expect(noteFileSlug('   ')).toBe('nota')
  })

  it('não começa nem termina com ponto/hífen (dotfile acidental, feiúra no Finder)', () => {
    expect(noteFileSlug('.oculto')).toBe('oculto')
    expect(noteFileSlug('fim-')).toBe('fim')
  })
})

describe('notePathCandidate', () => {
  it('primeira tentativa é <cwd>/<slug>.md', () => {
    expect(notePathCandidate('/proj', 'Roadmap', 1)).toBe('/proj/Roadmap.md')
  })

  it('tentativas seguintes ganham sufixo -n (não sobrescrever arquivo alheio)', () => {
    expect(notePathCandidate('/proj', 'Roadmap', 2)).toBe('/proj/Roadmap-2.md')
    expect(notePathCandidate('/proj', 'Roadmap', 7)).toBe('/proj/Roadmap-7.md')
  })

  it('cwd com barra final não duplica separador', () => {
    expect(notePathCandidate('/proj/', 'x', 1)).toBe('/proj/x.md')
  })
})
