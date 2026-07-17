import { describe, it, expect } from 'vitest'
import { normalizeNoteName } from './noteRename'

// Notas #10 · T2 — normalização do nome digitado no rename inline da nota. Apara pontas, colapsa
// espaços internos, corta em 40; string vazia → '' (sinal de "voltar à nomeação automática pela
// 1ª linha", tratado por updateNoteName no store apagando data.name).
describe('normalizeNoteName', () => {
  it('apara pontas e colapsa espaços internos', () => {
    expect(normalizeNoteName('  Meu   Plano  ')).toBe('Meu Plano')
  })

  it('string vazia (ou só espaços) vira "" (voltar ao automático)', () => {
    expect(normalizeNoteName('')).toBe('')
    expect(normalizeNoteName('   ')).toBe('')
  })

  it('trunca em 40 caracteres', () => {
    expect(normalizeNoteName('a'.repeat(60))).toHaveLength(40)
  })
})
