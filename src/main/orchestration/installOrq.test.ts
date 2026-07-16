import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, chmodSync, mkdirSync, existsSync } from 'node:fs'
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

  // T2 (correção P0): o papel do agente chega ao wrapper por ORKESTRA_ROLE (env do pty) e é
  // concatenado ao onboarding num ÚNICO --append-system-prompt. Este bloco EXECUTA o wrapper de
  // verdade (sh) contra um `claude` falso que grava os argumentos recebidos — é a única forma de
  // provar o comportamento (e o escape) em vez de só inspecionar o texto do script.
  //
  // Retorna o que o claude falso viu: a flag ($1) e o prompt ($2), exatamente como argv.
  function runWrapper(role?: string): { flag: string; prompt: string; pwnedDir: string } {
    const binDir = run()
    const realDir = join(home, 'realbin')
    const outDir = join(home, 'out')
    const pwnedDir = join(home, 'pwned')
    mkdirSync(realDir, { recursive: true })
    mkdirSync(outDir, { recursive: true })
    mkdirSync(pwnedDir, { recursive: true })
    const fakeClaude = join(realDir, 'claude')
    // Grava argv[1] e argv[2] crus, sem interpretação — se o wrapper tivesse deixado o shell
    // reinterpretar o papel, o que chega aqui seria diferente do que saiu do env.
    writeFileSync(
      fakeClaude,
      `#!/bin/sh\nprintf '%s' "$1" > "${join(outDir, 'flag')}"\nprintf '%s' "$2" > "${join(outDir, 'prompt')}"\n`,
      'utf-8'
    )
    chmodSync(fakeClaude, 0o755)
    execFileSync('sh', [join(binDir, 'claude')], {
      env: {
        HOME: home,
        PATH: `${realDir}:/usr/bin:/bin`,
        ORKESTRA_REAL_PATH: realDir,
        ...(role === undefined ? {} : { ORKESTRA_ROLE: role })
      }
    })
    return {
      flag: readFileSync(join(outDir, 'flag'), 'utf-8'),
      prompt: readFileSync(join(outDir, 'prompt'), 'utf-8'),
      pwnedDir
    }
  }

  it('o wrapper claude injeta onboarding + ORKESTRA_ROLE num único --append-system-prompt', () => {
    const { flag, prompt } = runWrapper('Você atua como o agente Dev. Escreva testes primeiro.')
    expect(flag).toBe('--append-system-prompt')
    expect(prompt).toContain('orq context') // onboarding
    expect(prompt).toContain('Você atua como o agente Dev. Escreva testes primeiro.') // papel
  })

  it('o wrapper claude sem ORKESTRA_ROLE injeta só o onboarding (comportamento anterior intacto)', () => {
    const { flag, prompt } = runWrapper()
    expect(flag).toBe('--append-system-prompt')
    expect(prompt).toContain('orq context')
  })

  it('ORKESTRA_ROLE vazio não vira um papel em branco colado no prompt', () => {
    const { prompt } = runWrapper('')
    expect(prompt).toBe(readFileSync(join(home, '.orkestra', 'onboarding.txt'), 'utf-8').replace(/\n+$/, ''))
  })

  // SEGURANÇA: o papel é texto LIVRE do usuário e entra num script sh. Metacaracteres têm de chegar
  // ao claude como texto literal — nunca executados. Regressão aqui = RCE a partir de uma string de
  // papel (ex.: papel vindo de um `orq recruit` disparado por um agente).
  it('papel com metacaracteres de shell chega literal e NÃO executa comando', () => {
    const evil = 'Dev"; $(touch $HOME/pwned/subst); `touch $HOME/pwned/backtick`; touch $HOME/pwned/semi; $(id) ${HOME} & | > <'
    const { prompt, pwnedDir } = runWrapper(evil)
    expect(prompt).toContain(evil) // literal, byte a byte
    expect(existsSync(join(pwnedDir, 'subst'))).toBe(false)
    expect(existsSync(join(pwnedDir, 'backtick'))).toBe(false)
    expect(existsSync(join(pwnedDir, 'semi'))).toBe(false)
  })

  it('papel multilinha sobrevive inteiro (não é cortado na primeira quebra)', () => {
    const { prompt } = runWrapper('linha um\nlinha dois\nlinha três')
    expect(prompt).toContain('linha um\nlinha dois\nlinha três')
  })

  it('o onboarding descreve os comandos orq que o agente pode usar', () => {
    run()
    const onboard = readFileSync(join(home, '.orkestra', 'onboarding.txt'), 'utf-8')
    expect(onboard).toContain('orq context')
    expect(onboard).toContain('orq list')
    expect(onboard).toContain('orq ask')
    expect(onboard).toContain('orq portal')
  })

  it('o onboarding descreve os comandos de portal dirigível (back/forward/reload/scroll/create/--dom)', () => {
    run()
    const onboard = readFileSync(join(home, '.orkestra', 'onboarding.txt'), 'utf-8')
    expect(onboard).toContain('orq portal back')
    expect(onboard).toContain('reload')
    expect(onboard).toContain('scroll')
    expect(onboard).toContain('orq portal create')
    expect(onboard).toContain('--dom')
  })

  it('o onboarding descreve os verbos de gerência do Maestro (recruit/connect/dismiss/note write)', () => {
    run()
    const onboard = readFileSync(join(home, '.orkestra', 'onboarding.txt'), 'utf-8')
    expect(onboard).toContain('orq recruit')
    expect(onboard).toContain('orq connect')
    expect(onboard).toContain('orq dismiss')
    expect(onboard).toContain('orq note write')
    expect(onboard).toContain('orq whoami')
  })

  // T8: o `orq squad` existia, com testes verdes, mas não era citado em NENHUM texto que o agente
  // lê — ninguém o descobria. O onboarding é o único canal de descoberta dos verbos.
  it('o onboarding cita o orq squad (template de esquadrão do Maestro)', () => {
    run()
    const onboard = readFileSync(join(home, '.orkestra', 'onboarding.txt'), 'utf-8')
    expect(onboard).toContain('orq squad')
  })
})
