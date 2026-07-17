import { describe, it, expect } from 'vitest'
import { parseSearchMode, filterByName, collectLoadedEntries } from './fileTreeFilter'
import type { FileEntry } from '../../../shared/filetree'

const f = (name: string, path: string, isDir = false): FileEntry => ({ name, path, isDir })

describe('parseSearchMode', () => {
  it('sem prefixo -> modo nome, query como veio', () => {
    expect(parseSearchMode('bar')).toEqual({ mode: 'name', query: 'bar' })
  })

  it('prefixo ">" -> modo conteudo, sem o ">"', () => {
    expect(parseSearchMode('>foo')).toEqual({ mode: 'content', query: 'foo' })
  })

  it('espacos apos o ">" nao entram na query', () => {
    expect(parseSearchMode('>  foo bar')).toEqual({ mode: 'content', query: 'foo bar' })
  })

  it('vazio e so ">" -> query vazia (nada a buscar)', () => {
    expect(parseSearchMode('')).toEqual({ mode: 'name', query: '' })
    expect(parseSearchMode('>')).toEqual({ mode: 'content', query: '' })
  })

  it('">" no MEIO nao muda o modo (so o prefixo alterna)', () => {
    expect(parseSearchMode('a>b')).toEqual({ mode: 'name', query: 'a>b' })
  })
})

describe('filterByName', () => {
  const entries = [
    f('Apple.txt', '/r/Apple.txt'),
    f('grape.md', '/r/grape.md'),
    f('apps', '/r/apps', true),
    f('café.txt', '/r/café.txt')
  ]

  it('casa por substring case-insensitive, em arquivos E pastas', () => {
    const hits = filterByName(entries, 'ap')
    expect(hits.map((e) => e.name)).toEqual(['Apple.txt', 'grape.md', 'apps'])
  })

  it('acentos casam literalmente', () => {
    expect(filterByName(entries, 'café').map((e) => e.name)).toEqual(['café.txt'])
  })

  it('query vazia (ou so espacos) -> nenhum resultado, nao "todos"', () => {
    expect(filterByName(entries, '')).toEqual([])
    expect(filterByName(entries, '   ')).toEqual([])
  })
})

describe('collectLoadedEntries', () => {
  it('achata raiz + niveis cacheados, na ordem da arvore (pai antes dos filhos)', () => {
    const rootEntries = [f('src', '/r/src', true), f('README.md', '/r/README.md')]
    const cache = new Map<string, FileEntry[]>([
      ['/r/src', [f('deep', '/r/src/deep', true), f('a.ts', '/r/src/a.ts')]],
      ['/r/src/deep', [f('b.ts', '/r/src/deep/b.ts')]]
    ])
    expect(collectLoadedEntries(rootEntries, cache).map((e) => e.path)).toEqual([
      '/r/src',
      '/r/src/deep',
      '/r/src/deep/b.ts',
      '/r/src/a.ts',
      '/r/README.md'
    ])
  })

  it('cache orfao (pasta que ja nao esta na arvore) nao entra nem quebra', () => {
    const rootEntries = [f('a.txt', '/r/a.txt')]
    const cache = new Map<string, FileEntry[]>([['/r/sumiu', [f('x.ts', '/r/sumiu/x.ts')]]])
    expect(collectLoadedEntries(rootEntries, cache).map((e) => e.path)).toEqual(['/r/a.txt'])
  })

  it('ciclo no cache (symlink de pasta para um ancestral) nao trava', () => {
    const rootEntries = [f('loop', '/r/loop', true)]
    const cache = new Map<string, FileEntry[]>([['/r/loop', [f('loop', '/r/loop', true)]]])
    expect(collectLoadedEntries(rootEntries, cache).map((e) => e.path)).toEqual(['/r/loop'])
  })
})
