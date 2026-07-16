import { describe, it, expect } from 'vitest'
import {
  serializeRoleSidecar,
  parseRoleSidecar,
  buildRoleSidecar,
  isSafeNodeId,
  sidecarMatchesRole
} from './roleSidecar'
import { buildRolePrompt } from './rolePrompt'
import { roleMeta } from './roles'

describe('serializeRoleSidecar', () => {
  it('produz JSON com as 3 chaves do sidecar do Maestri (name/color/prompt)', () => {
    const json = serializeRoleSidecar({ name: 'Revisor', color: 'var(--paper-amber)', prompt: 'revise tudo' })
    expect(JSON.parse(json)).toEqual({ name: 'Revisor', color: 'var(--paper-amber)', prompt: 'revise tudo' })
  })

  it('não inclui chaves além das 3 (shape estável para interoperabilidade)', () => {
    const json = serializeRoleSidecar({ name: 'Dev', color: 'var(--paper-teal)', prompt: 'p' })
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(['color', 'name', 'prompt'])
  })
})

describe('parseRoleSidecar', () => {
  it('faz round-trip com o serializador', () => {
    const s = { name: 'Testador', color: 'var(--paper-pink)', prompt: 'teste os limites' }
    expect(parseRoleSidecar(serializeRoleSidecar(s))).toEqual(s)
  })

  it('devolve null (nunca lança) para entradas inválidas', () => {
    expect(parseRoleSidecar('{}')).toBeNull()
    expect(parseRoleSidecar('não-json')).toBeNull()
    expect(parseRoleSidecar('')).toBeNull()
    expect(parseRoleSidecar('null')).toBeNull()
    expect(parseRoleSidecar('[]')).toBeNull()
    expect(parseRoleSidecar('"só uma string"')).toBeNull()
    expect(parseRoleSidecar(null)).toBeNull()
    expect(parseRoleSidecar(undefined)).toBeNull()
    expect(parseRoleSidecar(42 as unknown as string)).toBeNull()
  })

  it('devolve null quando alguma das 3 chaves falta ou não é string', () => {
    expect(parseRoleSidecar('{"name":"Dev","color":"c"}')).toBeNull()
    expect(parseRoleSidecar('{"name":"Dev","color":"c","prompt":42}')).toBeNull()
    expect(parseRoleSidecar('{"name":null,"color":"c","prompt":"p"}')).toBeNull()
  })

  it('aceita prompt vazio (papel livre sem instrução) e ignora chaves extras', () => {
    expect(parseRoleSidecar('{"name":"Arquiteto","color":"var(--text-2)","prompt":"","x":1}')).toEqual({
      name: 'Arquiteto',
      color: 'var(--text-2)',
      prompt: ''
    })
  })
})

describe('buildRoleSidecar', () => {
  it('deriva name/color de roleMeta e prompt de buildRolePrompt (fonte única)', () => {
    expect(buildRoleSidecar('dev')).toEqual({
      name: roleMeta('dev').label,
      color: roleMeta('dev').color,
      prompt: buildRolePrompt('dev')
    })
  })

  it('resolve papel por label e case-insensitive, como roleMeta', () => {
    expect(buildRoleSidecar('  REVISOR ')).toEqual(buildRoleSidecar('revisor'))
  })

  it('papel livre vira sidecar com prompt vazio (o nome ainda é metadado útil)', () => {
    expect(buildRoleSidecar('Arquiteto')).toEqual({ name: 'Arquiteto', color: 'var(--text-2)', prompt: '' })
  })

  it('devolve null quando não há papel (nada a gravar)', () => {
    expect(buildRoleSidecar('')).toBeNull()
    expect(buildRoleSidecar('   ')).toBeNull()
  })
})

// T4b — o casamento sidecar↔papel do nó é o que decide se o refino do agente (orq role write)
// sobrevive ao próximo spawn ou se o prompt é regenerado do papel novo. Puro aqui; o I/O e a
// precedência vivem no registerPtyIpc.
describe('sidecarMatchesRole', () => {
  it('casa quando o name do sidecar é o papel atual do nó', () => {
    expect(sidecarMatchesRole({ name: 'Dev', color: 'c', prompt: 'p' }, 'dev')).toBe(true)
  })

  it('resolve os dois lados por roleMeta (id ou label, case-insensitive, trim)', () => {
    expect(sidecarMatchesRole({ name: 'dev', color: 'c', prompt: 'p' }, '  DEV ')).toBe(true)
    expect(sidecarMatchesRole({ name: 'Dev', color: 'c', prompt: 'p' }, 'Dev')).toBe(true)
  })

  it('NÃO casa quando o papel do nó foi trocado (sidecar do papel antigo)', () => {
    expect(sidecarMatchesRole({ name: 'Dev', color: 'c', prompt: 'p' }, 'revisor')).toBe(false)
  })

  it('casa papel livre/importado pelo nome (não-preset)', () => {
    expect(sidecarMatchesRole({ name: 'Arquiteto', color: 'c', prompt: 'p' }, 'Arquiteto')).toBe(true)
    expect(sidecarMatchesRole({ name: 'Arquiteto', color: 'c', prompt: 'p' }, 'Auditor')).toBe(false)
  })

  it('não casa sem sidecar, sem papel, ou com name vazio', () => {
    expect(sidecarMatchesRole(null, 'dev')).toBe(false)
    expect(sidecarMatchesRole({ name: 'Dev', color: 'c', prompt: 'p' }, '')).toBe(false)
    expect(sidecarMatchesRole({ name: 'Dev', color: 'c', prompt: 'p' }, '   ')).toBe(false)
    expect(sidecarMatchesRole({ name: '', color: 'c', prompt: 'p' }, 'dev')).toBe(false)
  })
})

describe('isSafeNodeId', () => {
  it('aceita o formato gerado pelo canvas (terminal-<uuid>)', () => {
    expect(isSafeNodeId('terminal-abc123')).toBe(true)
    expect(isSafeNodeId('terminal-7f3e2a10-4b1c-4f9a-9c2d-8e6b5a4d3c2b')).toBe(true)
  })

  it('rejeita qualquer coisa que vire path traversal ou caminho absoluto', () => {
    expect(isSafeNodeId('../../../etc')).toBe(false)
    expect(isSafeNodeId('..')).toBe(false)
    expect(isSafeNodeId('a/b')).toBe(false)
    expect(isSafeNodeId('a\\b')).toBe(false)
    expect(isSafeNodeId('/abs')).toBe(false)
    expect(isSafeNodeId('a.b')).toBe(false)
    expect(isSafeNodeId('')).toBe(false)
    expect(isSafeNodeId(undefined)).toBe(false)
    expect(isSafeNodeId(42 as unknown as string)).toBe(false)
  })
})
