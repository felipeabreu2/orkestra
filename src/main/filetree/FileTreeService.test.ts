import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileTreeService } from './FileTreeService'

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

  it('gitStatus vazio p/ dir sem git; reporta modificados num repo', async () => {
    expect(await svc.gitStatus(dir)).toEqual({})
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
    expect(st['README.md']).toBeTruthy() // 'M'
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
    expect(st['novo.txt']).toBe('??')
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
    expect(st[accented]).toBeTruthy() // 'M', com a chave exatamente 'café.txt'
    expect(Object.keys(st).some((k) => k.includes('café'))).toBe(true)
  })
})
