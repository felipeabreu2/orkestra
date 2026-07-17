import { describe, it, expect } from 'vitest'
import { parseRoleCommand } from './role'

describe('parseRoleCommand', () => {
  it('show devolve a ação e o nome do alvo', () => {
    expect(parseRoleCommand(['role', 'show', 'Revisor'])).toEqual({ action: 'show', name: 'Revisor' })
  })

  it('write junta o resto das palavras num único prompt', () => {
    expect(parseRoleCommand(['role', 'write', 'Revisor', 'novo prompt inteiro'])).toEqual({
      action: 'write',
      name: 'Revisor',
      prompt: 'novo prompt inteiro'
    })
    // Sem aspas o shell entrega palavra a palavra — a junção tem de dar o MESMO prompt.
    expect(parseRoleCommand(['role', 'write', 'Revisor', 'novo', 'prompt', 'inteiro'])).toEqual({
      action: 'write',
      name: 'Revisor',
      prompt: 'novo prompt inteiro'
    })
  })

  it('edit devolve as duas substrings (de/para)', () => {
    expect(parseRoleCommand(['role', 'edit', 'Revisor', 'antigo', 'novo'])).toEqual({
      action: 'edit',
      name: 'Revisor',
      from: 'antigo',
      to: 'novo'
    })
  })

  it('sem subcomando, subcomando desconhecido ou argumentos faltando → usage', () => {
    expect(parseRoleCommand(['role'])).toEqual({ action: 'usage' })
    expect(parseRoleCommand(['role', 'delete', 'Revisor'])).toEqual({ action: 'usage' })
    expect(parseRoleCommand(['role', 'show'])).toEqual({ action: 'usage' })
    expect(parseRoleCommand(['role', 'write', 'Revisor'])).toEqual({ action: 'usage' })
    expect(parseRoleCommand(['role', 'edit', 'Revisor', 'antigo'])).toEqual({ action: 'usage' })
  })

  it('to vazio é aceito em edit (remover uma substring é uma edição legítima)', () => {
    expect(parseRoleCommand(['role', 'edit', 'Revisor', 'antigo', ''])).toEqual({
      action: 'edit',
      name: 'Revisor',
      from: 'antigo',
      to: ''
    })
  })
})
