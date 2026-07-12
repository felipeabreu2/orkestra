import { describe, it, expect } from 'vitest'
import { isSafeHref, parseInline, parseBlocks } from './markdown'

describe('isSafeHref', () => {
  it('aceita http, https, mailto, relativo e âncora', () => {
    expect(isSafeHref('https://a.com')).toBe(true)
    expect(isSafeHref('http://a.com')).toBe(true)
    expect(isSafeHref('mailto:x@y.com')).toBe(true)
    expect(isSafeHref('/docs/x')).toBe(true)
    expect(isSafeHref('#secao')).toBe(true)
    expect(isSafeHref('./rel.md')).toBe(true)
  })
  it('rejeita esquemas perigosos', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
    expect(isSafeHref('data:text/html,x')).toBe(false)
    expect(isSafeHref('file:///etc/passwd')).toBe(false)
    expect(isSafeHref('vbscript:x')).toBe(false)
  })
})

describe('parseInline', () => {
  it('texto puro vira um único span de texto', () => {
    expect(parseInline('olá mundo')).toEqual([{ type: 'text', value: 'olá mundo' }])
  })
  it('reconhece negrito, itálico e código', () => {
    expect(parseInline('a **b** c')).toEqual([
      { type: 'text', value: 'a ' }, { type: 'strong', value: 'b' }, { type: 'text', value: ' c' }
    ])
    expect(parseInline('um *dois*')).toEqual([
      { type: 'text', value: 'um ' }, { type: 'em', value: 'dois' }
    ])
    expect(parseInline('use `code` aqui')).toEqual([
      { type: 'text', value: 'use ' }, { type: 'code', value: 'code' }, { type: 'text', value: ' aqui' }
    ])
  })
  it('itálico com underscore', () => {
    expect(parseInline('_ok_')).toEqual([{ type: 'em', value: 'ok' }])
  })
  it('link seguro vira span de link; link inseguro vira texto', () => {
    expect(parseInline('veja [aqui](https://x.com)')).toEqual([
      { type: 'text', value: 'veja ' }, { type: 'link', text: 'aqui', href: 'https://x.com' }
    ])
    expect(parseInline('[x](javascript:alert(1))')).toEqual([
      { type: 'text', value: '[x](javascript:alert(1))' }
    ])
  })
  it('código inline preserva asteriscos internos (não os interpreta)', () => {
    expect(parseInline('`a*b*c`')).toEqual([{ type: 'code', value: 'a*b*c' }])
  })
})

describe('parseBlocks', () => {
  it('título com nível pelo número de #', () => {
    expect(parseBlocks('## Olá')).toEqual([
      { type: 'heading', level: 2, spans: [{ type: 'text', value: 'Olá' }] }
    ])
  })
  it('parágrafos separados por linha em branco; linhas contíguas juntam', () => {
    const b = parseBlocks('linha um\nlinha dois\n\nsegundo')
    expect(b).toEqual([
      { type: 'paragraph', spans: [{ type: 'text', value: 'linha um linha dois' }] },
      { type: 'paragraph', spans: [{ type: 'text', value: 'segundo' }] }
    ])
  })
  it('bloco de código cercado por ``` preserva conteúdo e lang', () => {
    const b = parseBlocks('```ts\nconst a = 1\n```')
    expect(b).toEqual([{ type: 'code', value: 'const a = 1', lang: 'ts' }])
  })
  it('lista não-ordenada e ordenada', () => {
    expect(parseBlocks('- um\n- dois')).toEqual([
      { type: 'list', ordered: false, items: [[{ type: 'text', value: 'um' }], [{ type: 'text', value: 'dois' }]] }
    ])
    expect(parseBlocks('1. a\n2. b')).toEqual([
      { type: 'list', ordered: true, items: [[{ type: 'text', value: 'a' }], [{ type: 'text', value: 'b' }]] }
    ])
  })
  it('citação e regra horizontal', () => {
    expect(parseBlocks('> nota')).toEqual([
      { type: 'quote', spans: [{ type: 'text', value: 'nota' }] }
    ])
    expect(parseBlocks('---')).toEqual([{ type: 'hr' }])
  })
  it('texto vazio vira lista vazia de blocos', () => {
    expect(parseBlocks('')).toEqual([])
    expect(parseBlocks('   \n  \n')).toEqual([])
  })
  it('mistura títulos, listas e parágrafos na ordem correta', () => {
    const b = parseBlocks('# T\n\ntexto\n\n- a\n- b')
    expect(b.map((x) => x.type)).toEqual(['heading', 'paragraph', 'list'])
  })
})
