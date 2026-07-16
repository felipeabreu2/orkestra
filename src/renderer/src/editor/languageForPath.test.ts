import { describe, it, expect } from 'vitest'
import { languageForPath, LANGUAGE_IDS, type LanguageId } from './languageForPath'

describe('languageForPath', () => {
  it('reconhece a família JS/TS por extensão', () => {
    expect(languageForPath('a.ts')).toBe('typescript')
    expect(languageForPath('/repo/src/App.tsx')).toBe('tsx')
    expect(languageForPath('script.js')).toBe('javascript')
    expect(languageForPath('/repo/src/Comp.jsx')).toBe('jsx')
    expect(languageForPath('vite.config.mts')).toBe('typescript')
    expect(languageForPath('eslint.config.cjs')).toBe('javascript')
  })

  it('reconhece dados/markup/estilo', () => {
    expect(languageForPath('package.json')).toBe('json')
    expect(languageForPath('README.md')).toBe('markdown')
    expect(languageForPath('notas.markdown')).toBe('markdown')
    expect(languageForPath('tokens.css')).toBe('css')
    expect(languageForPath('index.html')).toBe('html')
    expect(languageForPath('page.htm')).toBe('html')
    expect(languageForPath('main.py')).toBe('python')
  })

  it('ignora maiúsculas/minúsculas na extensão', () => {
    expect(languageForPath('/x/README.MD')).toBe('markdown')
    expect(languageForPath('A.TS')).toBe('typescript')
  })

  it('cai em plain para extensão desconhecida', () => {
    expect(languageForPath('dados.xyz')).toBe('plain')
    expect(languageForPath('/var/log/app.log')).toBe('plain')
  })

  it('cai em plain para arquivo sem extensão', () => {
    expect(languageForPath('LICENSE')).toBe('plain')
    expect(languageForPath('/usr/local/bin/orq')).toBe('plain')
  })

  it('cai em plain para dotfiles (o ponto inicial não é separador de extensão)', () => {
    expect(languageForPath('.gitignore')).toBe('plain')
    expect(languageForPath('/repo/.env')).toBe('plain')
  })

  it('não confunde ponto no diretório com extensão do arquivo', () => {
    // o último ponto do caminho está no DIRETÓRIO, não no basename: sem extensão → plain.
    expect(languageForPath('/repo/v1.2/Makefile')).toBe('plain')
    // e o basename com extensão sob um diretório pontuado continua resolvendo.
    expect(languageForPath('/repo/v1.2/a.ts')).toBe('typescript')
  })

  it('resolve caminhos com separador do Windows', () => {
    expect(languageForPath('C:\\repo\\src\\a.ts')).toBe('typescript')
  })

  it('tolera entradas degeneradas sem quebrar', () => {
    expect(languageForPath('')).toBe('plain')
    expect(languageForPath('/')).toBe('plain')
    expect(languageForPath('a.')).toBe('plain')
  })

  it('LANGUAGE_IDS cobre todos os ids que a função pode devolver', () => {
    const amostra: string[] = [
      'a.ts', 'a.tsx', 'a.js', 'a.jsx', 'a.json', 'a.md', 'a.css', 'a.html', 'a.py', 'a.zzz'
    ]
    for (const p of amostra) {
      expect(LANGUAGE_IDS).toContain(languageForPath(p) as LanguageId)
    }
  })
})
