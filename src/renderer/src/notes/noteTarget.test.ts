// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { resolveNoteTarget } from './noteTarget'

// Notas §5 — resolução determinística do `--to` do `orq note write`: id → data.name exato →
// prefixo do texto (fallback). Antes só havia id → prefixo do texto, e duas notas com o mesmo
// começo faziam o comando escrever na errada retornando `ok` (memória `orq-note-write-targeting`).
describe('resolveNoteTarget', () => {
  const a = { id: 'note-1', data: { html: '<p>TODO AGENT — pipeline</p>' } }
  const b = { id: 'note-2', data: { name: 'Backlog', html: '<p>TODO AGENT — deploy</p>' } }

  it('resolve por id exato', () => {
    expect(resolveNoteTarget([a, b], 'note-2')).toBe(b)
  })

  it('resolve por data.name exato (case-insensitive), mesmo com duplicata de prefixo de texto', () => {
    expect(resolveNoteTarget([a, b], 'Backlog')).toBe(b)
    expect(resolveNoteTarget([a, b], '  backlog ')).toBe(b)
  })

  it('data.name vence o prefixo do texto de outra nota', () => {
    // 'TODO AGENT' é prefixo do texto de `a` (a 1ª da lista), mas é o NOME de `c`: o nome ganha.
    const c = { id: 'note-3', data: { name: 'TODO AGENT', html: '<p>outra coisa</p>' } }
    expect(resolveNoteTarget([a, c], 'TODO AGENT')).toBe(c)
  })

  it('cai no prefixo do texto quando nada casa por id/nome', () => {
    expect(resolveNoteTarget([a, b], 'todo agent — deploy')).toBe(b)
  })

  it('sem alvo (ou alvo em branco) não resolve nada', () => {
    expect(resolveNoteTarget([a, b], undefined)).toBeUndefined()
    expect(resolveNoteTarget([a, b], '   ')).toBeUndefined()
  })

  it('alvo desconhecido não resolve nada (em vez de casar a primeira nota)', () => {
    expect(resolveNoteTarget([a, b], 'inexistente')).toBeUndefined()
  })
})
