import { describe, it, expect } from 'vitest'
import {
  classifyAgentStatus,
  lastNonEmptyLine,
  stripAnsi,
  toLines,
  type AgentStatus
} from './agentStatus'

describe('classifyAgentStatus — needs-input', () => {
  it('detecta prompt sim/não "(y/n)"', () => {
    expect(classifyAgentStatus(['Do you want to proceed? (y/n)'])).toBe('needs-input')
  })

  it('detecta "[y/N]"', () => {
    expect(classifyAgentStatus(['Overwrite existing file? [y/N]'])).toBe('needs-input')
  })

  it('detecta "(yes/no)"', () => {
    expect(classifyAgentStatus(['Continue? (yes/no)'])).toBe('needs-input')
  })

  it('detecta "press enter to continue"', () => {
    expect(classifyAgentStatus(['Press Enter to continue'])).toBe('needs-input')
  })

  it('detecta prompt de seleção estilo Claude Code "❯ 1. Yes  2. No"', () => {
    expect(classifyAgentStatus(['❯ 1. Yes  2. No'])).toBe('needs-input')
  })

  it('é case-insensitive', () => {
    expect(classifyAgentStatus(['DO YOU WANT TO PROCEED? (Y/N)'])).toBe('needs-input')
  })
})

describe('classifyAgentStatus — crashed', () => {
  it('detecta traceback do Python (multilinha)', () => {
    const lines = [
      'Traceback (most recent call last):',
      '  File "app.py", line 42, in <module>',
      'ValueError: boom'
    ]
    expect(classifyAgentStatus(lines)).toBe('crashed')
  })

  it('detecta "Error:"', () => {
    expect(classifyAgentStatus(['Error: ENOENT: no such file'])).toBe('crashed')
  })

  it('detecta "panic:"', () => {
    expect(classifyAgentStatus(['panic: runtime error'])).toBe('crashed')
  })

  it('detecta frame de stack "at ... (file:line:col)"', () => {
    expect(classifyAgentStatus(['    at Object.<anonymous> (/x/y.js:10:5)'])).toBe('crashed')
  })

  it('detecta o frame File "...", line N', () => {
    expect(classifyAgentStatus(['  File "app.py", line 42, in <module>'])).toBe('crashed')
  })

  it('detecta "Segmentation fault"', () => {
    expect(classifyAgentStatus(['Segmentation fault (core dumped)'])).toBe('crashed')
  })

  it('detecta "Exception:"', () => {
    expect(classifyAgentStatus(['Exception: something went wrong'])).toBe('crashed')
  })
})

describe('classifyAgentStatus — done', () => {
  it('texto normal sem marcas classifica como done', () => {
    expect(classifyAgentStatus(['Tudo pronto.', '- rodei os testes, tudo verde'])).toBe('done')
  })

  it('buffer vazio classifica como done', () => {
    expect(classifyAgentStatus([])).toBe('done')
  })
})

describe('classifyAgentStatus — precedência', () => {
  it('needs-input vence crashed (stack trace seguido de (y/n) → needs-input)', () => {
    const lines = [
      'Traceback (most recent call last):',
      '  File "app.py", line 42, in <module>',
      'ValueError: boom',
      'Do you want to proceed? (y/n)'
    ]
    expect(classifyAgentStatus(lines)).toBe('needs-input')
  })

  it('crashed vence done (stack trace + texto normal → crashed)', () => {
    const lines = ['Error: boom', 'ok tudo certo aqui', 'continuando o trabalho']
    expect(classifyAgentStatus(lines)).toBe('crashed')
  })

  it('needs-input vence done', () => {
    const lines = ['resumo do que fiz', 'Press Enter to continue']
    expect(classifyAgentStatus(lines)).toBe('needs-input')
  })
})

describe('lastNonEmptyLine', () => {
  it('retorna a última linha não-vazia', () => {
    expect(lastNonEmptyLine(['linha A', '', ''])).toBe('linha A')
  })

  it('retorna string vazia (nunca undefined) para lista vazia', () => {
    expect(lastNonEmptyLine([])).toBe('')
  })

  it('retorna string vazia quando só há linhas em branco/espaços', () => {
    expect(lastNonEmptyLine(['', '  '])).toBe('')
  })

  it('faz trim dos espaços da linha retornada', () => {
    expect(lastNonEmptyLine(['  com espaços  '])).toBe('com espaços')
  })
})

describe('stripAnsi / toLines', () => {
  it('stripAnsi remove sequências SGR/cor', () => {
    expect(stripAnsi('\x1b[32mok\x1b[0m')).toBe('ok')
  })

  it('toLines quebra por \\r?\\n depois de remover ANSI', () => {
    expect(toLines('a\r\nb\nc')).toEqual(['a', 'b', 'c'])
  })

  it('última linha visível a partir do buffer cru com escapes de repaint', () => {
    expect(lastNonEmptyLine(toLines('\x1b[2K\x1b[1G done\n'))).toBe('done')
  })
})

describe('AgentStatus type', () => {
  it('exporta os três valores possíveis', () => {
    const values: AgentStatus[] = ['needs-input', 'crashed', 'done']
    expect(values).toHaveLength(3)
  })
})
