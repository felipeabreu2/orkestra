import { describe, it, expect } from 'vitest'
import { isSafePortalUrl } from './portalUrl'

describe('isSafePortalUrl', () => {
  it('aceita http e https', () => {
    expect(isSafePortalUrl('https://example.com')).toBe(true)
    expect(isSafePortalUrl('http://localhost:3000/x')).toBe(true)
  })
  it('aceita URL sem esquema (o webview resolve p/ http[s])', () => {
    expect(isSafePortalUrl('example.com/path')).toBe(true)
  })
  it('bloqueia file:// (leitura de arquivo local — o vetor do SEC-3)', () => {
    expect(isSafePortalUrl('file:///Users/x/.ssh/id_rsa')).toBe(false)
    expect(isSafePortalUrl('FILE:///etc/passwd')).toBe(false)
  })
  it('bloqueia javascript: e data: (execução de script no portal)', () => {
    expect(isSafePortalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafePortalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })
  it('ignora caracteres de controle usados para ofuscar o esquema', () => {
    expect(isSafePortalUrl('java\tscript:alert(1)')).toBe(false)
    expect(isSafePortalUrl('  file:///x  ')).toBe(false)
  })
  it('vazio/whitespace é inseguro (nada a carregar)', () => {
    expect(isSafePortalUrl('')).toBe(false)
    expect(isSafePortalUrl('   ')).toBe(false)
  })
})
