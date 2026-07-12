import { describe, it, expect } from 'vitest'
import { stripAnsi } from './ansi'

describe('stripAnsi', () => {
  it('remove cores/SGR mantendo o texto', () => {
    expect(stripAnsi('\x1b[31mvermelho\x1b[0m')).toBe('vermelho')
  })
  it('remove movimentos de cursor e limpeza de linha', () => {
    expect(stripAnsi('a\x1b[2K\x1b[1Gb')).toBe('ab')
  })
  it('remove sequências OSC (título) terminadas por BEL', () => {
    expect(stripAnsi('\x1b]0;titulo\x07texto')).toBe('texto')
  })
  it('preserva quebras de linha, tabs e retorno de carro', () => {
    expect(stripAnsi('linha1\nlinha2\tx')).toBe('linha1\nlinha2\tx')
  })
  it('texto sem escapes fica intacto', () => {
    expect(stripAnsi('olá mundo')).toBe('olá mundo')
  })
})
