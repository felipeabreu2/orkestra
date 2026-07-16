import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDiffLines } from './fileTreeDiff'

// O parser é alimentado por `git diff` de VERDADE (repo real num tmpdir), não por um texto de diff
// escrito à mão: um fixture inventado poderia divergir do formato real e o teste passaria verde
// enquanto a UI mostrasse lixo. Mesmo idioma dos testes de FileTreeService.
function realDiff(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ork-diffparse-'))
  try {
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'src', 'a.ts'), 'const a = 1\nconst manter = 0\nconst b = 2\n')
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: dir })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
    writeFileSync(join(dir, 'src', 'a.ts'), 'const a = 9\nconst manter = 0\nconst b = 2\n')
    return execFileSync('git', ['-c', 'core.quotePath=false', '-C', dir, 'diff', 'HEAD'], {
      cwd: dir
    }).toString()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('parseDiffLines', () => {
  let diff: string
  beforeEach(() => {
    diff = realDiff()
  })
  afterEach(() => {
    diff = ''
  })

  it('classifica adicionadas/removidas/hunk/meta num diff real do git', () => {
    const lines = parseDiffLines(diff)
    const kinds = (k: string): string[] => lines.filter((l) => l.kind === k).map((l) => l.text)

    expect(kinds('add')).toContain('+const a = 9')
    expect(kinds('del')).toContain('-const a = 1')
    expect(kinds('hunk').some((t) => t.startsWith('@@'))).toBe(true)
    // `diff --git`, `index`, `--- a/…`, `+++ b/…` são cabeçalho, não conteúdo — e os headers de
    // arquivo NÃO podem virar add/del só por começarem com +/-.
    expect(kinds('meta').some((t) => t.startsWith('diff --git'))).toBe(true)
    expect(kinds('meta')).toContain('--- a/src/a.ts')
    expect(kinds('meta')).toContain('+++ b/src/a.ts')
    expect(kinds('add').some((t) => t.startsWith('+++'))).toBe(false)
    expect(kinds('del').some((t) => t.startsWith('---'))).toBe(false)
    // Linha de contexto (sem sinal) fica neutra, com o espaço inicial preservado.
    expect(kinds('ctx')).toContain(' const manter = 0')
  })

  it('devolve [] para texto vazio (sem alterações / fora de repo)', () => {
    expect(parseDiffLines('')).toEqual([])
    expect(parseDiffLines('\n')).toEqual([])
  })

  it('preserva a ordem original das linhas', () => {
    const lines = parseDiffLines(diff)
    expect(lines.map((l) => l.text)).toEqual(diff.split('\n').filter((l, i, a) => !(l === '' && i === a.length - 1)))
  })

  it('cada linha tem key estável e única (índice), inclusive com linhas de texto repetido', () => {
    const lines = parseDiffLines('+x\n+x\n+x')
    expect(lines.map((l) => l.key)).toEqual([0, 1, 2])
    expect(lines.every((l) => l.kind === 'add')).toBe(true)
  })

  it('trata \\r final (CRLF) sem sujar a classificação', () => {
    const lines = parseDiffLines('@@ -1 +1 @@\r\n-a\r\n+b\r')
    expect(lines.map((l) => l.kind)).toEqual(['hunk', 'del', 'add'])
  })
})
