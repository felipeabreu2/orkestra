import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { installOrq } from './installOrq'

// os.homedir() usa $HOME no POSIX — apontamos para um tmp p/ não escrever no ~/.orkestra real.
describe('installOrq', () => {
  const origHome = process.env.HOME
  let home = ''
  afterEach(() => {
    process.env.HOME = origHome
    if (home) rmSync(home, { recursive: true, force: true })
  })

  function run(platform?: NodeJS.Platform): string {
    home = mkdtempSync(join(tmpdir(), 'orq-home-'))
    process.env.HOME = home
    const fakeBin = join(home, 'fake-orq.js')
    writeFileSync(fakeBin, '// orq fake')
    return platform ? installOrq(fakeBin, platform) : installOrq(fakeBin)
  }

  it('instala orq + wrapper claude + onboarding, todos executáveis onde faz sentido', () => {
    const binDir = run()
    expect(binDir).toBe(join(home, '.orkestra', 'bin'))
    expect(statSync(join(binDir, 'orq')).mode & 0o111).toBeTruthy() // orq executável
    expect(statSync(join(binDir, 'claude')).mode & 0o111).toBeTruthy() // wrapper executável
  })

  it('o wrapper claude injeta --append-system-prompt e acha o claude real via ORKESTRA_REAL_PATH', () => {
    const binDir = run()
    const wrapper = readFileSync(join(binDir, 'claude'), 'utf-8')
    expect(wrapper).toContain('--append-system-prompt')
    expect(wrapper).toContain('ORKESTRA_REAL_PATH') // evita recursão achando o binário real
    expect(wrapper).toContain('onboarding.txt')
  })

  it('o wrapper gerado tem sintaxe sh válida (escapes do template JS corretos)', () => {
    const binDir = run()
    // sh -n valida a sintaxe sem executar — pega qualquer escape de template quebrado.
    expect(() => execFileSync('sh', ['-n', join(binDir, 'claude')])).not.toThrow()
  })

  // BLD-1/BLD-7: no Windows, escreve um shim orq.cmd (node sobre o orq.js) para o `orq` rodar como
  // comando bare; no POSIX o shebang basta e nenhum .cmd é escrito.
  it('Windows: escreve orq.cmd que invoca node sobre o orq', () => {
    const binDir = run('win32')
    const cmd = readFileSync(join(binDir, 'orq.cmd'), 'utf-8')
    expect(cmd).toContain('node')
    expect(cmd).toContain('%~dp0orq')
  })

  it('POSIX: não escreve orq.cmd (o shebang basta)', () => {
    const binDir = run('linux')
    expect(() => statSync(join(binDir, 'orq.cmd'))).toThrow() // não existe
  })

  it('o onboarding descreve os comandos orq que o agente pode usar', () => {
    run()
    const onboard = readFileSync(join(home, '.orkestra', 'onboarding.txt'), 'utf-8')
    expect(onboard).toContain('orq context')
    expect(onboard).toContain('orq list')
    expect(onboard).toContain('orq ask')
    expect(onboard).toContain('orq portal')
  })

  it('o onboarding descreve os verbos de gerência do Maestro (recruit/connect/dismiss/note write)', () => {
    run()
    const onboard = readFileSync(join(home, '.orkestra', 'onboarding.txt'), 'utf-8')
    expect(onboard).toContain('orq recruit')
    expect(onboard).toContain('orq connect')
    expect(onboard).toContain('orq dismiss')
    expect(onboard).toContain('orq note write')
  })
})
