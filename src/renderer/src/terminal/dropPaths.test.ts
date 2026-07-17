import { describe, it, expect } from 'vitest'
import {
  quotePathForShell,
  pathsToTerminalInput,
  readDroppedPaths,
  ORKESTRA_PATH_MIME
} from './dropPaths'

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
  it('um único caminho com espaço fica seguro dentro das aspas', () => {
    expect(pathsToTerminalInput(['/a b/c.ts'])).toBe("'/a b/c.ts' ")
  })
})

describe('readDroppedPaths', () => {
  it('drag interno da árvore: lê o caminho do MIME próprio', () => {
    const dt = { types: [ORKESTRA_PATH_MIME], getData: () => '/a b/c.ts', files: [] }
    expect(readDroppedPaths(dt)).toEqual(['/a b/c.ts'])
  })
  it('MIME interno presente mas vazio devolve []', () => {
    const dt = { types: [ORKESTRA_PATH_MIME], getData: () => '', files: [] }
    expect(readDroppedPaths(dt)).toEqual([])
  })
  it('sem MIME e sem arquivos devolve []', () => {
    const dt = { types: [], getData: () => '', files: [] }
    expect(readDroppedPaths(dt)).toEqual([])
  })
  it('drop externo (Finder): resolve cada File via o resolvedor do chamador, ignorando vazios', () => {
    const f1 = { name: 'a' } as unknown as File
    const f2 = { name: 'b' } as unknown as File
    const resolve = (f: File): string => ((f as unknown as { name: string }).name === 'a' ? '/x/a' : '')
    const dt = { types: ['Files'], getData: () => '', files: [f1, f2] }
    expect(readDroppedPaths(dt, resolve)).toEqual(['/x/a'])
  })
  it('MIME interno tem prioridade sobre arquivos externos presentes', () => {
    const f1 = { name: 'a' } as unknown as File
    const dt = { types: [ORKESTRA_PATH_MIME, 'Files'], getData: () => '/interno', files: [f1] }
    expect(readDroppedPaths(dt, () => '/externo')).toEqual(['/interno'])
  })
})
