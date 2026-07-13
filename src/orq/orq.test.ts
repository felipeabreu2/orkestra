import { describe, it, expect, afterEach, vi } from 'vitest'
import { runOrq } from './orq'
import { OrchestrationServer } from '../main/orchestration/OrchestrationServer'
import type { CanvasMirror, OrchestrationCommand } from '../shared/orchestration'

let server: OrchestrationServer | undefined
afterEach(async () => { await server?.stop(); server = undefined })

async function startServer(
  // edges opcional: a maioria dos testes só precisa de nodes. Completado com [] abaixo.
  mirror: { nodes: CanvasMirror['nodes']; edges?: CanvasMirror['edges'] },
  commands: OrchestrationCommand[],
  extra: {
    ask?: (name: string, prompt: string) => { ok: boolean; error?: string }
    askWait?: (name: string, prompt: string) => Promise<{ ok: boolean; output?: string; error?: string }>
    askRaw?: (name: string, data: string) => { ok: boolean; error?: string }
    check?: (name: string) => { output: string } | null
    getPortalState?: (name: string) => { url: string; title: string; text: string } | null
  } = {}
) {
  server = new OrchestrationServer({
    getMirror: () => ({ edges: [], ...mirror }),
    onCommand: (c) => commands.push(c),
    ...extra
  })
  const { port, token } = await server.start()
  return { ORKESTRA_PORT: String(port), ORKESTRA_TOKEN: token } as NodeJS.ProcessEnv
}

