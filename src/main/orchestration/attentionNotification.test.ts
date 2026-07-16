import { describe, it, expect } from 'vitest'
import { buildAttentionNotification } from './attentionNotification'

// Ombro T4 (docs/planejamento/ombro.md): função PURA que monta o {title, body} da Notification
// nativa a partir do nome do agente + buffer cru. Reusa classifyAgentStatus/lastNonEmptyLine/toLines
// da T3 (src/shared/agentStatus.ts). Mesmo estilo de TDD denso de generatingSignal.test.ts.
describe('buildAttentionNotification', () => {
  it('needs-input: título "<nome> precisa de você" + prévia da última linha', () => {
    const out = buildAttentionNotification({
      agentName: 'Revisor',
      bufferText: 'trabalhei um pouco\nDo you want to proceed? (y/n)'
    })
    expect(out).toEqual({
      title: 'Revisor precisa de você',
      body: 'Do you want to proceed? (y/n)'
    })
  })

  it('crashed: título "<nome> travou" + última linha não-vazia (ex.: ValueError)', () => {
    const out = buildAttentionNotification({
      agentName: 'Revisor',
      bufferText: 'Traceback (most recent call last):\n  File "app.py", line 42, in <module>\nValueError: boom'
    })
    expect(out.title).toBe('Revisor travou')
    expect(out.body).toBe('ValueError: boom')
  })

  it('done (buffer normal): título "<nome> ficou ocioso" + última linha não-vazia', () => {
    const out = buildAttentionNotification({
      agentName: 'Dev',
      bufferText: 'Tudo pronto.\n- rodei os testes, tudo verde\n'
    })
    expect(out.title).toBe('Dev ficou ocioso')
    expect(out.body).toBe('- rodei os testes, tudo verde')
  })

  it('done com buffer vazio → corpo padrão, nunca undefined', () => {
    const out = buildAttentionNotification({ agentName: 'Dev', bufferText: '' })
    expect(out.title).toBe('Dev ficou ocioso')
    expect(out.body).toBe('Um agente parou e pode precisar de você.')
  })

  it('agentName ausente/vazio → usa "Agente" como fallback', () => {
    expect(buildAttentionNotification({ bufferText: '' }).title).toBe('Agente ficou ocioso')
    expect(buildAttentionNotification({ agentName: '   ', bufferText: '' }).title).toBe('Agente ficou ocioso')
  })

  it('trima o nome do agente no título', () => {
    expect(buildAttentionNotification({ agentName: '  Dev  ', bufferText: '' }).title).toBe('Dev ficou ocioso')
  })

  it('trunca o body a ~140 chars (linha longa não vira corpo gigante)', () => {
    const longLine = 'x'.repeat(400)
    const out = buildAttentionNotification({ agentName: 'Dev', bufferText: longLine })
    expect(out.body.length).toBeLessThanOrEqual(140)
  })

  it('limpa ANSI do buffer cru antes de extrair a prévia', () => {
    const out = buildAttentionNotification({ agentName: 'Dev', bufferText: '\x1b[2K\x1b[1G done\n' })
    expect(out.body).toBe('done')
  })

  it('precedência: needs-input vence crashed (stack trace seguido de prompt (y/n))', () => {
    const out = buildAttentionNotification({
      agentName: 'Dev',
      bufferText: 'Traceback (most recent call last):\nValueError: boom\nContinue? (y/n)'
    })
    expect(out.title).toBe('Dev precisa de você')
  })

  // REGRESSÃO (bug do Ombro): agentBus.read devolve o buffer append-only da SESSÃO INTEIRA (teto de
  // 8000 chars). Um marker antigo — respondido/superado minutos atrás — grudava para sempre e fazia
  // TODO disparo posterior mentir ("precisa de você"/"travou") mesmo com o agente terminando limpo.
  // O status é sobre o ESTADO ATUAL: só as últimas linhas do buffer podem decidi-lo.
  it('marker (y/n) ANTIGO + saída limpa recente → done (não gruda na sessão inteira)', () => {
    const bufferText = [
      'Do you want to proceed? (y/n)',
      'y',
      ...Array.from({ length: 60 }, (_, i) => `[build] compilando módulo ${i}`),
      'Tudo pronto.',
      '- rodei os testes, tudo verde',
      ''
    ].join('\n')
    const out = buildAttentionNotification({ agentName: 'Dev', bufferText })
    expect(out.title).toBe('Dev ficou ocioso')
    expect(out.body).toBe('- rodei os testes, tudo verde')
  })

  it('"Error:" ANTIGO + saída limpa recente → done (não vira "travou" para sempre)', () => {
    const bufferText = [
      'Error: ENOENT: no such file',
      ...Array.from({ length: 60 }, (_, i) => `[retry] baixando dependência ${i}`),
      'Concluído sem erros.',
      ''
    ].join('\n')
    const out = buildAttentionNotification({ agentName: 'Dev', bufferText })
    expect(out.title).toBe('Dev ficou ocioso')
    expect(out.body).toBe('Concluído sem erros.')
  })

  it('marker RECENTE (dentro da janela) continua detectado', () => {
    const bufferText = [
      ...Array.from({ length: 200 }, (_, i) => `[build] compilando módulo ${i}`),
      'Do you want to proceed? (y/n)',
      ''
    ].join('\n')
    const out = buildAttentionNotification({ agentName: 'Dev', bufferText })
    expect(out.title).toBe('Dev precisa de você')
  })

  it('crash RECENTE no fim de um buffer longo continua detectado', () => {
    const bufferText = [
      ...Array.from({ length: 200 }, (_, i) => `[build] compilando módulo ${i}`),
      'Traceback (most recent call last):',
      '  File "app.py", line 42, in <module>',
      'ValueError: boom',
      ''
    ].join('\n')
    const out = buildAttentionNotification({ agentName: 'Dev', bufferText })
    expect(out.title).toBe('Dev travou')
    expect(out.body).toBe('ValueError: boom')
  })
})
