import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildEnvPath, resolveNvmBinDirs } from './envPath'

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

  // BLD-2b: o `orq` tem shebang `#!/usr/bin/env node` — sem node no PATH, TODO comando orq morre.
  // Quem usa nvm não tem node em nenhum dos dirs fixos; os dirs descobertos entram via extraDirs.
  it('extraDirs (ex.: bin do nvm) entra no realPath e no path', () => {
    const nvmBin = '/Users/x/.nvm/versions/node/v24.6.0/bin'
    const { path, realPath } = buildEnvPath('/bin-dir', '/usr/bin:/bin', 'darwin', '/Users/x', [nvmBin])
    expect(realPath).toContain(nvmBin)
    expect(path).toContain(nvmBin)
    expect(path.startsWith('/bin-dir:')).toBe(true)
    expect(realPath).not.toContain('/bin-dir')
  })

  it('extraDirs vem antes dos dirs fixos entre os acrescentados (node do nvm ganha)', () => {
    const nvmBin = '/Users/x/.nvm/versions/node/v24.6.0/bin'
    const { realPath } = buildEnvPath('/b', '/usr/bin', 'darwin', '/Users/x', [nvmBin])
    const dirs = realPath.split(':')
    expect(dirs.indexOf('/usr/bin')).toBe(0) // nunca reordena o que já existia
    expect(dirs.indexOf(nvmBin)).toBeLessThan(dirs.indexOf('/opt/homebrew/bin'))
  })

  it('extraDirs já presente no PATH não duplica', () => {
    const nvmBin = '/Users/x/.nvm/versions/node/v24.6.0/bin'
    const { realPath } = buildEnvPath('/b', `${nvmBin}:/usr/bin`, 'darwin', '/Users/x', [nvmBin])
    expect(realPath.split(':').filter((d) => d === nvmBin)).toHaveLength(1)
  })

  it('sem extraDirs o comportamento é idêntico ao de hoje (no-op)', () => {
    const a = buildEnvPath('/b', '/usr/bin:/bin', 'darwin', '/Users/x')
    const b = buildEnvPath('/b', '/usr/bin:/bin', 'darwin', '/Users/x', [])
    expect(b).toEqual(a)
  })
})

describe('resolveNvmBinDirs', () => {
  let root: string
  let nvmDir: string

  const install = (...versions: string[]): void => {
    for (const v of versions) mkdirSync(join(nvmDir, 'versions', 'node', v, 'bin'), { recursive: true })
  }
  const alias = (name: string, value: string): void => {
    const file = join(nvmDir, 'alias', name)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, `${value}\n`)
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orkestra-nvm-'))
    nvmDir = join(root, '.nvm')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('sem nvm instalado: no-op (lista vazia)', () => {
    expect(resolveNvmBinDirs({}, root, 'darwin')).toEqual([])
  })

  it('nvm presente sem alias/default: usa a versão mais alta instalada', () => {
    install('v22.18.0', 'v24.6.0')
    expect(resolveNvmBinDirs({}, root, 'darwin')).toEqual([join(nvmDir, 'versions', 'node', 'v24.6.0', 'bin')])
  })

  it('ordena por semântica, não por string: v10 > v9', () => {
    install('v9.11.2', 'v10.24.1')
    expect(resolveNvmBinDirs({}, root, 'darwin')).toEqual([join(nvmDir, 'versions', 'node', 'v10.24.1', 'bin')])
  })

  it('alias/default com versão explícita é respeitado', () => {
    install('v22.18.0', 'v24.6.0')
    alias('default', 'v22.18.0')
    expect(resolveNvmBinDirs({}, root, 'darwin')).toEqual([join(nvmDir, 'versions', 'node', 'v22.18.0', 'bin')])
  })

  it('alias/default = "node" resolve pra mais alta instalada', () => {
    install('v22.18.0', 'v24.6.0')
    alias('default', 'node')
    expect(resolveNvmBinDirs({}, root, 'darwin')).toEqual([join(nvmDir, 'versions', 'node', 'v24.6.0', 'bin')])
  })

  it('alias/default = major parcial ("22") resolve pra mais alta daquele major', () => {
    install('v22.11.0', 'v22.18.0', 'v24.6.0')
    alias('default', '22')
    expect(resolveNvmBinDirs({}, root, 'darwin')).toEqual([join(nvmDir, 'versions', 'node', 'v22.18.0', 'bin')])
  })

  it('alias/default = "lts/*" segue a cadeia de aliases até a versão', () => {
    install('v22.18.0', 'v24.6.0')
    alias('default', 'lts/*')
    alias(join('lts', '*'), 'lts/jod')
    alias(join('lts', 'jod'), 'v22.18.0')
    expect(resolveNvmBinDirs({}, root, 'darwin')).toEqual([join(nvmDir, 'versions', 'node', 'v22.18.0', 'bin')])
  })

  it('alias apontando pra versão NÃO instalada cai pra mais alta instalada', () => {
    install('v22.18.0', 'v24.6.0')
    alias('default', 'v18.0.0')
    expect(resolveNvmBinDirs({}, root, 'darwin')).toEqual([join(nvmDir, 'versions', 'node', 'v24.6.0', 'bin')])
  })

  it('$NVM_DIR é respeitado quando definido', () => {
    nvmDir = join(root, 'custom-nvm')
    install('v20.19.4')
    // home aponta pra outro lugar de propósito: quem manda é o NVM_DIR
    expect(resolveNvmBinDirs({ NVM_DIR: nvmDir }, join(root, 'sem-nvm-aqui'), 'darwin')).toEqual([
      join(nvmDir, 'versions', 'node', 'v20.19.4', 'bin')
    ])
  })

  it('win32: não descobre caminhos POSIX', () => {
    install('v24.6.0')
    expect(resolveNvmBinDirs({ NVM_DIR: nvmDir }, root, 'win32')).toEqual([])
  })
})
