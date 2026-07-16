import { describe, it, expect } from 'vitest'
import { parentDir, nameError, relTargetError, joinUnderRoot } from './fileTreeMutate'

describe('parentDir', () => {
  it('devolve o diretório do path (POSIX)', () => {
    expect(parentDir('/a/b/c.txt')).toBe('/a/b')
    expect(parentDir('/a')).toBe('/')
  })
  it('tolera barra final', () => {
    expect(parentDir('/a/b/')).toBe('/a')
  })
})

describe('nameError (nome simples de arquivo/pasta novos)', () => {
  it('aceita nomes normais, com acento e com espaço interno', () => {
    expect(nameError('novo.txt')).toBe('')
    expect(nameError('café.md')).toBe('')
    expect(nameError('meu arquivo.txt')).toBe('')
    expect(nameError('.gitignore')).toBe('')
  })
  it('rejeita vazio e só-espaços', () => {
    expect(nameError('')).not.toBe('')
    expect(nameError('   ')).not.toBe('')
  })
  it('rejeita separador (nome simples, não caminho)', () => {
    expect(nameError('a/b')).not.toBe('')
    expect(nameError('a\\b')).not.toBe('')
  })
  it('rejeita "." e ".." (mudariam de diretório, não nomeiam nada)', () => {
    expect(nameError('.')).not.toBe('')
    expect(nameError('..')).not.toBe('')
  })
  it('rejeita controle (uma quebra de linha não é nome de arquivo)', () => {
    expect(nameError('a\nb')).not.toBe('')
  })
})

describe('relTargetError (destino RELATIVO à raiz do renomear/mover)', () => {
  it('aceita nome simples e caminho relativo com subpastas', () => {
    expect(relTargetError('novo.txt')).toBe('')
    expect(relTargetError('src/utils/novo.ts')).toBe('')
  })
  it('rejeita vazio, absoluto e traversal', () => {
    expect(relTargetError('')).not.toBe('')
    expect(relTargetError('/etc/passwd')).not.toBe('')
    expect(relTargetError('../fora.txt')).not.toBe('')
    expect(relTargetError('a/../../fora')).not.toBe('')
  })
  it('rejeita segmento vazio ("a//b") e "." no meio', () => {
    expect(relTargetError('a//b')).not.toBe('')
    expect(relTargetError('./a')).not.toBe('')
  })
})

describe('joinUnderRoot', () => {
  it('junta raiz + relativo com uma barra só', () => {
    expect(joinUnderRoot('/r', 'a/b.txt')).toBe('/r/a/b.txt')
    expect(joinUnderRoot('/r/', 'a.txt')).toBe('/r/a.txt')
  })
})
