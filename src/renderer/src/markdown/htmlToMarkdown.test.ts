// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from './htmlToMarkdown'
import { markdownToHtml } from './markdownToHtml'

// Serializador HTML→Markdown (Notas · T3) — inverso do markdownToHtml, cobrindo o subconjunto que o
// editor TipTap emite (heading, p, strong/em, code inline, ul/ol, blockquote, hr, link, img, br).
describe('htmlToMarkdown', () => {
  it('heading vira #', () => {
    expect(htmlToMarkdown('<h1>Título</h1>')).toBe('# Título')
    expect(htmlToMarkdown('<h3>Sub</h3>')).toBe('### Sub')
  })

  it('parágrafo com ênfases inline', () => {
    expect(htmlToMarkdown('<p>a <strong>b</strong> <em>c</em> <code>d</code></p>')).toBe('a **b** *c* `d`')
  })

  it('listas não-ordenada e ordenada', () => {
    expect(htmlToMarkdown('<ul><li>x</li><li>y</li></ul>')).toBe('- x\n- y')
    expect(htmlToMarkdown('<ol><li>x</li></ol>')).toBe('1. x')
    expect(htmlToMarkdown('<ol><li>x</li><li>y</li></ol>')).toBe('1. x\n2. y')
  })

  it('listas com item embrulhado em <p> (saída real do TipTap)', () => {
    expect(htmlToMarkdown('<ul><li><p>x</p></li><li><p>y</p></li></ul>')).toBe('- x\n- y')
  })

  it('link só com href seguro', () => {
    expect(htmlToMarkdown('<a href="https://x">t</a>')).toBe('[t](https://x)')
    // href inseguro (javascript:) degrada para o texto, sem emitir o esquema perigoso.
    expect(htmlToMarkdown('<a href="javascript:alert(1)">t</a>')).toBe('t')
  })

  it('imagem vira ![alt](src)', () => {
    expect(htmlToMarkdown('<img src="https://x/a.png" alt="foto">')).toBe('![foto](https://x/a.png)')
    expect(htmlToMarkdown('<img src="https://x/a.png">')).toBe('![](https://x/a.png)')
  })

  it('citação e régua', () => {
    expect(htmlToMarkdown('<blockquote><p>ei</p></blockquote>')).toBe('> ei')
    expect(htmlToMarkdown('<hr>')).toBe('---')
  })

  it('bloco de código cercado', () => {
    expect(htmlToMarkdown('<pre><code>a\nb</code></pre>')).toBe('```\na\nb\n```')
  })

  it('span com cor (fora do subconjunto) degrada para texto', () => {
    expect(htmlToMarkdown('<p><span style="color: #f00">oi</span></p>')).toBe('oi')
  })

  it('nunca emite HTML cru — entidades decodificadas viram texto', () => {
    expect(htmlToMarkdown('<p>a &lt; b &amp; c</p>')).toBe('a < b & c')
  })

  it('string vazia vira string vazia', () => {
    expect(htmlToMarkdown('')).toBe('')
    expect(htmlToMarkdown('   ')).toBe('')
  })

  it('round-trip fraco: htmlToMarkdown(markdownToHtml(src)) === src', () => {
    const amostras = [
      '# Oi\n\ntexto',
      'a **b** *i* `c`',
      '- um\n- dois',
      '1. um\n2. dois',
      '## Título\n\nparágrafo com **negrito**\n\n- item',
      '[t](https://x)'
    ]
    for (const src of amostras) {
      expect(htmlToMarkdown(markdownToHtml(src)).trim()).toBe(src.trim())
    }
  })
})
