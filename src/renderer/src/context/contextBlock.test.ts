// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildContextBlock, htmlToText } from './contextBlock'

describe('buildContextBlock', () => {
  it('monta um bloco rotulado, sem Enter final que dispare o comando', () => {
    const b = buildContextBlock('nota', 'faça X')
    expect(b).toBe('[contexto — nota]\nfaça X\n')
  })
  it('conteúdo vazio vira string vazia (nada a injetar)', () => {
    expect(buildContextBlock('nota', '   ')).toBe('')
  })
})

describe('htmlToText', () => {
  it('extrai o texto de HTML do editor', () => {
    expect(htmlToText('<p>oi <strong>mundo</strong></p>')).toBe('oi mundo')
  })
  it('html vazio vira string vazia', () => {
    expect(htmlToText('')).toBe('')
  })
})
