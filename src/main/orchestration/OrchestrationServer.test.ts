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
    getPortalState?: (name: string) => { url: string; title: string; text: string; dom?: string } | null
    getActiveProjectId?: () => string | undefined
    onCommand?: (cmd: OrchestrationCommand) => boolean
  } = {}
) {
  server = new OrchestrationServer({
    getMirror: () => ({ edges: [], ...mirror }),
    onCommand: (c) => {
      commands.push(c)
      return true
    },
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

  // T3 (#6): /recruit lê o `from` opcional (id do nó do Maestro) e o inclui no comando emitido —
  // o renderer usa esse id para posicionar o recruta abaixo do Maestro e auto-conectar. Espelha
  // o padrão de `/note` (from opcional, retrocompatível).
  it('POST /recruit com from inclui o campo no comando emitido', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/recruit`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Rev', preset: 'claude', role: 'Reviewer', from: 't1' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'recruit', name: 'Rev', preset: 'claude', role: 'Reviewer', from: 't1' }])
  })

  it('POST /recruit sem from (legado) continua emitindo sem o campo (retrocompat, como /note)', async () => {
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

  // T4 (Modo Maestro): `preset` é OPCIONAL na API. `orq recruit "Dev"` monta o corpo SEM o campo
  // (JSON.stringify some com undefined); exigi-lo aqui devolvia 400 antes de o comando chegar ao
  // renderer — deixando a herança de preset (resolveRecruitPreset) inalcançável na prática. Sem
  // preset, o comando sai sem o campo e o renderer herda o do Maestro (default seguro 'shell').
  it('POST /recruit sem preset emite o comando sem o campo (herança resolvida no renderer)', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/recruit`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Dev', from: 't1' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'recruit', name: 'Dev', from: 't1' }])
  })

  // Opcional != sem contrato: quando presente, o preset continua tendo de ser string.
  it('POST /recruit com preset não-string retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/recruit`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Dev', preset: 42 })
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  it('POST /recruit com body vazio (sem name) retorna 400', async () => {
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

  // --- T6: gating server-side (só Maestro recruta/conecta/dispensa) ---

  it('POST /recruit de nó NÃO-Maestro (from com maestro:false) retorna 403 e não emite', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [{ id: 'c1', type: 'terminal', name: 'Comum', maestro: false }] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/recruit`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X', preset: 'claude', from: 'c1' })
    })
    expect(res.status).toBe(403)
    expect(commands).toEqual([])
  })

  it('POST /recruit de Maestro (from com maestro:true) emite normalmente (200)', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [{ id: 'm1', type: 'terminal', name: 'Maestro', maestro: true }] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/recruit`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X', preset: 'claude', from: 'm1' })
    })
    expect(res.status).toBe(200)
    expect(commands).toHaveLength(1)
  })

  it('POST /recruit sem from (legado) emite mesmo com Maestros no espelho (fail-open 200)', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [{ id: 'c1', type: 'terminal', name: 'Comum', maestro: false }] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/recruit`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X', preset: 'claude' })
    })
    expect(res.status).toBe(200)
    expect(commands).toHaveLength(1)
  })

  it('POST /connect de NÃO-Maestro (from=c1) retorna 403 e não emite', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [{ id: 'c1', type: 'terminal', name: 'Comum', maestro: false }] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/connect`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'A', target: 'B', from: 'c1' })
    })
    expect(res.status).toBe(403)
    expect(commands).toEqual([])
  })

  it('POST /connect de Maestro (from=m1) emite {source,target} sem vazar from', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [{ id: 'm1', type: 'terminal', name: 'Maestro', maestro: true }] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/connect`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'A', target: 'B', from: 'm1' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'connect', source: 'A', target: 'B' }])
  })

  it('POST /dismiss de NÃO-Maestro (from=c1) retorna 403 e não emite', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [{ id: 'c1', type: 'terminal', name: 'Comum', maestro: false }] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/dismiss`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'X', from: 'c1' })
    })
    expect(res.status).toBe(403)
    expect(commands).toEqual([])
  })

  it('POST /dismiss de Maestro (from=m1) emite {target} sem vazar from', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [{ id: 'm1', type: 'terminal', name: 'Maestro', maestro: true }] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/dismiss`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'X', from: 'm1' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'dismiss', target: 'X' }])
  })

  // T7 (reassign): rota nova. Contrato igual aos demais verbos de gerência — valida target/role
  // string (400), aplica o gating de Maestro (403) e emite o comando com o `from` (o renderer não
  // usa o from aqui, mas mantê-lo no comando espelha o recruit e deixa a origem auditável).
  it('POST /reassign emite um comando reassign', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/reassign`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'Dev', role: 'Revisor', from: 'm1' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'reassign', target: 'Dev', role: 'Revisor', from: 'm1' }])
  })

  it('POST /reassign sem from (legado) emite sem o campo', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/reassign`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'Dev', role: 'Revisor' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'reassign', target: 'Dev', role: 'Revisor' }])
  })

  it('POST /reassign com target não-string retorna 400 e não emite', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/reassign`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 42, role: 'Revisor' })
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  it('POST /reassign com role ausente retorna 400 e não emite', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/reassign`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'Dev' })
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  it('POST /reassign de NÃO-Maestro (from com maestro:false) retorna 403 e não emite', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [{ id: 'c1', type: 'terminal', name: 'Comum', maestro: false }] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/reassign`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'Dev', role: 'Revisor', from: 'c1' })
    })
    expect(res.status).toBe(403)
    expect(commands).toEqual([])
  })

  it('POST /reassign de Maestro (from com maestro:true) emite normalmente (200)', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [{ id: 'm1', type: 'terminal', name: 'Maestro', maestro: true }] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/reassign`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'Dev', role: 'Revisor', from: 'm1' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'reassign', target: 'Dev', role: 'Revisor', from: 'm1' }])
  })

  it('escopo de projeto (409) vem ANTES do gating de Maestro (403)', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [{ id: 'c1', type: 'terminal', name: 'Comum', maestro: false }] }, commands, {
      getActiveProjectId: () => 'proj-B'
    })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/recruit`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json', 'x-orkestra-project': 'proj-A' },
      body: JSON.stringify({ name: 'X', preset: 'claude', from: 'c1' })
    })
    expect(res.status).toBe(409) // projeto não-ativo é 409 (global), nunca chega ao 403 da rota
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

  // --- T2: navegação dedicada (POST /portal/nav, action ∈ {back,forward,reload}) ---

  it('POST /portal/nav emite portalNavigate para cada action válida', async () => {
    for (const action of ['back', 'forward', 'reload'] as const) {
      const commands: OrchestrationCommand[] = []
      const s = makeServer({ nodes: [] }, commands)
      const { port, token } = await s.start()
      const res = await fetch(`http://127.0.0.1:${port}/portal/nav`, {
        method: 'POST',
        headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
        body: JSON.stringify({ target: 'P', action })
      })
      expect(res.status).toBe(200)
      expect(commands).toEqual([{ type: 'portalNavigate', target: 'P', action }])
      await s.stop()
    }
  })

  it('POST /portal/nav com action fora da união fechada retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/nav`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'P', action: 'evil' })
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  // --- T3: rolagem dedicada (POST /portal/scroll, x/y devem ser number) ---

  it('POST /portal/scroll emite portalScroll com x/y numéricos', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/scroll`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'P', x: 0, y: 800 })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'portalScroll', target: 'P', x: 0, y: 800 }])
  })

  it('POST /portal/scroll com x não-numérico retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/scroll`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'P', x: '800', y: 0 })
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  // --- T5: agente cria portais (POST /portal/create, name string, url opcional) ---

  it('POST /portal/create emite portalCreate com {name, url}', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/create`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Docs', url: 'https://example.com' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'portalCreate', name: 'Docs', url: 'https://example.com' }])
  })

  it('POST /portal/create só com name (url ausente) emite sem o campo url', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/create`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Vazio' })
    })
    expect(res.status).toBe(200)
    expect(commands).toEqual([{ type: 'portalCreate', name: 'Vazio' }])
  })

  it('POST /portal/create com name não-string retorna 400', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal/create`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 123, url: 'https://example.com' })
    })
    expect(res.status).toBe(400)
    expect(commands).toEqual([])
  })

  // T4: GET /portal repassa o campo dom (novo) quando presente no estado.
  it('GET /portal repassa o campo dom quando presente no estado', async () => {
    const getPortalState = vi
      .fn()
      .mockReturnValue({ url: 'https://x', title: 'X', text: 'corpo', dom: '[button] #enviar — Enviar' })
    const s = makeServer({ nodes: [] }, [], { getPortalState })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/portal?name=P`, {
      headers: { 'x-orkestra-token': token }
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://x', title: 'X', text: 'corpo', dom: '[button] #enviar — Enviar' })
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

  // Escopo de projeto (auditoria 2026-07-14): os ptys sobrevivem à troca de projeto, então um
  // agente do projeto A pode emitir comandos enquanto o usuário exibe o projeto B — e o comando
  // mutaria/leria o canvas de B (o espelho é sempre o canvas EXIBIDO). Cada pty nasce com
  // ORKESTRA_PROJECT_ID; o orq envia em x-orkestra-project; o servidor rejeita com 409 quando o
  // projeto do agente NÃO é o ativo. Fail-open quando qualquer lado é desconhecido (header
  // ausente = orq externo/legado; getActiveProjectId ausente = testes/fakes antigos).
  it('request com x-orkestra-project DIFERENTE do ativo retorna 409 sem emitir comando', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands, { getActiveProjectId: () => 'proj-B' })
    const { port, token } = await s.start()
    const headers = { 'x-orkestra-token': token, 'content-type': 'application/json', 'x-orkestra-project': 'proj-A' }
    const post = await fetch(`http://127.0.0.1:${port}/note`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ target: 'Nota', content: 'de outro projeto' })
    })
    expect(post.status).toBe(409)
    const get = await fetch(`http://127.0.0.1:${port}/list`, { headers })
    expect(get.status).toBe(409) // leitura também: o espelho é do projeto exibido, não do agente
    expect(commands).toEqual([])
  })

  it('request com x-orkestra-project IGUAL ao ativo passa normalmente', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands, { getActiveProjectId: () => 'proj-A' })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/note`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json', 'x-orkestra-project': 'proj-A' },
      body: JSON.stringify({ target: 'Nota', content: 'ok' })
    })
    expect(res.status).toBe(200)
    expect(commands).toHaveLength(1)
  })

  it('request SEM header de projeto passa (orq externo/legado) mesmo com ativo conhecido', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands, { getActiveProjectId: () => 'proj-A' })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/list`, { headers: { 'x-orkestra-token': token } })
    expect(res.status).toBe(200)
  })

  it('sem getActiveProjectId nas opts, o header de projeto é ignorado (fail-open)', async () => {
    const commands: OrchestrationCommand[] = []
    const s = makeServer({ nodes: [] }, commands)
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/list`, {
      headers: { 'x-orkestra-token': token, 'x-orkestra-project': 'proj-A' }
    })
    expect(res.status).toBe(200)
  })

  it('mismatch de projeto com token INVÁLIDO ainda é 401 (auth vem antes do escopo)', async () => {
    const s = makeServer({ nodes: [] }, [], { getActiveProjectId: () => 'proj-B' })
    const { port } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/list`, {
      headers: { 'x-orkestra-token': 'errado', 'x-orkestra-project': 'proj-A' }
    })
    expect(res.status).toBe(401)
  })

  // BLD-6 (auditoria 2026-07-14): sem renderer vivo (janela fechada → onCommand devolve false), o
  // POST responde 503 em vez de 200 "ok" — o agente sabe que o comando NÃO foi aplicado.
  it('POST responde 503 quando onCommand não entrega (sem janela)', async () => {
    const s = makeServer({ nodes: [] }, [], { onCommand: () => false })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/note`, {
      method: 'POST',
      headers: { 'x-orkestra-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'Nota', content: 'x' })
    })
    expect(res.status).toBe(503)
  })

  // T1+T2 (quick win #5): o /context atravessa a cadeia de NOTAS transitivamente. Antes resolvia
  // só 1 salto (vizinhos diretos), então uma neta ligada por uma cadeia nota→nota ficava de fora.
  it('GET /context atravessa a cadeia de notas transitivamente (raiz E filha entram)', async () => {
    const mirror: CanvasMirror = {
      nodes: [
        { id: 'T', type: 'terminal', name: 'Agente' },
        { id: 'A', type: 'note', name: 'Raiz', content: 'conteúdo da raiz' },
        { id: 'B', type: 'note', name: 'Filha', content: 'conteúdo da filha' }
      ],
      edges: [
        { source: 'T', target: 'A' },
        { source: 'A', target: 'B' }
      ]
    }
    const s = makeServer(mirror, [])
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/context?from=T`, {
      headers: { 'x-orkestra-token': token }
    })
    expect(res.status).toBe(200)
    const { context } = (await res.json()) as { context: string }
    // Raiz primeiro (BFS), depois a filha alcançada pela cadeia note↔note.
    expect(context).toBe(
      '[contexto — nota: Raiz]\nconteúdo da raiz\n\n[contexto — nota: Filha]\nconteúdo da filha'
    )
  })

  it('GET /context de um terminal sem nada ligado devolve { context: "" }', async () => {
    const mirror: CanvasMirror = {
      nodes: [{ id: 'T', type: 'terminal', name: 'Agente' }],
      edges: []
    }
    const s = makeServer(mirror, [])
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/context?from=T`, {
      headers: { 'x-orkestra-token': token }
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ context: '' })
  })

  it('GET /context atravessa nota-raiz vazia e traz só a filha com conteúdo (filtro de vazio preservado)', async () => {
    const mirror: CanvasMirror = {
      nodes: [
        { id: 'T', type: 'terminal', name: 'Agente' },
        { id: 'A', type: 'note', name: 'Índice', content: '' },
        { id: 'B', type: 'note', name: 'Filha', content: 'só a filha tem conteúdo' }
      ],
      edges: [
        { source: 'T', target: 'A' },
        { source: 'A', target: 'B' }
      ]
    }
    const s = makeServer(mirror, [])
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/context?from=T`, {
      headers: { 'x-orkestra-token': token }
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ context: '[contexto — nota: Filha]\nsó a filha tem conteúdo' })
  })

  it('GET /context com x-orkestra-project divergente do ativo retorna 409 (herda o escopo de projeto)', async () => {
    const mirror: CanvasMirror = {
      nodes: [
        { id: 'T', type: 'terminal', name: 'Agente' },
        { id: 'A', type: 'note', name: 'Raiz', content: 'x' }
      ],
      edges: [{ source: 'T', target: 'A' }]
    }
    const s = makeServer(mirror, [], { getActiveProjectId: () => 'proj-B' })
    const { port, token } = await s.start()
    const res = await fetch(`http://127.0.0.1:${port}/context?from=T`, {
      headers: { 'x-orkestra-token': token, 'x-orkestra-project': 'proj-A' }
    })
    expect(res.status).toBe(409)
  })

})
