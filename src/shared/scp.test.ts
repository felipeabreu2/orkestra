import { describe, it, expect } from 'vitest'
import { buildScpDrop, safeRemoteName, REMOTE_DROP_DIR } from './scp'

describe('safeRemoteName', () => {
  it('mantém nomes já seguros (letras, dígitos, ., _, -)', () => {
    expect(safeRemoteName('a.png')).toBe('a.png')
    expect(safeRemoteName('meu-arquivo_v2.tar.gz')).toBe('meu-arquivo_v2.tar.gz')
  })
  it('troca todo metacaractere/espaço por _ (nada que o shell remoto reinterprete)', () => {
    // o destino remoto do scp (host:dir/NOME) é expandido pelo shell do servidor — aspas locais
    // não protegem o outro lado, então o basename tem de ser sanitizado.
    expect(safeRemoteName('foo;$(rm -rf ~).png')).toBe('foo___rm_-rf___.png')
    expect(safeRemoteName('a b c.txt')).toBe('a_b_c.txt')
    expect(safeRemoteName('`whoami`.sh')).toBe('_whoami_.sh')
  })
  it('recusa nome vazio ou só-pontos (não deixa virar . / .. / caminho)', () => {
    expect(() => safeRemoteName('')).toThrow()
    expect(() => safeRemoteName('.')).toThrow()
    expect(() => safeRemoteName('..')).toThrow()
    expect(() => safeRemoteName('...')).toThrow()
  })
})

