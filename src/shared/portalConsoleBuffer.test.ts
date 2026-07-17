import { describe, it, expect } from 'vitest'
import { pushConsole, CONSOLE_CAP, CONSOLE_LINE_MAX } from './portalConsoleBuffer'

describe('pushConsole (ring-buffer do console do portal)', () => {
  it('acumula na ordem de chegada', () => {
    const buf: string[] = []
    pushConsole(buf, '[log] a')
    pushConsole(buf, '[error] b')
    expect(buf).toEqual(['[log] a', '[error] b'])
  })

  it('respeita o cap: mantém as ÚLTIMAS N, descartando as mais antigas', () => {
    const buf: string[] = []
    for (let i = 0; i < CONSOLE_CAP + 10; i++) pushConsole(buf, `linha ${i}`)
    expect(buf.length).toBe(CONSOLE_CAP)
    expect(buf[0]).toBe('linha 10')
    expect(buf[buf.length - 1]).toBe(`linha ${CONSOLE_CAP + 9}`)
  })

  it('trunca linha gigante (um console.log de 1MB não pode inflar o buffer)', () => {
    const buf: string[] = []
    pushConsole(buf, 'x'.repeat(CONSOLE_LINE_MAX * 3))
    expect(buf[0].length).toBeLessThanOrEqual(CONSOLE_LINE_MAX)
  })

  it('cap customizado (para testes/telas menores) funciona', () => {
    const buf: string[] = []
    for (let i = 0; i < 5; i++) pushConsole(buf, `l${i}`, 3)
    expect(buf).toEqual(['l2', 'l3', 'l4'])
  })

  it('entrada não-string vira string segura (o evento do webview não é confiável)', () => {
    const buf: string[] = []
    pushConsole(buf, 123 as unknown as string)
    expect(typeof buf[0]).toBe('string')
  })
})
