import { describe, it, expect } from 'vitest'
import { isIgnoredName, isIgnoredWatchPath, filterWatchDirs } from './watchFilters'

describe('watchFilters', () => {
  describe('isIgnoredName (eventos dentro de um dir observado)', () => {
    it('ignora .git e node_modules', () => {
      expect(isIgnoredName('.git')).toBe(true)
      expect(isIgnoredName('node_modules')).toBe(true)
    })

    it('ignora o tmp da nossa propria escrita atomica (.orktmp)', () => {
      // FileTreeService.write grava `<alvo>.orktmp` e só então renomeia — sem este ignore, todo
      // save do editor embutido geraria eventos do nosso próprio lixo.
      expect(isIgnoredName('README.md.orktmp')).toBe(true)
    })

    it('ignora .DS_Store (o Finder reescreve so de abrir a pasta)', () => {
      expect(isIgnoredName('.DS_Store')).toBe(true)
    })

    it('NAO ignora arquivos normais, inclusive dotfiles de verdade', () => {
      expect(isIgnoredName('README.md')).toBe(false)
      expect(isIgnoredName('a.ts')).toBe(false)
      expect(isIgnoredName('.gitignore')).toBe(false) // parece com .git, mas é conteúdo do usuário
      expect(isIgnoredName('.env')).toBe(false)
    })

    it('olha TODOS os segmentos quando o filename vem como caminho relativo', () => {
      expect(isIgnoredName('.git/index.lock')).toBe(true)
      expect(isIgnoredName('node_modules/foo/index.js')).toBe(true)
      expect(isIgnoredName('src/deep/a.ts')).toBe(false)
    })

    it('nome vazio nao e ignorado (na duvida, refrescar e o erro barato)', () => {
      expect(isIgnoredName('')).toBe(false)
    })
  })

  describe('isIgnoredWatchPath (dirs que nao recebem fs.watch)', () => {
    it('recusa qualquer caminho COM um segmento ignorado, nao so o basename', () => {
      expect(isIgnoredWatchPath('/r/node_modules')).toBe(true)
      expect(isIgnoredWatchPath('/r/node_modules/foo/src')).toBe(true)
      expect(isIgnoredWatchPath('/r/.git/refs')).toBe(true)
    })

    it('aceita caminhos normais', () => {
      expect(isIgnoredWatchPath('/r')).toBe(false)
      expect(isIgnoredWatchPath('/r/src/components')).toBe(false)
    })

    it('nao confunde nomes que apenas CONTEM o termo ignorado', () => {
      expect(isIgnoredWatchPath('/r/node_modules_old')).toBe(false)
      expect(isIgnoredWatchPath('/r/.github')).toBe(false)
    })
  })

  describe('filterWatchDirs', () => {
    it('remove ignorados e duplicatas preservando a ordem', () => {
      expect(filterWatchDirs(['/r', '/r/src', '/r', '/r/node_modules', '/r/.git'])).toEqual([
        '/r',
        '/r/src'
      ])
    })

    it('descarta entradas vazias', () => {
      expect(filterWatchDirs(['', '/r'])).toEqual(['/r'])
    })

    it('devolve vazio quando TUDO e ignorado (o chamador precisa saber que nao observa nada)', () => {
      expect(filterWatchDirs(['/r/node_modules', '/r/.git'])).toEqual([])
    })
  })
})
