import { describe, it, expect } from 'vitest'
import { markdownToHtml } from './markdownToHtml'

describe('markdownToHtml', () => {
  it('converte heading e parágrafo', () => {
    expect(markdownToHtml('# Oi\n\ntexto')).toBe('<h1>Oi</h1><p>texto</p>')
  })
  it('converte ênfases inline', () => {
    expect(markdownToHtml('**b** e *i* e `c`')).toBe('<p><strong>b</strong> e <em>i</em> e <code>c</code></p>')
  })
  it('escapa HTML no texto', () => {
    expect(markdownToHtml('a < b & c')).toBe('<p>a &lt; b &amp; c</p>')
  })
  it('lista não-ordenada', () => {
    expect(markdownToHtml('- um\n- dois')).toBe('<ul><li>um</li><li>dois</li></ul>')
  })
  it('string vazia vira string vazia', () => {
    expect(markdownToHtml('')).toBe('')
  })
})
