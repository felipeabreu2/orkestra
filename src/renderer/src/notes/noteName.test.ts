// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { deriveNoteName } from './noteName'

// Notas #10 · T1 — nome derivado da nota. `data.name` (nome personalizado) vence o conteúdo;
// sem nome, cai na 1ª linha do texto (htmlToText); sem nada, no fallback estável 'Nota'. Teto de
// 40 chars idêntico ao mirror atual (useOrchestrationSync) para não mudar o `orq list`.
describe('deriveNoteName', () => {
  it('nome fixo (data.name) vence o conteúdo', () => {
    expect(deriveNoteName({ name: 'Roadmap', html: '<p>outra coisa</p>' })).toBe('Roadmap')
  })

  it('nome em branco cai na 1ª linha do conteúdo', () => {
    expect(deriveNoteName({ name: '  ', html: '<p>Primeira linha\nsegunda</p>' })).toBe('Primeira linha')
  })

  it('sem nome nem conteúdo cai no fallback "Nota"', () => {
    expect(deriveNoteName({ html: '' })).toBe('Nota')
    expect(deriveNoteName({})).toBe('Nota')
  })

  it('trunca em 40 caracteres (nome e conteúdo)', () => {
    expect(deriveNoteName({ name: 'x'.repeat(60) })).toHaveLength(40)
    expect(deriveNoteName({ html: '<p>' + 'a'.repeat(60) + '</p>' })).toHaveLength(40)
  })
})
