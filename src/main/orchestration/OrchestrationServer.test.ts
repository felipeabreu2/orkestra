import { describe, it, expect, afterEach, vi } from 'vitest'
import { OrchestrationServer } from './OrchestrationServer'
import type { CanvasMirror, OrchestrationCommand } from '../../shared/orchestration'

let server: OrchestrationServer | undefined
afterEach(async () => { await server?.stop(); server = undefined })

function makeServer(
  // edges opcional: completado com [] no getMirror abaixo (a maioria dos testes só precisa de nodes).
  mirror: { nodes: CanvasMirror['nodes']; edges?: CanvasMirror['edges'] },
  commands: OrchestrationCommand[],
  extra: {
    ask?: (name: string, prompt: string) => { ok: boolean; error?: string }
    askWait?: (name: string, prompt: string) => Promise<{ ok: boolean; output?: string; error?: string }>
    check?: (name: string) => { output: string } | null
    getPortalState?: (name: string) => { url: string; title: string; text: string } | null
  } = {}
) {
  server = new OrchestrationServer({
    getMirror: () => ({ edges: [], ...mirror }),
    onCommand: (c) => commands.push(c),
    ...extra
  })
  return server
}

describe('OrchestrationServer', () => {
  it('GET /list com token retorna o espelho', async () => {
    const mirror: CanvasMirror = { nodes: [{ id: 'n1', type: 'note', name: 'Nota' }], edges: [] }
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

  // Fase 14 (Task 3): comparação de token em tempo constante (crypto.timingSafeEqual).
  // Um token do MESMO comprimento do real, porém incorreto, precisa continuar dando 401 —
  // isso exercita o caminho que de fato chama timingSafeEqual (em vez de sair cedo só pela
  // guarda de comprimento, que sozinha não provaria que a comparação byte-a-byte funciona).
  it('token do mesmo comprimento do real, porém incorreto, retorna 401', async () => {
    const s = makeServer({ nodes: [] }, [])
    const { port, token } = await s.start()
    const wrongSameLength = token
      .split('')
      .map((c) => (c === 'a' ? 'b' : 'a'))
      .join('')
    expect(wrongSameLength).toHaveLength(token.length)
    expect(wrongSameLength).not.toBe(token)
    const res = await fetch(`http://127.0.0.1:${port}/list`, {
      headers: { 'x-orkestra-token': wrongSameLength }
    })
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

  // Fase 14 (Task 3): corpo maior que o cap (MAX_BODY = 1 MB) deve ser rejeitado cedo —
  // durante o acúmulo, não só no fim — e nunca chegar a chamar onCommand. Protege o servidor
  // local contra um payload hostil ou acidentalmente enorme (ex.: content gigante colado).
  it('POST /note com corpo maior que o cap (1 MB) é rejeitado e não chama onCommand', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    // > MAX_BODY (1_000_000 bytes), com folga para o overhead de aspas/chaves do JSON.
    const big = 'x'.repeat(1_100_000)
    // O servidor corta o corpo cedo (413) por defesa. Dependendo do SO/timing, o cliente ou
    // recebe o 413 (macOS/Linux) ou vê a conexão ser resetada enquanto ainda envia — no Windows
    // o Node reporta isso como "fetch failed" (throw). Ambos comprovam a rejeição ANTES de virar
    // comando; o invariante que realmente importa é: onCommand NUNCA é chamado.
    let outcome: number | 'rejeitado' = 'rejeitado'
    try {
      const res = await fetch(`http://127.0.0.1:${port}/note`, {
        method: 'POST',
        headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
        body: JSON.stringify({ target: 'Nota', content: big })
      })
      outcome = res.status
    } catch {
      outcome = 'rejeitado' // reset de conexão ao exceder o cap (Windows)
    }
    expect(outcome === 413 || outcome === 'rejeitado').toBe(true)
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

  // Fase 14 (Task 1): POST /ask com wait:true bloqueia na askWait (a versão que espera o
  // terminal ficar ocioso) em vez do ask fire-and-forget de sempre.
  it('POST /ask com {name, prompt, wait:true} chama opts.askWait e responde {output}', async () => {
    const askWait = vi.fn().mockResolvedValue({ ok: true, output: 'saída acumulada' })
    const s = makeServer({ nodes: [] }, [], { askWait })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/ask`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'agente-1', prompt: 'olá agente', wait: true })
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ output: 'saída acumulada' })
    expect(askWait).toHaveBeenCalledWith('agente-1', 'olá agente')
  })

  it('POST /ask com wait:true e askWait respondendo {ok:false} retorna 404', async () => {
    const askWait = vi.fn().mockResolvedValue({ ok: false, error: 'not found' })
    const s = makeServer({ nodes: [] }, [], { askWait })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/ask`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'fantasma', prompt: 'oi', wait: true })
    })
    expect(res.status).toBe(404)
  })

  it('POST /ask com wait:true mas sem askWait configurado retorna 404', async () => {
    const ask = vi.fn().mockReturnValue({ ok: true })
    const s = makeServer({ nodes: [] }, [], { ask })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/ask`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'agente-1', prompt: 'oi', wait: true })
    })
    expect(res.status).toBe(404)
    expect(ask).not.toHaveBeenCalled()
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

  it('GET /checkxyz (prefixo parecido) não casa com a rota /check — pathname exato', async () => {
    const check = vi.fn().mockReturnValue({ output: 'não deveria ser chamado' })
    const s = makeServer({ nodes: [] }, [], { check })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/checkxyz?name=agente-1`, {
      headers: { 'x-orkestra-token': token }
    })
    expect(res.status).toBe(404)
    expect(check).not.toHaveBeenCalled()
  })

  it('POST /recruit emite um comando recruit', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/recruit`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Rev', preset: 'claude', role: 'Reviewer' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'recruit', name: 'Rev', preset: 'claude', role: 'Reviewer' }])
  })

  it('POST /recruit sem role (opcional) ainda emite o comando', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/recruit`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Rev', preset: 'claude' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'recruit', name: 'Rev', preset: 'claude' }])
  })

  it('POST /recruit com body vazio (sem name/preset) retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/recruit`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({})
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  it('POST /dismiss emite um comando dismiss', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/dismiss`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'Rev' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'dismiss', target: 'Rev' }])
  })

  it('POST /dismiss com target não-string retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/dismiss`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 123 })
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  it('POST /connect emite um comando connect', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/connect`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'A', target: 'B' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'connect', source: 'A', target: 'B' }])
  })

  it('POST /connect com source ausente retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/connect`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'B' })
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  it('POST /portal/open emite um comando portalOpen', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/open`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'P', url: 'https://example.com' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'portalOpen', target: 'P', url: 'https://example.com' }])
  })

  it('POST /portal/open com url não-string retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/open`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'P', url: 123 })
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  it('POST /portal/click emite um comando portalClick', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/click`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'P', selector: '.x' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'portalClick', target: 'P', selector: '.x' }])
  })

  it('POST /portal/click com body inválido (sem selector) retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/click`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'P' })
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  it('POST /portal/fill emite um comando portalFill', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/fill`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'P', selector: '#in', text: 'olá' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'portalFill', target: 'P', selector: '#in', text: 'olá' }])
  })

  it('POST /portal/fill sem text retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/fill`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'P', selector: '#in' })
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  it('POST /portal/eval emite um comando portalEval', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/eval`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'P', js: 'document.title' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'portalEval', target: 'P', js: 'document.title' }])
  })

  it('POST /portal/eval com JSON malformado retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/eval`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: '{bad'
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  it('GET /portal?name=P devolve o estado injetado por getPortalState', async () => {
    const getPortalState = vi.fn().mockReturnValue({ url: 'https://x', title: 'X', text: 'conteúdo' })
    const s = makeServer({ nodes: [] }, [], { getPortalState })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal?name=P`, {
      headers: { 'x-orkestra-token': token }
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://x', title: 'X', text: 'conteúdo' })
    expect(getPortalState).toHaveBeenCalledWith('P')
  })

  it('GET /portal retorna 404 quando getPortalState responde null', async () => {
    const getPortalState = vi.fn().mockReturnValue(null)
    const s = makeServer({ nodes: [] }, [], { getPortalState })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal?name=desconhecido`, {
      headers: { 'x-orkestra-token': token }
    })
    expect(res.status).toBe(404)
  })

  it('GET /portal sem getPortalState nas opts retorna 404', async () => {
    const s = makeServer({ nodes: [] }, [])
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal?name=P`, {
      headers: { 'x-orkestra-token': token }
    })
    expect(res.status).toBe(404)
  })

  it('POST /portal/eval sem token retorna 401', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/eval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'P', js: '1' })
    })
    expect(res.status).toBe(401)
    expect(commands).toEqual([])
  })

  it('POST /portal/click sem token retorna 401', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/click`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'P', selector: '.x' })
    })
    expect(res.status).toBe(401)
    expect(commands).toEqual([])
  })

  it('GET /portal sem token retorna 401', async () => {
    const s = makeServer({ nodes: [] }, [])
    const { port } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal?name=P`)
    expect(res.status).toBe(401)
  })

  it('POST /portal/eval com js não-string retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/eval`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'P', js: 123 })
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

})
