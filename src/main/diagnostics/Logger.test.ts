import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Logger } from './Logger'

describe('Logger', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ork-log-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('write grava no arquivo (com timestamp) e recent() reflete', () => {
    const log = new Logger(dir)
    log.write('linha A')
    expect(log.recent().some((l) => l.includes('linha A'))).toBe(true)
    const file = readFileSync(log.path()).toString()
    expect(file).toContain('linha A')
    // timestamp ISO na frente da linha (ano-mes-dia T ...)
    expect(file).toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('rotaciona quando o arquivo passa do maxBytes — nunca cresce sem teto', () => {
    const log = new Logger(dir, { maxBytes: 200 })
    for (let i = 0; i < 50; i++) log.write(`linha ${i} com algum recheio para encher bytes`)
    expect(existsSync(join(dir, 'app.log.1'))).toBe(true)
    // o arquivo ATUAL fica pequeno (rotação zera; uma linha nova cabe no teto)
    expect(readFileSync(log.path()).toString().length).toBeLessThanOrEqual(400)
  })

  it('recent(n) devolve só as últimas n linhas do ring em memória', () => {
    const log = new Logger(dir)
    for (let i = 0; i < 10; i++) log.write(`linha ${i}`)
    const last3 = log.recent(3)
    expect(last3.length).toBe(3)
    expect(last3[2]).toContain('linha 9')
    expect(last3[0]).toContain('linha 7')
  })

  it('ring em memória tem teto (MAX_LINES) — sessão longa não acumula sem limite', () => {
    const log = new Logger(dir)
    for (let i = 0; i < 1000; i++) log.write(`l${i}`)
    expect(log.recent(10_000).length).toBeLessThanOrEqual(500)
  })

  it('NUNCA lança: diretório inescrevível degrada em silêncio (ring segue funcionando)', () => {
    const log = new Logger(join(dir, 'nao-existe', 'nem-vai', 'existir', 'a', 'b'))
    expect(() => log.write('sem disco')).not.toThrow()
    // mesmo sem disco, o ring em memória guarda (o diagnóstico ainda tem o que exportar)
    expect(log.recent().some((l) => l.includes('sem disco'))).toBe(true)
  })
})