describe('buildScpDrop', () => {
  it('monta mkdirArgs, scpArgs e remotePath (arrays prontos p/ spawn sem shell)', () => {
    const r = buildScpDrop({ localPath: '/tmp/a.png', host: 'user@h', remoteDir: '/tmp/orkestra-drops' })
    expect(r.mkdirArgs).toEqual(['user@h', 'mkdir', '-p', '/tmp/orkestra-drops'])
    expect(r.scpArgs).toEqual(['--', '/tmp/a.png', 'user@h:/tmp/orkestra-drops/a.png'])
    expect(r.remotePath).toBe('/tmp/orkestra-drops/a.png')
  })

  it('põe `--` antes dos posicionais do scp (getopt para aí — cinto e suspensório)', () => {
    const r = buildScpDrop({ localPath: '/tmp/a.png', host: 'user@h' })
    expect(r.scpArgs[0]).toBe('--')
    expect(r.scpArgs.indexOf('--')).toBe(0)
  })

  it('usa REMOTE_DROP_DIR como default quando remoteDir é omitido', () => {
    const r = buildScpDrop({ localPath: '/tmp/a.png', host: 'user@h' })
    expect(REMOTE_DROP_DIR).toBe('/tmp/orkestra-drops')
    expect(r.mkdirArgs).toEqual(['user@h', 'mkdir', '-p', REMOTE_DROP_DIR])
    expect(r.remotePath).toBe(`${REMOTE_DROP_DIR}/a.png`)
  })

  it('reusa isValidSshHost: host com injeção de opção lança (mesma barra do transporte)', () => {
    expect(() =>
      buildScpDrop({ localPath: '/tmp/a', host: '-oProxyCommand=x', remoteDir: '/tmp/d' })
    ).toThrow()
  })

  it('host com metacaractere de shell lança e não produz argumento nenhum', () => {
    expect(() => buildScpDrop({ localPath: '/tmp/a', host: 'a; rm -rf /' })).toThrow()
  })

  it('sanitiza o basename do localPath no destino remoto (não confia em aspas locais)', () => {
    const r = buildScpDrop({ localPath: '/tmp/foo;$(rm -rf ~).png', host: 'user@h' })
    // o SOURCE local é passado cru (array, sem shell — é o arquivo real do usuário)...
    expect(r.scpArgs[1]).toBe('/tmp/foo;$(rm -rf ~).png')
    // ...mas o NOME remoto é um único segmento seguro (sem /, sem metacaractere, sem espaço).
    expect(r.remotePath).toBe(`${REMOTE_DROP_DIR}/foo___rm_-rf___.png`)
    expect(r.scpArgs[2]).toBe(`user@h:${REMOTE_DROP_DIR}/foo___rm_-rf___.png`)
  })

  it('só usa o basename (path traversal no localPath não afeta o destino remoto)', () => {
    const r = buildScpDrop({ localPath: '/tmp/../etc/passwd', host: 'user@h' })
    expect(r.remotePath).toBe(`${REMOTE_DROP_DIR}/passwd`)
  })

  it('localPath vazio ou cujo basename é só-pontos lança', () => {
    expect(() => buildScpDrop({ localPath: '', host: 'user@h' })).toThrow()
    expect(() => buildScpDrop({ localPath: '/tmp/..', host: 'user@h' })).toThrow()
    expect(() => buildScpDrop({ localPath: '/some/dir/', host: 'user@h' })).toThrow()
  })

  // Gêmeo, no lado do ARQUIVO, do isValidSshHost do lado do host: o scp faz getopt no primeiro
  // posicional, então um localPath começando com '-' vira OPÇÃO, não caminho — e
  // `-oProxyCommand=...` executa comando na máquina LOCAL. Mesmo vetor que o host já barra.
  it('localPath com injeção de opção lança (o `-` inicial nunca chega no argv do scp)', () => {
    expect(() =>
      buildScpDrop({ localPath: '-oProxyCommand=touch /tmp/pwned', host: 'user@h' })
    ).toThrow('Caminho local inválido')
    expect(() => buildScpDrop({ localPath: '-oProxyCommand=x', host: 'user@h' })).toThrow()
    expect(() => buildScpDrop({ localPath: '--', host: 'user@h' })).toThrow()
    expect(() => buildScpDrop({ localPath: '-S/bin/sh', host: 'user@h' })).toThrow()
  })

  it('localPath vazio/só-espaço lança antes de qualquer derivação de nome', () => {
    expect(() => buildScpDrop({ localPath: '', host: 'user@h' })).toThrow('Caminho local inválido')
    expect(() => buildScpDrop({ localPath: '   ', host: 'user@h' })).toThrow('Caminho local inválido')
  })

  // O plano (docs/planejamento/ssh-remoto.md T5) pede "localPath vazio/`..` → lança". Hoje isso só
  // valia INCIDENTALMENTE (via safeRemoteName do basename); aqui é checagem explícita do localPath:
  // exigir caminho ABSOLUTO barra relativo, '..' e, de quebra, o '-' inicial.
  it('localPath relativo ou com .. lança (exige caminho absoluto)', () => {
    expect(() => buildScpDrop({ localPath: '..', host: 'user@h' })).toThrow('Caminho local inválido')
    expect(() => buildScpDrop({ localPath: '../../etc/passwd', host: 'user@h' })).toThrow(
      'Caminho local inválido'
    )
    expect(() => buildScpDrop({ localPath: 'a.png', host: 'user@h' })).toThrow('Caminho local inválido')
    expect(() => buildScpDrop({ localPath: './a.png', host: 'user@h' })).toThrow('Caminho local inválido')
    expect(() => buildScpDrop({ localPath: '~/a.png', host: 'user@h' })).toThrow('Caminho local inválido')
  })

  it('caminho absoluto normal continua funcionando (a validação não pega o caso feliz)', () => {
    const r = buildScpDrop({ localPath: '/Users/f/Pictures/foto 1.png', host: 'user@h' })
    expect(r.scpArgs).toEqual([
      '--',
      '/Users/f/Pictures/foto 1.png',
      `user@h:${REMOTE_DROP_DIR}/foto_1.png`
    ])
    expect(r.remotePath).toBe(`${REMOTE_DROP_DIR}/foto_1.png`)
  })
})
