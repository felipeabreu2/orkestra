import { describe, it, expect } from 'vitest'
import { applyRoleEdit, resolveRoleSidecar } from './roleEdit'
import { serializeRoleSidecar, buildRoleSidecar } from './roleSidecar'

describe('applyRoleEdit', () => {
  it('substitui UMA ocorrência da substring', () => {
    expect(applyRoleEdit('a b a', 'a', 'X')).toBe('X b a')
  })

  it('from ausente no texto → devolve o texto original (idempotente, sem lançar)', () => {
    expect(applyRoleEdit('prompt original', 'inexistente', 'X')).toBe('prompt original')
  })

  it('from vazio → devolve o texto original (evita inserção no índice 0 por acidente)', () => {
    expect(applyRoleEdit('prompt original', '', 'X')).toBe('prompt original')
  })

  it('trata o from como texto LITERAL, não regex', () => {
    expect(applyRoleEdit('custo: $1 (a|b)', '(a|b)', 'c')).toBe('custo: $1 c')
  })

  it('trata o to como texto LITERAL ($& e $1 não são expandidos)', () => {
    expect(applyRoleEdit('foo bar', 'foo', '$&$1')).toBe('$&$1 bar')
  })

  it('to vazio remove a substring', () => {
    expect(applyRoleEdit('foo bar', 'foo ', '')).toBe('bar')
  })
})

describe('resolveRoleSidecar', () => {
  // O sidecar em disco é a fonte primária — e chega aqui como o texto REAL que o
  // serializeRoleSidecar de produção grava, não um shape inventado pelo teste.
  it('usa o sidecar do disco quando ele existe e é válido', () => {
    const raw = serializeRoleSidecar({ name: 'Dev', color: 'var(--paper-teal)', prompt: 'refinado à mão' })
    expect(resolveRoleSidecar(raw, { name: 'T1', role: 'dev' })).toEqual({
      name: 'Dev',
      color: 'var(--paper-teal)',
      prompt: 'refinado à mão'
    })
  })

  it('sem arquivo (ou com lixo em disco) deriva do papel do nó — mesmo shape do spawn', () => {
    const derived = buildRoleSidecar('dev')
    expect(resolveRoleSidecar(null, { name: 'T1', role: 'dev' })).toEqual(derived)
    expect(resolveRoleSidecar('{lixo', { name: 'T1', role: 'dev' })).toEqual(derived)
  })

  it('nó sem papel e sem arquivo → sidecar mínimo com o nome do nó e prompt vazio', () => {
    expect(resolveRoleSidecar(null, { name: 'T1' })).toEqual({
      name: 'T1',
      color: 'var(--text-2)',
      prompt: ''
    })
  })
})
