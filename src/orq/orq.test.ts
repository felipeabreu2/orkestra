import { describe, it, expect, afterEach, vi } from 'vitest'
import { runOrq } from './orq'
import { OrchestrationServer } from '../main/orchestration/OrchestrationServer'
import type { CanvasMirror, OrchestrationCommand } from '../shared/orchestration'

let server: OrchestrationServer | undefined
afterEach(async () => { await server?.stop(); server = undefined })

async function startServer(
  mirror: CanvasMirror,
  commands: OrchestrationCommand[],
  extra: {
    ask?: (name: string, prompt: string) => { ok: boolean; error?: string }
    check?: (name: string) => { output: string } | null
  } = {}
) {
  server = new OrchestrationServer({ getMirror: () => mirror, onCommand: (c) => commands.push(c), ...extra })
  const { port, token } = await server.start()
  return { ORKESTRA_PORT: String(port), ORKESTRA_TOKEN: token } as NodeJS.ProcessEnv
}

describe('runOrq', () => {
  it('list imprime os nós do espelho', async () => {
    const env = await startServer({ nodes: [{ id: 'n1', type: 'note', name: 'Spec' }] }, [])
    const { code, out } = await runOrq(['list'], env)
    expect(code).toBe(0)
    expect(out).toContain('Spec')
  })

  it('note write envia o conteúdo ao servidor', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['note', 'write', 'conteúdo x'], env)
    expect(code).toBe(0)
    expect(commands[0]).toMatchObject({ type: 'updateNote', content: 'conteúdo x' })
  })

  it('sem env de servidor retorna código != 0', async () => {
    const { code } = await runOrq(['list'], {})
    expect(code).not.toBe(0)
  })

  it('ask chama POST /ask com {name, prompt} e retorna código 0', async () => {
    const ask = vi.fn().mockReturnValue({ ok: true })
    const env = await startServer({ nodes: [] }, [], { ask })
    const { code } = await runOrq(['ask', 'Dev', 'oi'], env)
    expect(code).toBe(0)
    expect(ask).toHaveBeenCalledWith('Dev', 'oi')
  })

  it('ask junta as palavras depois do nome como prompt único', async () => {
    const ask = vi.fn().mockReturnValue({ ok: true })
    const env = await startServer({ nodes: [] }, [], { ask })
    await runOrq(['ask', 'Dev', 'echo', 'oi', 'do', 'outro', 'agente'], env)
    expect(ask).toHaveBeenCalledWith('Dev', 'echo oi do outro agente')
  })

  it('ask retorna código != 0 quando o servidor responde not-found', async () => {
    const env = await startServer({ nodes: [] }, [], { ask: () => ({ ok: false, error: 'not found' }) })
    const { code } = await runOrq(['ask', 'Fantasma', 'oi'], env)
    expect(code).not.toBe(0)
  })

  it('check chama GET /check?name=<nome> e imprime o output retornado', async () => {
    const check = vi.fn().mockReturnValue({ output: 'saída recente do terminal Dev' })
    const env = await startServer({ nodes: [] }, [], { check })
    const { code, out } = await runOrq(['check', 'Dev'], env)
    expect(code).toBe(0)
    expect(out).toContain('saída recente do terminal Dev')
    expect(check).toHaveBeenCalledWith('Dev')
  })

  it('check retorna código != 0 quando o servidor não encontra o agente', async () => {
    const env = await startServer({ nodes: [] }, [], { check: () => null })
    const { code } = await runOrq(['check', 'Fantasma'], env)
    expect(code).not.toBe(0)
  })

  it('recruit chama POST /recruit com {name, preset, role} e retorna código 0', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['recruit', 'Rev', 'claude', 'Reviewer'], env)
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'recruit', name: 'Rev', preset: 'claude', role: 'Reviewer' }])
  })

  it('recruit sem role (opcional) ainda funciona', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['recruit', 'Rev', 'shell'], env)
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'recruit', name: 'Rev', preset: 'shell' }])
  })

  it('dismiss chama POST /dismiss com {target} e retorna código 0', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['dismiss', 'Rev'], env)
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'dismiss', target: 'Rev' }])
  })

  it('connect chama POST /connect com {source, target} e retorna código 0', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['connect', 'A', 'B'], env)
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'connect', source: 'A', target: 'B' }])
  })
})
