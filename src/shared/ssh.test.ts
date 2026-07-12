import { describe, it, expect } from 'vitest'
import { isValidSshHost } from './ssh'

describe('isValidSshHost', () => {
  it('aceita host, IP, user@host e alias', () => {
    expect(isValidSshHost('meuservidor')).toBe(true)
    expect(isValidSshHost('192.168.0.1')).toBe(true)
    expect(isValidSshHost('user@host.com')).toBe(true)
    expect(isValidSshHost('deploy@10.0.0.5')).toBe(true)
  })
  it('rejeita vazio, começando com hífen (injeção de opção) e comprimento excessivo', () => {
    expect(isValidSshHost('')).toBe(false)
    expect(isValidSshHost('   ')).toBe(false)
    expect(isValidSshHost('-oProxyCommand=x')).toBe(false)
    expect(isValidSshHost('a'.repeat(256))).toBe(false)
  })
  it('rejeita metacaracteres de shell e espaços', () => {
    expect(isValidSshHost('host; rm -rf /')).toBe(false)
    expect(isValidSshHost('a|b')).toBe(false)
    expect(isValidSshHost('a&b')).toBe(false)
    expect(isValidSshHost('a$b')).toBe(false)
    expect(isValidSshHost('a b')).toBe(false)
    expect(isValidSshHost('a`b`')).toBe(false)
  })
  it('rejeita quebras de linha, NUL e não-ASCII (propriedade de segurança)', () => {
    expect(isValidSshHost('good\n; rm -rf /')).toBe(false) // JS $ (sem /m) não tolera payload após \n
    expect(isValidSshHost('go\nod')).toBe(false)
    expect(isValidSshHost('host\r\nx')).toBe(false)
    expect(isValidSshHost('a\u0000b')).toBe(false) // NUL
    expect(isValidSshHost('servidör')).toBe(false)         // não-ASCII
    // @ts-expect-error tipo não-string em runtime
    expect(isValidSshHost(123)).toBe(false)
  })
})
