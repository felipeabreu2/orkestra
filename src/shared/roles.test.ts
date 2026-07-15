import { describe, it, expect } from 'vitest'
import { PRESET_ROLES, roleMeta } from './roles'

describe('PRESET_ROLES', () => {
  it('tem os quatro papéis prontos com campos completos', () => {
    const ids = PRESET_ROLES.map((r) => r.id)
    expect(ids).toEqual(['lider', 'dev', 'revisor', 'testador'])
    for (const r of PRESET_ROLES) {
      expect(r.label.length).toBeGreaterThan(0)
      expect(r.color).toMatch(/^var\(--/)
      expect(r.hint.length).toBeGreaterThan(0)
    }
  })
})

describe('roleMeta', () => {
  it('resolve um preset pelo label (case-insensitive)', () => {
    expect(roleMeta('Líder').color).toBe('var(--accent)')
    expect(roleMeta('revisor').color).toBe('var(--paper-orange)')
    expect(roleMeta('DEV').label).toBe('Dev')
  })
  it('resolve um preset pelo id', () => {
    expect(roleMeta('testador').color).toBe('var(--paper-pink)')
  })
  it('papel personalizado tem cor neutra e mantém o texto como label', () => {
    const m = roleMeta('Arquiteto')
    expect(m.color).toBe('var(--text-2)')
    expect(m.label).toBe('Arquiteto')
    expect(m.hint).toBe('')
  })
  it('papel vazio é neutro', () => {
    expect(roleMeta('').color).toBe('var(--text-2)')
  })
  it('resolve pelo id em minúsculas e por label em maiúsculas (case-insensitive real)', () => {
    expect(roleMeta('lider').color).toBe('var(--accent)')   // bare id
    expect(roleMeta('LÍDER').color).toBe('var(--accent)')   // label uppercased (acentuado)
    expect(roleMeta('  dev  ').label).toBe('Dev')            // trim + match
  })
})
