// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { noteHtmlToRaw, noteRawToHtml } from './noteRawSync'

// Toggle raw ↔ formatada (Notas · T7). Conversões puras entre o HTML do editor e o Markdown cru
// mostrado no textarea. O round-trip é estável só para as marcas suportadas pelo T3; marcas fora
// dele (cor/fonte, imagem) se perdem — risco documentado.
describe('noteRawSync', () => {
  it('texto sem formatação sobrevive intacto ida-e-volta', () => {
    expect(noteHtmlToRaw('<p>apenas texto</p>')).toBe('apenas texto')
    expect(noteRawToHtml('apenas texto')).toBe('<p>apenas texto</p>')
  })

  it('round-trip estável (html → raw → html) para marcas suportadas', () => {
    const amostras = [
      '<h1>Oi</h1><p>texto</p>',
      '<p>a <strong>b</strong> <em>i</em> <code>c</code></p>',
      '<ul><li>x</li><li>y</li></ul>',
      '<ol><li>x</li><li>y</li></ol>'
    ]
    for (const html of amostras) {
      expect(noteRawToHtml(noteHtmlToRaw(html))).toBe(html)
    }
  })

  it('editar o Markdown cru reflete no HTML formatado', () => {
    expect(noteRawToHtml('# Novo título')).toBe('<h1>Novo título</h1>')
  })

  it('html vazio vira raw vazio e vice-versa', () => {
    expect(noteHtmlToRaw('')).toBe('')
    expect(noteRawToHtml('')).toBe('')
  })
})
