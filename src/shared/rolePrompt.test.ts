import { describe, it, expect } from 'vitest'
import { buildRolePrompt } from './rolePrompt'
import { PRESET_ROLES } from './roles'

describe('buildRolePrompt', () => {
  it('emoldura o papel conhecido com o label e o texto do prompt', () => {
    const out = buildRolePrompt('dev')
    // framing traz o label (para o agente saber "quem é")
    expect(out).toContain('Dev')
    // e o prompt de instrução do preset (sem reimplementar o texto)
    const dev = PRESET_ROLES.find((r) => r.id === 'dev')!
    expect(out).toContain(dev.prompt)
  })
  it('papel vazio → string vazia (sem papel, sem injeção — idempotência)', () => {
    expect(buildRolePrompt('')).toBe('')
    expect(buildRolePrompt('   ')).toBe('')
  })
  it('papel livre sem prompt → string vazia (degradação amigável)', () => {
    expect(buildRolePrompt('Arquiteto')).toBe('')
  })
  it('resolve case-insensitive como roleMeta', () => {
    expect(buildRolePrompt('LÍDER')).toBe(buildRolePrompt('lider'))
    expect(buildRolePrompt('LÍDER').length).toBeGreaterThan(0)
  })
  it('é pura e determinística (mesma entrada → mesma saída)', () => {
    expect(buildRolePrompt('revisor')).toBe(buildRolePrompt('revisor'))
  })
  it('não emite quebras de linha (arranque digitável no PTY)', () => {
    expect(buildRolePrompt('testador')).not.toContain('\n')
  })
})
