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
  // SEC-1 (auditoria 2026-07-14): o parse tem de ser INERTE — nada de executar HTML perigoso nem
  // vazar atributos como texto. Garante que só o texto visível sai (o <img onerror> não vira texto
  // e, no Chromium real, não dispararia — parseFromString não carrega recursos nem roda scripts).
  it('ignora HTML perigoso e devolve só o texto visível', () => {
    expect(htmlToText('<img src=x onerror="whatever">')).toBe('')
    expect(htmlToText('<p>seguro</p><img src=x onerror="alert(1)">')).toBe('seguro')
  })
})
