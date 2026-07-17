import { describe, it, expect } from 'vitest'
import { screenshotFilename, isScreenshotOf } from './portalScreenshot'

describe('screenshotFilename', () => {
  it('gera nome com prefixo estável, timestamp e sufixo .png', () => {
    expect(screenshotFilename('Pesquisa', 123)).toBe('orkestra-portal-Pesquisa-123.png')
  })

  it('sanitiza separadores de path e caracteres hostis (nome vem do renderer)', () => {
    const nome = screenshotFilename('../../etc/passwd', 1)
    expect(nome).not.toContain('/')
    expect(nome).not.toContain('..')
    expect(nome.endsWith('.png')).toBe(true)
    expect(screenshotFilename('a\\b:c*d', 1)).not.toMatch(/[\\/:*]/)
  })

  it('espaços e acentos viram algo seguro sem esvaziar o nome', () => {
    const nome = screenshotFilename('Meu Portal é ótimo!', 9)
    expect(nome.startsWith('orkestra-portal-')).toBe(true)
    expect(nome).not.toContain(' ')
  })

  it('nome vazio/só-lixo cai num fallback estável (nunca "orkestra-portal--ts.png" vazio)', () => {
    const nome = screenshotFilename('///', 5)
    expect(nome).toBe('orkestra-portal-portal-5.png')
  })
})

describe('isScreenshotOf', () => {
  it('casa capturas do MESMO portal (qualquer timestamp) e recusa as de outros', () => {
    expect(isScreenshotOf('Pesquisa', 'orkestra-portal-Pesquisa-123.png')).toBe(true)
    expect(isScreenshotOf('Pesquisa', 'orkestra-portal-Pesquisa-999.png')).toBe(true)
    expect(isScreenshotOf('Pesquisa', 'orkestra-portal-Outro-123.png')).toBe(false)
  })

  it('não casa prefixo parcial (portal "Pes" não limpa capturas de "Pesquisa")', () => {
    expect(isScreenshotOf('Pes', 'orkestra-portal-Pesquisa-123.png')).toBe(false)
  })

  it('ignora arquivos alheios do tmpdir', () => {
    expect(isScreenshotOf('Pesquisa', 'qualquer-outra-coisa.png')).toBe(false)
    expect(isScreenshotOf('Pesquisa', 'orkestra-portal-Pesquisa-123.txt')).toBe(false)
  })

  it('usa o MESMO sanitizado do filename (nomes com espaço/acento continuam casando)', () => {
    const nome = screenshotFilename('Meu Portal', 7)
    expect(isScreenshotOf('Meu Portal', nome)).toBe(true)
  })
})
