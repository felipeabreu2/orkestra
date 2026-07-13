import { describe, it, expect } from 'vitest'
import { quotePathForShell, pathsToTerminalInput } from './dropPaths'

describe('quotePathForShell', () => {
  it('envolve o caminho em aspas simples', () => {
    expect(quotePathForShell('/Users/me/a.png')).toBe("'/Users/me/a.png'")
  })
  it('espaços e parênteses ficam seguros dentro das aspas', () => {
    expect(quotePathForShell('/Users/me/foto (1).png')).toBe("'/Users/me/foto (1).png'")
  })
  it('caminho com acento (unicode) é preservado', () => {
    expect(quotePathForShell('/Users/me/café.txt')).toBe("'/Users/me/café.txt'")
  })
  it('aspas simples internas são escapadas', () => {
    expect(quotePathForShell("/Users/me/it's.txt")).toBe("'/Users/me/it'\\''s.txt'")
  })
})

describe('pathsToTerminalInput', () => {
  it('junta múltiplos caminhos com espaço + espaço final', () => {
    expect(pathsToTerminalInput(['/a', '/b c'])).toBe("'/a' '/b c' ")
  })
  it('ignora entradas vazias', () => {
    expect(pathsToTerminalInput(['', '/a', ''])).toBe("'/a' ")
  })
  it('lista vazia devolve string vazia', () => {
    expect(pathsToTerminalInput([])).toBe('')
  })
})
