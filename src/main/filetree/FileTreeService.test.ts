import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileTreeService, isInsideRoot, MAX_DIFF_LINES } from './FileTreeService'

describe('FileTreeService', () => {
  let dir: string
  const svc = new FileTreeService()
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ork-ft-'))
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'README.md'), '# hi\n')
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1\n')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('list devolve pastas antes de arquivos, ordenado, com isDir', async () => {
    const e = await svc.list(dir)
    expect(e[0]).toMatchObject({ name: 'src', isDir: true })
    expect(e.some((x) => x.name === 'README.md' && !x.isDir)).toBe(true)
  })

  it('list ordena alfabeticamente (case-insensitive) dentro de cada grupo', async () => {
    writeFileSync(join(dir, 'zebra.txt'), 'z\n')
    writeFileSync(join(dir, 'Apple.txt'), 'a\n')
    mkdirSync(join(dir, 'Zdir'))
    mkdirSync(join(dir, 'adir'))
    const e = await svc.list(dir)
    const dirs = e.filter((x) => x.isDir).map((x) => x.name)
    const files = e.filter((x) => !x.isDir).map((x) => x.name)
    expect(dirs).toEqual(['adir', 'src', 'Zdir'])
    expect(files).toEqual(['Apple.txt', 'README.md', 'zebra.txt'])
    // pastas sempre antes de arquivos, independente da ordem alfabética
    expect(e.findIndex((x) => !x.isDir)).toBeGreaterThan(e.map((x) => x.isDir).lastIndexOf(true))
  })

  it('list devolve o path absoluto (join de dir + name)', async () => {
    const e = await svc.list(dir)
    const readme = e.find((x) => x.name === 'README.md')
    expect(readme?.path).toBe(join(dir, 'README.md'))
  })

  it('list rejeita para um diretorio inexistente', async () => {
    await expect(svc.list(join(dir, 'nao-existe'))).rejects.toBeTruthy()
  })

  it('read devolve o conteudo de um arquivo de texto', async () => {
    const r = await svc.read(join(dir, 'README.md'))
    expect(r.content).toContain('# hi')
    expect(r.binary).toBe(false)
    expect(r.truncated).toBe(false)
  })

  it('read marca truncated quando excede o cap', async () => {
    writeFileSync(join(dir, 'big.txt'), 'x'.repeat(300 * 1024))
    const r = await svc.read(join(dir, 'big.txt'))
    expect(r.truncated).toBe(true)
    expect(r.content.length).toBeLessThanOrEqual(256 * 1024)
  })

  it('read detecta binario via byte NUL nos primeiros bytes', async () => {
    const buf = Buffer.concat([Buffer.from('abc'), Buffer.from([0]), Buffer.from('def')])
    writeFileSync(join(dir, 'bin.dat'), buf)
    const r = await svc.read(join(dir, 'bin.dat'))
    expect(r.binary).toBe(true)
    expect(r.content).toBe('')
    expect(r.truncated).toBe(false)
  })

  it('read de arquivo vazio nao quebra e nao marca binario', async () => {
    writeFileSync(join(dir, 'empty.txt'), '')
    const r = await svc.read(join(dir, 'empty.txt'))
    expect(r.content).toBe('')
    expect(r.binary).toBe(false)
    expect(r.truncated).toBe(false)
  })

  it('write grava o conteúdo e read devolve exatamente o que foi escrito (idempotente)', async () => {
    const p = join(dir, 'src', 'a.ts')
    await svc.write(p, 'export const a = 2\n', dir)
    const r1 = await svc.read(p)
    expect(r1.content).toBe('export const a = 2\n')
    // idempotente: gravar de novo o mesmo conteúdo mantém a leitura estável
    await svc.write(p, 'export const a = 2\n', dir)
    const r2 = await svc.read(p)
    expect(r2.content).toBe('export const a = 2\n')
  })

  it('write cria um arquivo NOVO dentro da raiz', async () => {
    const p = join(dir, 'src', 'novo.ts')
    await svc.write(p, 'const x = 1\n', dir)
    expect((await svc.read(p)).content).toBe('const x = 1\n')
  })

  it('write REJEITA um caminho fora da raiz (path traversal) e não deixa .orktmp', async () => {
    const outside = join(dir, '..', 'fora.txt')
    await expect(svc.write(outside, 'x', dir)).rejects.toThrow(/fora da raiz/)
    expect(existsSync(`${outside}.orktmp`)).toBe(false)
  })

  it('isInsideRoot: aceita dentro/igual, recusa traversal e prefixo-irmão', () => {
    expect(isInsideRoot('/r', '/r/a/b')).toBe(true)
    expect(isInsideRoot('/r', '/r')).toBe(true)
    expect(isInsideRoot('/r', '/r/../x')).toBe(false)
    expect(isInsideRoot('/r', '/r-outro/a')).toBe(false)
    expect(isInsideRoot('/r', '/outro')).toBe(false)
  })

  it('gitStatus vazio p/ dir sem git; reporta modificados num repo', async () => {
    expect(await svc.gitStatus(dir)).toEqual({ prefix: '', entries: {} })
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: dir })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
    writeFileSync(join(dir, 'README.md'), '# changed\n')
    const st = await svc.gitStatus(dir)
    expect(st.entries['README.md']).toBeTruthy() // 'M'
  })

  it('gitStatus reporta arquivo novo/nao rastreado como "??"', async () => {
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: dir })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
    writeFileSync(join(dir, 'novo.txt'), 'novo\n')
    const st = await svc.gitStatus(dir)
    expect(st.entries['novo.txt']).toBe('??')
  })

  it('gitStatus preserva nome de arquivo nao-ASCII (acentuado) como chave UTF-8 real', async () => {
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: dir })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    // git default `core.quotePath=true` escaparia isto em octal ("caf\303\251.txt") no --porcelain;
    // a chave precisa voltar como o nome UTF-8 real p/ casar com o path no renderer.
    const accented = 'café.txt'
    writeFileSync(join(dir, accented), 'a\n')
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
    writeFileSync(join(dir, accented), '# changed\n')
    const st = await svc.gitStatus(dir)
    expect(st.entries[accented]).toBeTruthy() // 'M', com a chave exatamente 'café.txt'
    expect(Object.keys(st.entries).some((k) => k.includes('café'))).toBe(true)
  })

  it('gitStatus resolve prefixo do subdiretório do repo (regressão: overlay em raiz ≠ toplevel)', async () => {
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: dir })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    mkdirSync(join(dir, 'sub', 'deep'), { recursive: true })
    writeFileSync(join(dir, 'sub', 'deep', 'a.txt'), 'a\n')
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
    writeFileSync(join(dir, 'sub', 'deep', 'a.txt'), '# changed\n')

    // Raiz da árvore = subdiretório: `git status --porcelain` devolve paths relativos ao TOPLEVEL
    // ('sub/deep/a.txt'), então o overlay só casa se soubermos o prefixo do subdir dentro do repo.
    const st = await svc.gitStatus(join(dir, 'sub'))
    expect(st.prefix).toBe('sub/')
    expect(st.entries['sub/deep/a.txt']).toBeTruthy() // 'M'

    // Raiz = toplevel: prefixo vazio, comportamento preservado.
    const top = await svc.gitStatus(dir)
    expect(top.prefix).toBe('')
    expect(top.entries['sub/deep/a.txt']).toBeTruthy()
  })

  // ── Onda 3 · T8: branch + diff (leitura pura) ──────────────────────────────────────────────
  // Helper local (mesmo idioma dos testes de gitStatus acima): repo git REAL num tmpdir. Sem
  // fabricar shape — o que o git de verdade imprime é exatamente o que o serviço parseia.
  const initRepo = (at: string): void => {
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: at })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
  }

  it('gitBranch devolve "" fora de repo e o nome da branch dentro de um repo real', async () => {
    expect(await svc.gitBranch(dir)).toBe('')
    initRepo(dir)
    const branch = await svc.gitBranch(dir)
    expect(branch).toBeTruthy()
    // Não fixamos 'main' (depende do init.defaultBranch do ambiente/CI); fixamos que é um nome
    // de branch de verdade e que bate com o que o próprio git reporta.
    expect(branch).toBe(execFileSync('git', ['branch', '--show-current'], { cwd: dir }).toString().trim())
  })

  it('gitBranch acompanha a troca de branch (checkout -b)', async () => {
    initRepo(dir)
    execFileSync('git', ['checkout', '-qb', 'feat/acentuação'], { cwd: dir })
    expect(await svc.gitBranch(dir)).toBe('feat/acentuação')
  })

  it('gitBranch de um SUBdiretório do repo devolve a mesma branch (raiz ≠ toplevel)', async () => {
    initRepo(dir)
    execFileSync('git', ['checkout', '-qb', 'topico'], { cwd: dir })
    expect(await svc.gitBranch(join(dir, 'src'))).toBe('topico')
  })

  it('gitDiff devolve vazio fora de repo e sem alterações', async () => {
    expect(await svc.gitDiff(dir)).toEqual({ text: '', truncated: false })
    initRepo(dir)
    expect(await svc.gitDiff(dir)).toEqual({ text: '', truncated: false })
  })

  it('gitDiff inclui o hunk (+/-) de um arquivo modificado', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\n')
    const d = await svc.gitDiff(dir)
    expect(d.truncated).toBe(false)
    expect(d.text).toContain('src/a.ts')
    expect(d.text).toContain('@@')
    expect(d.text).toContain('-export const a = 1')
    expect(d.text).toContain('+export const a = 2')
  })

  it('gitDiff inclui alterações JÁ EM STAGE (diff vs HEAD, não só working tree)', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 3\n')
    execFileSync('git', ['add', 'src/a.ts'], { cwd: dir })
    const d = await svc.gitDiff(dir)
    expect(d.text).toContain('+export const a = 3')
  })

  it('gitDiff com `path` limita o diff àquele arquivo', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\n')
    writeFileSync(join(dir, 'README.md'), '# outro\n')
    const only = await svc.gitDiff(dir, join(dir, 'src', 'a.ts'))
    expect(only.text).toContain('src/a.ts')
    expect(only.text).not.toContain('README.md')
  })

  it('gitDiff preserva nome não-ASCII (core.quotePath=false)', async () => {
    const accented = 'café.txt'
    writeFileSync(join(dir, accented), 'a\n')
    initRepo(dir)
    writeFileSync(join(dir, accented), 'b\n')
    const d = await svc.gitDiff(dir)
    expect(d.text).toContain('café.txt')
    expect(d.text).not.toContain('\\303')
  })

  it('gitDiff trunca diff gigante no teto de linhas e marca truncated', async () => {
    writeFileSync(join(dir, 'grande.txt'), Array.from({ length: 5000 }, (_, i) => `l${i}`).join('\n'))
    initRepo(dir)
    writeFileSync(join(dir, 'grande.txt'), Array.from({ length: 5000 }, (_, i) => `L${i}`).join('\n'))
    const d = await svc.gitDiff(dir)
    expect(d.truncated).toBe(true)
    expect(d.text.split('\n').length).toBeLessThanOrEqual(MAX_DIFF_LINES)
  })

  it('gitDiff de um arquivo NOVO (untracked) não quebra e devolve vazio p/ ele', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'novo.txt'), 'novo\n')
    const d = await svc.gitDiff(dir)
    // `git diff HEAD` ignora untracked — o que importa é não lançar; o overlay da árvore (??) é
    // quem sinaliza arquivo novo.
    expect(d.truncated).toBe(false)
    expect(d.text).not.toContain('novo.txt')
  })

  it('gitBranch/gitDiff NÃO escrevem no repo (leitura pura): status intacto antes/depois', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\n')
    const before = execFileSync('git', ['status', '--porcelain'], { cwd: dir }).toString()
    const headBefore = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString()
    await svc.gitBranch(dir)
    await svc.gitDiff(dir)
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: dir }).toString()).toBe(before)
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString()).toBe(headBefore)
  })
})
