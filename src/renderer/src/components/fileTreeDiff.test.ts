import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDiffLines, diffHunkAt, diffQuoteLabel } from './fileTreeDiff'

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

// Diff real com DOIS arquivos e DOIS hunks no segundo — o formato que o agrupamento por hunk da
// T12 tem de aguentar (fronteira entre hunks do mesmo arquivo E fronteira entre arquivos). Também
// exercita um arquivo APAGADO, onde `+++ /dev/null` obriga a cair no `--- a/…` para nomear o hunk.
function realMultiFileDiff(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ork-diffhunk-'))
  try {
    mkdirSync(join(dir, 'src'))
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: dir })
    }
    const linhas = (primeira: string, ultima: string): string =>
      [primeira, ...Array.from({ length: 11 }, (_, i) => `l${i + 2}`), ultima].join('\n') + '\n'
    writeFileSync(join(dir, 'src', 'a.ts'), linhas('export const a = 1', 'l13'))
    writeFileSync(join(dir, 'README.md'), '# readme\n')
    writeFileSync(join(dir, 'src', 'velho.ts'), 'const velho = 1\n')
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
    // Duas alterações distantes no mesmo arquivo => dois hunks `@@` separados.
    writeFileSync(join(dir, 'src', 'a.ts'), linhas('export const a = 2', 'l13 MUDOU'))
    writeFileSync(join(dir, 'README.md'), '# readme 2\n')
    g(['rm', '-q', join(dir, 'src', 'velho.ts')])
    return execFileSync('git', ['-c', 'core.quotePath=false', '-C', dir, 'diff', 'HEAD'], {
      cwd: dir
    }).toString()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('diffQuoteLabel', () => {
  // Formato fixado pelo plano da T12. O caminho fica RELATIVO ao repo (como o git o emite): é o
  // vocabulário que o agente do outro lado entende, e não vaza o home do usuário no prompt.
  it('rotula a citação no formato do plano', () => {
    expect(diffQuoteLabel('src/a.ts')).toBe('diff — src/a.ts')
  })
})

describe('diffHunkAt', () => {
  let lines: ReturnType<typeof parseDiffLines>
  beforeEach(() => {
    lines = parseDiffLines(realMultiFileDiff())
  })

  const keyOf = (pred: (t: string) => boolean): number => {
    const l = lines.find((x) => pred(x.text))
    if (!l) throw new Error('linha não encontrada no diff real')
    return l.key
  }

  it('clicar numa linha adicionada cita o hunk INTEIRO daquele arquivo, com o cabeçalho @@', () => {
    const h = diffHunkAt(lines, keyOf((t) => t === '+export const a = 2'))
    expect(h).not.toBeNull()
    expect(h?.file).toBe('src/a.ts')
    expect(h?.text.startsWith('@@')).toBe(true)
    expect(h?.text).toContain('-export const a = 1')
    expect(h?.text).toContain('+export const a = 2')
    // Não pode vazar para o hunk seguinte do MESMO arquivo nem para outro arquivo.
    expect(h?.text).not.toContain('l13 MUDOU')
    expect(h?.text).not.toContain('readme')
    expect(h?.text).not.toContain('diff --git')
  })

  it('clicar no próprio cabeçalho @@ cita aquele hunk (não o anterior)', () => {
    const segundo = lines.filter((l) => l.kind === 'hunk' && l.text.startsWith('@@'))[1]
    const h = diffHunkAt(lines, segundo.key)
    expect(h?.text.split('\n')[0]).toBe(segundo.text)
  })

  it('o segundo hunk do mesmo arquivo é citado sozinho e mantém a atribuição de arquivo', () => {
    const h = diffHunkAt(lines, keyOf((t) => t === '+l13 MUDOU'))
    expect(h?.file).toBe('src/a.ts')
    expect(h?.text).toContain('+l13 MUDOU')
    expect(h?.text).not.toContain('export const a = 2')
  })

  it('atribui o arquivo certo a um hunk de OUTRO arquivo do mesmo diff', () => {
    const h = diffHunkAt(lines, keyOf((t) => t === '+# readme 2'))
    expect(h?.file).toBe('README.md')
    expect(h?.text).not.toContain('export const a')
  })

  it('arquivo apagado (+++ /dev/null) é nomeado pelo --- a/… em vez de "/dev/null"', () => {
    const h = diffHunkAt(lines, keyOf((t) => t === '-const velho = 1'))
    expect(h?.file).toBe('src/velho.ts')
  })

  it('cabeçalho de arquivo (diff --git / index / +++ / ---) não é um hunk citável', () => {
    expect(diffHunkAt(lines, keyOf((t) => t.startsWith('diff --git')))).toBeNull()
    expect(diffHunkAt(lines, keyOf((t) => t.startsWith('index ')))).toBeNull()
    expect(diffHunkAt(lines, keyOf((t) => t.startsWith('+++ b/')))).toBeNull()
  })

  it('startKey/endKey cobrem exatamente as linhas do hunk (para o realce da UI)', () => {
    const h = diffHunkAt(lines, keyOf((t) => t === '+export const a = 2'))
    expect(h).not.toBeNull()
    const fatia = lines.slice(h!.startKey, h!.endKey + 1)
    expect(fatia.map((l) => l.text).join('\n')).toBe(h!.text)
    expect(fatia[0].kind).toBe('hunk')
    // O hunk termina ANTES do próximo @@/cabeçalho — nunca engole a linha de fronteira.
    const depois = lines[h!.endKey + 1]
    expect(depois.kind === 'hunk' || depois.text.startsWith('diff --git')).toBe(true)
  })

  it('key fora do diff devolve null em vez de estourar', () => {
    expect(diffHunkAt(lines, -1)).toBeNull()
    expect(diffHunkAt(lines, 9999)).toBeNull()
    expect(diffHunkAt([], 0)).toBeNull()
  })
})

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
