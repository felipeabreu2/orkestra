import { describe, it, expect } from 'vitest'
import { screenIsGenerating, WORKING_MARKER } from './generatingSignal'

describe('screenIsGenerating', () => {
  it('detecta a linha de status "esc to interrupt" durante geração', () => {
    const lines = [
      'algum texto de conversa acima',
      '✻ Herding… (12s · ↑ 1.5k tokens · esc to interrupt)'
    ]
    expect(screenIsGenerating(lines)).toBe(true)
  })

  it('não detecta o prompt ocioso pós-geração', () => {
    const lines = [
      'resposta anterior do agente',
      '',
      'auto mode on (shift+tab to cycle) · ← for agents'
    ]
    expect(screenIsGenerating(lines)).toBe(false)
  })

  it('não detecta texto de conversa qualquer sem a marca', () => {
    const lines = [
      'Aqui está o resumo do que fiz:',
      '- ajustei o arquivo X',
      '- rodei os testes, tudo verde'
    ]
    expect(screenIsGenerating(lines)).toBe(false)
  })

  it('é case-insensitive ("Esc To Interrupt")', () => {
    expect(screenIsGenerating(['Working… (Esc To Interrupt)'])).toBe(true)
  })

  it('buffer vazio nunca é generating', () => {
    expect(screenIsGenerating([])).toBe(false)
  })

  it('WORKING_MARKER casa em qualquer posição da linha, não só no início', () => {
    expect(WORKING_MARKER.test('prefixo qualquer esc to interrupt sufixo')).toBe(true)
  })
})
