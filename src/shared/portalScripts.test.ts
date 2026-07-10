import { describe, it, expect } from 'vitest'
import { clickScript, fillScript, snapshotScript } from './portalScripts'

describe('portalScripts', () => {
  it('clickScript embute o seletor com segurança (JSON.stringify)', () => {
    const s = clickScript('a.btn"; alert(1)//')
    expect(s).toContain(JSON.stringify('a.btn"; alert(1)//'))
    expect(s).toContain('querySelector')
  })
  it('fillScript seta value e dispara evento input', () => {
    const s = fillScript('#in', 'olá "mundo"')
    expect(s).toContain(JSON.stringify('#in'))
    expect(s).toContain(JSON.stringify('olá "mundo"'))
    expect(s).toContain('input')
  })
  it('snapshotScript retorna url/title/text', () => {
    const s = snapshotScript()
    expect(s).toContain('location.href')
    expect(s).toContain('document.title')
  })
})
