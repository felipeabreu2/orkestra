import { describe, it, expect } from 'vitest'
import { buildEnvPath } from './envPath'

describe('buildEnvPath', () => {
  it('augmenta com os dirs comuns que faltam (macOS) e põe o binDir à frente', () => {
    const { path, realPath } = buildEnvPath('/bin-dir', '/usr/bin:/bin', 'darwin', '/Users/x')
    expect(path.startsWith('/bin-dir:')).toBe(true)
    expect(realPath).not.toContain('/bin-dir') // realPath não tem o binDir (senão o wrapper se chamaria)
    expect(realPath).toContain('/opt/homebrew/bin')
    expect(realPath).toContain('/Users/x/.claude/local')
    expect(realPath).toContain('/usr/bin') // preserva o que já existia
  })

  it('não duplica um dir já presente no PATH', () => {
    const { realPath } = buildEnvPath('/b', '/opt/homebrew/bin:/usr/bin', 'darwin', '/Users/x')
    expect(realPath.split(':').filter((d) => d === '/opt/homebrew/bin')).toHaveLength(1)
  })

  it('Windows: não injeta dirs POSIX e usa ; como separador', () => {
    const { path, realPath } = buildEnvPath('C:\\bin', 'C:\\Windows;C:\\Windows\\System32', 'win32', 'C:\\Users\\x')
    expect(path.startsWith('C:\\bin;')).toBe(true)
    expect(realPath).toBe('C:\\Windows;C:\\Windows\\System32') // inalterado (sem augmentação POSIX)
  })

  it('PATH vazio: realPath vira só os dirs comuns (macOS)', () => {
    const { realPath } = buildEnvPath('/b', '', 'linux', '/home/x')
    expect(realPath).toContain('/home/x/.local/bin')
    expect(realPath.startsWith(':')).toBe(false) // sem separador inicial vazio
  })
})