describe('runOrq', () => {
  // Fase 14 (Task 2): sem fetch global (Node < 18), runOrq deve falhar de forma amigável
  // (mensagem em stderr + código 1) em vez de deixar vazar um ReferenceError cru vindo de
  // dentro de um comando. Usamos vi.stubGlobal para sombrear `fetch` só durante este teste;
  // vi.unstubAllGlobals() no finally garante que não vaza para os demais testes deste arquivo.
  it('sem fetch global (Node < 18) escreve mensagem amigável em stderr e retorna código 1, sem lançar', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.stubGlobal('fetch', undefined)
    try {
      const { code } = await runOrq(['list'], { ORKESTRA_PORT: '1', ORKESTRA_TOKEN: 't' })
      expect(code).toBe(1)
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Node >= 18'))
    } finally {
      vi.unstubAllGlobals()
      stderrSpy.mockRestore()
    }
  })

  it('list imprime os nós do espelho', async () => {
    const env = await startServer({ nodes: [{ id: 'n1', type: 'note', name: 'Spec' }] }, [])
    const { code, out } = await runOrq(['list'], env)
    expect(code).toBe(0)
    expect(out).toContain('Spec')
  })

  it('context reúne o conteúdo dos blocos ligados a ESTE terminal (por ORKESTRA_NODE_ID)', async () => {
    const mirror = {
      nodes: [
        { id: 't1', type: 'terminal', name: 'Líder' },
        { id: 'n1', type: 'note', name: 'Spec', content: 'Você é o orquestrador. Faça X.' },
        { id: 'n2', type: 'note', name: 'Solta', content: 'nota nao ligada' }
      ],
      edges: [{ source: 'n1', target: 't1' }]
    }
    const env = await startServer(mirror, [])
    const { code, out } = await runOrq(['context'], { ...env, ORKESTRA_NODE_ID: 't1' })
    expect(code).toBe(0)
    expect(out).toContain('[contexto — nota: Spec]')
    expect(out).toContain('Você é o orquestrador. Faça X.')
    expect(out).not.toContain('nota nao ligada') // bloco não conectado não entra
  })

  it('context sem blocos conectados retorna aviso amigável', async () => {
    const env = await startServer({ nodes: [{ id: 't1', type: 'terminal', name: 'X' }] }, [])
    const { code, out } = await runOrq(['context'], { ...env, ORKESTRA_NODE_ID: 't1' })
    expect(code).toBe(0)
    expect(out).toContain('nenhum bloco')
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

  // Fase 14 (Task 1): --wait faz orq bloquear até o agente ficar ocioso e imprime o output
  // acumulado devolvido pelo servidor, em vez do "ok" fire-and-forget de sempre.
  it('ask com --wait chama POST /ask com wait:true e imprime o output retornado', async () => {
    const askWait = vi.fn().mockResolvedValue({ ok: true, output: 'saída acumulada do agente' })
    const env = await startServer({ nodes: [] }, [], { askWait })
    const { code, out } = await runOrq(['ask', 'Dev', 'oi', '--wait'], env)
    expect(code).toBe(0)
    expect(out).toBe('saída acumulada do agente')
    expect(askWait).toHaveBeenCalledWith('Dev', 'oi')
  })

  // Fix 4: --wait também deve funcionar fora da posição final. O parsing original desestruturava
  // argv posicionalmente ([cmd, sub, ...rest]) e usava `sub` (a palavra logo após "ask") como o
  // nome do agente sem filtrar "--wait" dessa posição primeiro — então "ask --wait Dev oi"
  // tratava "--wait" como o nome e nunca setava wait:true.
  it('ask com --wait logo apos o comando (posição não-final) ainda envia {name, prompt, wait:true} corretamente', async () => {
    const askWait = vi.fn().mockResolvedValue({ ok: true, output: 'saída acumulada do agente' })
    const env = await startServer({ nodes: [] }, [], { askWait })
    const { code, out } = await runOrq(['ask', '--wait', 'Dev', 'oi'], env)
    expect(code).toBe(0)
    expect(out).toBe('saída acumulada do agente')
    expect(askWait).toHaveBeenCalledWith('Dev', 'oi')
  })

  it('ask sem --wait continua fire-and-forget (não chama askWait)', async () => {
    const ask = vi.fn().mockReturnValue({ ok: true })
    const askWait = vi.fn().mockResolvedValue({ ok: true, output: 'não deveria ser usado' })
    const env = await startServer({ nodes: [] }, [], { ask, askWait })
    const { code, out } = await runOrq(['ask', 'Dev', 'oi'], env)
    expect(code).toBe(0)
    expect(out).toBe('ok')
    expect(ask).toHaveBeenCalledWith('Dev', 'oi')
    expect(askWait).not.toHaveBeenCalled()
  })

  it('ask com --wait retorna código != 0 quando o servidor responde not-found', async () => {
    const askWait = vi.fn().mockResolvedValue({ ok: false, error: 'not found' })
    const env = await startServer({ nodes: [] }, [], { askWait })
    const { code } = await runOrq(['ask', 'Fantasma', 'oi', '--wait'], env)
    expect(code).not.toBe(0)
  })

  // R2: --raw envia bytes crus (com escapes interpretados) via askRaw, sem \n e sem esperar.
  it('ask com --raw chama askRaw com os bytes interpretados (\\x03 -> Ctrl+C)', async () => {
    const askRaw = vi.fn().mockReturnValue({ ok: true })
    const ask = vi.fn().mockReturnValue({ ok: true })
    const env = await startServer({ nodes: [] }, [], { ask, askRaw })
    const { code, out } = await runOrq(['ask', 'Dev', '--raw', '\\x03'], env)
    expect(code).toBe(0)
    expect(out).toBe('ok')
    expect(askRaw).toHaveBeenCalledWith('Dev', '\x03')
    expect(ask).not.toHaveBeenCalled() // raw não passa pelo ask normal
  })

  it('ask com --raw interpreta \\e[B (seta pra baixo) e não acrescenta \\n', async () => {
    const askRaw = vi.fn().mockReturnValue({ ok: true })
    const env = await startServer({ nodes: [] }, [], { askRaw })
    await runOrq(['ask', 'Dev', '--raw', '\\e[B'], env)
    expect(askRaw).toHaveBeenCalledWith('Dev', '\x1b[B')
  })

  it('ask com --raw retorna código != 0 quando o agente não é encontrado', async () => {
    const env = await startServer({ nodes: [] }, [], { askRaw: () => ({ ok: false, error: 'not found' }) })
    const { code } = await runOrq(['ask', 'Fantasma', '--raw', '\\x03'], env)
    expect(code).not.toBe(0)
  })

  // R3: --batch manda o mesmo prompt para cada nome da lista CSV, em sequência (N POSTs /ask).
  it('ask com --batch envia o mesmo prompt a cada agente da lista', async () => {
    const calls: [string, string][] = []
    const ask = vi.fn((name: string, prompt: string) => {
      calls.push([name, prompt])
      return { ok: true }
    })
    const env = await startServer({ nodes: [] }, [], { ask })
    const { code, out } = await runOrq(['ask', '--batch', 'Dev,Revisor,Testador', 'rodem os testes'], env)
    expect(code).toBe(0)
    expect(out).toContain('3/3')
    expect(calls).toEqual([
      ['Dev', 'rodem os testes'],
      ['Revisor', 'rodem os testes'],
      ['Testador', 'rodem os testes']
    ])
  })

  it('ask com --batch tolera espaços na lista e ignora nomes vazios', async () => {
    const names: string[] = []
    const ask = vi.fn((name: string) => {
      names.push(name)
      return { ok: true }
    })
    const env = await startServer({ nodes: [] }, [], { ask })
    await runOrq(['ask', '--batch', 'Dev, Revisor ,', 'oi'], env)
    expect(names).toEqual(['Dev', 'Revisor'])
  })

  it('ask com --batch retorna código != 0 quando algum agente não é encontrado', async () => {
    const ask = vi.fn((name: string) => (name === 'Existe' ? { ok: true } : { ok: false, error: 'not found' }))
    const env = await startServer({ nodes: [] }, [], { ask })
    const { code, out } = await runOrq(['ask', '--batch', 'Existe,Fantasma', 'oi'], env)
    expect(code).not.toBe(0)
    expect(out).toContain('1/2')
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

  it('portal open chama POST /portal/open com {target, url} e retorna código 0', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['portal', 'open', 'P', 'https://example.com'], env)
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'portalOpen', target: 'P', url: 'https://example.com' }])
  })

  it('portal navigate é um alias de open', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['portal', 'navigate', 'P', 'https://example.com'], env)
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'portalOpen', target: 'P', url: 'https://example.com' }])
  })

  it('portal click chama POST /portal/click com {target, selector} e retorna código 0', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['portal', 'click', 'P', '.x'], env)
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'portalClick', target: 'P', selector: '.x' }])
  })

  it('portal fill chama POST /portal/fill com {target, selector, text} (texto multi-palavra junta com espaço)', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['portal', 'fill', 'P', '#in', 'olá', 'mundo'], env)
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'portalFill', target: 'P', selector: '#in', text: 'olá mundo' }])
  })

  it('portal eval chama POST /portal/eval com {target, js} e retorna código 0', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['portal', 'eval', 'P', 'document.title'], env)
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'portalEval', target: 'P', js: 'document.title' }])
  })

  it('portal snapshot chama GET /portal?name=<nome> e imprime o estado retornado', async () => {
    const getPortalState = vi.fn().mockReturnValue({ url: 'https://x', title: 'X', text: 'corpo da página' })
    const env = await startServer({ nodes: [] }, [], { getPortalState })
    const { code, out } = await runOrq(['portal', 'snapshot', 'P'], env)
    expect(code).toBe(0)
    expect(out).toContain('https://x')
    expect(out).toContain('X')
    expect(out).toContain('corpo da página')
    expect(getPortalState).toHaveBeenCalledWith('P')
  })

  it('portal snapshot retorna código != 0 quando o portal não é encontrado', async () => {
    const env = await startServer({ nodes: [] }, [], { getPortalState: () => null })
    const { code } = await runOrq(['portal', 'snapshot', 'Fantasma'], env)
    expect(code).not.toBe(0)
  })

  it('portal com subcomando desconhecido retorna código != 0', async () => {
    const env = await startServer({ nodes: [] }, [])
    const { code } = await runOrq(['portal', 'blah', 'P'], env)
    expect(code).not.toBe(0)
  })
})
