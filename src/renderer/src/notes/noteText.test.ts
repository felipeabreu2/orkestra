// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { noteText } from './noteText'

// Notas — texto simples do corpo de uma nota, no shape REAL de produção: `addNoteNode` cria
// `data: { html: '', color: undefined }` e `updateNoteHtml` só escreve `html`. `data.content` é
// resíduo de notas antigas (pré-TipTap) — fallback de retrocompat, nunca o caminho principal.
describe('noteText', () => {
  it('deriva o texto do html (shape real: data.html)', () => {
    expect(noteText({ html: '<p>oi <strong>mundo</strong></p>' })).toBe('oi mundo')
  })

  it('cai em content quando não há html (nota legada)', () => {
    expect(noteText({ content: '  legado  ' })).toBe('legado')
  })

  it('html vence content quando ambos existem', () => {
    expect(noteText({ html: '<p>novo</p>', content: 'antigo' })).toBe('novo')
  })

  it('sem html nem content retorna string vazia', () => {
    expect(noteText({})).toBe('')
    expect(noteText({ html: '', color: undefined })).toBe('')
    expect(noteText(undefined)).toBe('')
  })
})
