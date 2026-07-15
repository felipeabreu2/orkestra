import { describe, it, expect } from 'vitest'
import { planRoleInjection } from './roleInjection'
import { buildRolePrompt } from './rolePrompt'

describe('planRoleInjection', () => {
  it('shell não é agente → none', () => {
    expect(planRoleInjection({ preset: 'shell', role: 'dev' })).toEqual({ kind: 'none' })
  })
  it('preset de agente sem papel → none', () => {
    expect(planRoleInjection({ preset: 'claude', role: '' })).toEqual({ kind: 'none' })
    expect(planRoleInjection({ preset: 'claude', role: '   ' })).toEqual({ kind: 'none' })
  })
  it('claude + papel → arquivo CLAUDE.md com a instrução de arranque', () => {
    expect(planRoleInjection({ preset: 'claude', role: 'dev' })).toEqual({
      kind: 'file',
      filename: 'CLAUDE.md',
      content: buildRolePrompt('dev')
    })
  })
  it('codex e gemini → AGENTS.md (mapa preset→arquivo)', () => {
    expect(planRoleInjection({ preset: 'gemini', role: 'revisor' })).toEqual({
      kind: 'file',
      filename: 'AGENTS.md',
      content: buildRolePrompt('revisor')
    })
    expect(planRoleInjection({ preset: 'codex', role: 'revisor' })).toEqual({
      kind: 'file',
      filename: 'AGENTS.md',
      content: buildRolePrompt('revisor')
    })
  })
  it('content === buildRolePrompt(role) (reusa o builder de T1, sem reimplementar)', () => {
    const plan = planRoleInjection({ preset: 'claude', role: 'testador' })
    if (plan.kind !== 'file') throw new Error('esperava kind: file')
    expect(plan.content).toBe(buildRolePrompt('testador'))
  })
  it('papel livre sem prompt → none (mesmo em preset de agente)', () => {
    expect(planRoleInjection({ preset: 'claude', role: 'Arquiteto' })).toEqual({ kind: 'none' })
  })
  it('preset ausente/desconhecido → none (sem arquivo de contexto)', () => {
    expect(planRoleInjection({ role: 'dev' })).toEqual({ kind: 'none' })
    expect(planRoleInjection({ preset: 'desconhecido', role: 'dev' })).toEqual({ kind: 'none' })
  })
})
