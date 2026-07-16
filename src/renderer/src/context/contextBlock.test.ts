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
  // Onda 3 · T12: citar um hunk do modo Diff reusa ESTE mesmo montador — o que muda é só o rótulo
  // ("diff — <arquivo>", montado por diffQuoteLabel). Nada de Enter: o \n final é a quebra do texto,
  // o usuário revisa e dispara. Um `+`/`-` no começo do conteúdo não é escapado nem interpretado.
  it('monta o bloco de um hunk de diff, rotulado e sem Enter final', () => {
    expect(buildContextBlock('diff — src/a.ts', '@@ -1 +1 @@\n-old\n+new')).toBe(
      '[contexto — diff — src/a.ts]\n@@ -1 +1 @@\n-old\n+new\n'
    )
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
