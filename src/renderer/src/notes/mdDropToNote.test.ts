import { describe, it, expect } from 'vitest'
import { mdFileToNoteData } from './mdDropToNote'

describe('mdFileToNoteData', () => {
  it('.md vira {name: basename sem extensão, html renderizado}', () => {
    const r = mdFileToNoteData('plano.md', '# Plano\ntexto')
    expect(r).not.toBeNull()
    expect(r!.name).toBe('plano')
    expect(r!.html).toContain('<h1>')
    expect(r!.html).toContain('Plano')
  })

  it('.markdown e .txt também são aceitos (case-insensitive)', () => {
    expect(mdFileToNoteData('notas.MARKDOWN', 'a')).not.toBeNull()
    expect(mdFileToNoteData('lista.txt', 'a')).not.toBeNull()
  })

  it('outras extensões -> null (não é conteúdo de nota)', () => {
    expect(mdFileToNoteData('foto.png', 'x')).toBeNull()
    expect(mdFileToNoteData('script.ts', 'x')).toBeNull()
    expect(mdFileToNoteData('sem-extensao', 'x')).toBeNull()
  })

  it('texto de .txt sobrevive como parágrafos (HTML escapado, nunca cru)', () => {
    const r = mdFileToNoteData('a.txt', 'linha <b>não-html</b>')
    expect(r!.html).not.toContain('<b>')
    expect(r!.html).toContain('&lt;b&gt;')
  })

  it('nome de arquivo com ponto no meio mantém tudo menos a extensão', () => {
    expect(mdFileToNoteData('v1.2-plano.md', 'x')!.name).toBe('v1.2-plano')
  })
})
