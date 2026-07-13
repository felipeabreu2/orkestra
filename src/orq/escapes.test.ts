import { describe, it, expect } from 'vitest'
import { interpretEscapes } from './escapes'

describe('interpretEscapes', () => {
  it('deixa texto sem barra invertida intacto', () => {
    expect(interpretEscapes('hello world')).toBe('hello world')
    expect(interpretEscapes('')).toBe('')
  })

  it('interpreta os escapes nomeados (\\n \\r \\t \\e \\0)', () => {
    expect(interpretEscapes('a\\nb')).toBe('a\nb')
    expect(interpretEscapes('a\\rb')).toBe('a\rb')
    expect(interpretEscapes('a\\tb')).toBe('a\tb')
    expect(interpretEscapes('\\e')).toBe('\x1b')
    expect(interpretEscapes('\\0')).toBe('\x00')
  })

  it('interpreta \\xHH (dois dígitos hex)', () => {
    expect(interpretEscapes('\\x03')).toBe('\x03') // Ctrl+C
    expect(interpretEscapes('\\x1b[B')).toBe('\x1b[B') // seta pra baixo
    expect(interpretEscapes('\\xFF')).toBe('\xff') // hex maiúsculo
  })

  it('interpreta \\\\ como uma barra invertida literal', () => {
    expect(interpretEscapes('a\\\\b')).toBe('a\\b')
  })

  it('mantém literal uma barra invertida no fim da string', () => {
    expect(interpretEscapes('abc\\')).toBe('abc\\')
  })

  it('mantém literal \\x sem 2 dígitos hex à frente', () => {
    expect(interpretEscapes('\\xZZ')).toBe('\\xZZ')
    expect(interpretEscapes('\\x1')).toBe('\\x1')
  })

  it('mantém literal uma barra invertida seguida de caractere desconhecido', () => {
    expect(interpretEscapes('\\q')).toBe('\\q')
  })

  it('combina texto e escapes numa sequência de controle real', () => {
    // ESC seguido de "[A" (seta pra cima) usando a forma \e
    expect(interpretEscapes('\\e[A')).toBe('\x1b[A')
  })
})
