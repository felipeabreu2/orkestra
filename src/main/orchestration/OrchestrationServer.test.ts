import { describe, it, expect, afterEach } from 'vitest'
import { OrchestrationServer } from './OrchestrationServer'
import type { CanvasMirror, OrchestrationCommand } from '../../shared/orchestration'

let server: OrchestrationServer | undefined
afterEach(async () => { await server?.stop(); server = undefined })

function makeServer(mirror: CanvasMirror, commands: OrchestrationCommand[]) {
  server = new OrchestrationServer({
    getMirror: () => mirror,
    onCommand: (c) => commands.push(c)
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
})
