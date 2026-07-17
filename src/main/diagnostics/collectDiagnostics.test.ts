import { describe, it, expect } from 'vitest'
import { buildDiagnosticReport, type DiagnosticInput } from './collectDiagnostics'

const baseInput = (): DiagnosticInput => ({
  appVersion: '1.2.2',
  versions: { electron: '31.0.0', chrome: '126.0', node: '20.0.0' },
  platform: 'darwin',
  arch: 'arm64',
  memory: { rssBytes: 123456789, freeBytes: 987654321, totalBytes: 17179869184 },
  env: {
    ORKESTRA_TOKEN: 'sk-secreto-do-token',
    ANTHROPIC_API_KEY: 'abc123chave',
    PATH: '/usr/bin:/bin',
    LANG: 'pt_BR.UTF-8',
    HOME: '/Users/fulano'
  },
  knownSecrets: ['sk-secreto-do-token'],
  logs: [
    '[BOOT] ok',
    'request com token=sk-secreto-do-token no meio',
    'auth Bearer eyJhbGciOi.rest-do-jwt aqui',
    'ANTHROPIC_API_KEY=abc123chave vazou num log'
  ],
  projectCount: 3,
  nodeCounts: { terminal: 4, note: 7, portal: 1 }
})

describe('buildDiagnosticReport', () => {
  it('NUNCA contém segredos — nem no env, nem DENTRO das linhas de log', () => {
    const json = JSON.stringify(buildDiagnosticReport(baseInput()))
    expect(json).not.toContain('sk-secreto-do-token')
    expect(json).not.toContain('abc123chave')
    expect(json).not.toContain('eyJhbGciOi.rest-do-jwt')
  })

  it('as linhas redigidas continuam presentes e legíveis (com «redigido» no lugar do valor)', () => {
    const r = buildDiagnosticReport(baseInput())
    const linhaToken = r.logs.find((l) => l.includes('request com'))
    expect(linhaToken).toBeTruthy()
    expect(linhaToken).toContain('«redigido»')
  })

  it('env é ALLOWLIST (PATH/LANG/SHELL) — nunca o ambiente inteiro', () => {
    const r = buildDiagnosticReport(baseInput())
    expect(r.env.PATH).toBe('/usr/bin:/bin')
    expect(r.env.LANG).toBe('pt_BR.UTF-8')
    expect(Object.keys(r.env)).not.toContain('ORKESTRA_TOKEN')
    expect(Object.keys(r.env)).not.toContain('ANTHROPIC_API_KEY')
    expect(Object.keys(r.env)).not.toContain('HOME')
  })

  it('metadados seguros presentes; conteúdo do usuário são só CONTAGENS', () => {
    const r = buildDiagnosticReport(baseInput())
    expect(r.appVersion).toBe('1.2.2')
    expect(r.platform).toBe('darwin')
    expect(r.arch).toBe('arm64')
    expect(r.memory.rssBytes).toBe(123456789)
    expect(r.projectCount).toBe(3)
    expect(r.nodeCounts.terminal).toBe(4)
    const json = JSON.stringify(r)
    // nenhum campo de conteúdo (html/canvas/output) existe no shape
    expect(json).not.toContain('"html"')
    expect(json).not.toContain('"canvas"')
  })

  it('é determinística para o mesmo input (sem timestamps próprios/aleatoriedade)', () => {
    expect(buildDiagnosticReport(baseInput())).toEqual(buildDiagnosticReport(baseInput()))
  })
})
