import { describe, it, expect, afterEach, vi } from 'vitest'
import { OrchestrationServer } from './OrchestrationServer'
import type { CanvasMirror, OrchestrationCommand } from '../../shared/orchestration'

let server: OrchestrationServer | undefined
afterEach(async () => { await server?.stop(); server = undefined })

function makeServer(
  mirror: CanvasMirror,
  commands: OrchestrationCommand[],
  extra: {
    ask?: (name: string, prompt: string) => { ok: boolean; error?: string }
    check?: (name: string) => { output: string } | null
  } = {}
) {
  server = new OrchestrationServer({
    getMirror: () => mirror,
    onCommand: (c) => commands.push(c),
    ...extra
  })
  return server
}

describe('OrchestrationServer', () => {
  it('GET /list com token retorna o espelho', async () => {
    const mirror: CanvasMirror = { nodes: [{ id: 'n1', type: 'note', name: 'Nota' }] }
    const s = makeServer(mirror, [])
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/list`, { headers: { 'x-orkestra-token': token } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(mirror)
  })

  it('sem token retorna 401', async () => {
    const s = makeServer({ nodes: [] }, [])
    const { port } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/list`)
    expect(res.status).toBe(401)
  })

  it('POST /note emite um comando updateNote', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/note`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'Nota', content: 'olá' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'updateNote', target: 'Nota', content: 'olá' }])
  })

  it('POST /note com content não-string retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/note`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'x', content: 123 })
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  it('POST /note com JSON malformado retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/note`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: '{bad'
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  it('POST /ask com {name, prompt} chama opts.ask e responde 200', async () => {
    const ask = vi.fn().mockReturnValue({ ok: true })
    const s = makeServer({ nodes: [] }, [], { ask })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/ask`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'agente-1', prompt: 'olá agente' })
    })
    expect(res.status).toBe(200)
    expect(ask).toHaveBeenCalledWith('agente-1', 'olá agente')
  })

  it('POST /ask retorna 404 quando opts.ask responde {ok:false}', async () => {
    const ask = vi.fn().mockReturnValue({ ok: false, error: 'não encontrado' })
    const s = makeServer({ nodes: [] }, [], { ask })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/ask`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'agente-desconhecido', prompt: 'olá' })
    })
    expect(res.status).toBe(404)
  })

  it('GET /check?name=X chama opts.check e responde {output}', async () => {
    const check = vi.fn().mockReturnValue({ output: 'saída do agente' })
    const s = makeServer({ nodes: [] }, [], { check })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/check?name=agente-1`, {
      headers: { 'x-orkestra-token': token }
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ output: 'saída do agente' })
    expect(check).toHaveBeenCalledWith('agente-1')
  })

  it('GET /check retorna 404 quando opts.check responde null', async () => {
    const check = vi.fn().mockReturnValue(null)
    const s = makeServer({ nodes: [] }, [], { check })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/check?name=desconhecido`, {
      headers: { 'x-orkestra-token': token }
    })
    expect(res.status).toBe(404)
  })
})
