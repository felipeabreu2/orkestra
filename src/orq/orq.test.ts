import { describe, it, expect, afterEach, vi } from 'vitest'
import { runOrq } from './orq'
import { OrchestrationServer } from '../main/orchestration/OrchestrationServer'
import type { CanvasMirror, OrchestrationCommand } from '../shared/orchestration'
import { serializeRoleSidecar, parseRoleSidecar } from '../shared/roleSidecar'

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
    getPortalState?: (name: string) => { url: string; title: string; text: string; dom?: string } | null
    getActiveProjectId?: () => string | undefined
    onCommand?: (cmd: OrchestrationCommand) => boolean
    runPortalAction?: (cmd: OrchestrationCommand) => Promise<{ ok: boolean } | null>
    readRoleSidecar?: (nodeId: string) => string | null
    writeRoleSidecar?: (nodeId: string, json: string) => boolean
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

  // T3b (Terminais): o espelho SEMPRE teve o papel de cada nó, mas o `orq list` nunca o mostrava —
  // o agente não sabia com quem estava falando. Papel presente entra como 4ª coluna; ausente/vazio
  // (notas, terminais sem papel) mantém as 3 colunas de sempre.
  it('list mostra o papel dos nós que têm um, e omite dos que não têm', async () => {
    const env = await startServer(
      {
        nodes: [
          { id: 't1', type: 'terminal', name: 'Dev', role: 'dev' },
          { id: 'n1', type: 'note', name: 'Spec' }
        ]
      },
      []
    )
    const { code, out } = await runOrq(['list'], env)
    expect(code).toBe(0)
    expect(out.split('\n')).toEqual(['terminal\tDev\tt1\tdev', 'note\tSpec\tn1'])
  })

  // T2 (quick win #7): "recrutas sabem quem são". orq whoami busca /list, resolve o próprio nó por
  // ORKESTRA_NODE_ID e descreve nome/papel/conexões (via describeSelf).
  it('whoami imprime o próprio nome/papel e as conexões, com código 0', async () => {
    const mirror = {
      nodes: [
        { id: 't1', type: 'terminal', name: 'Líder', role: 'Líder' },
        { id: 'n1', type: 'note', name: 'Spec' }
      ],
      edges: [{ source: 'n1', target: 't1' }]
    }
    const env = await startServer(mirror, [])
    const { code, out } = await runOrq(['whoami'], { ...env, ORKESTRA_NODE_ID: 't1' })
    expect(code).toBe(0)
    expect(out).toContain('Líder')
    expect(out).toContain('Spec')
  })

  it('list --me é um alias de whoami', async () => {
    const mirror = { nodes: [{ id: 't1', type: 'terminal', name: 'Líder', role: 'Líder' }], edges: [] }
    const env = await startServer(mirror, [])
    const { code, out } = await runOrq(['list', '--me'], { ...env, ORKESTRA_NODE_ID: 't1' })
    expect(code).toBe(0)
    expect(out).toContain('Líder')
  })

  it('whoami sem ORKESTRA_NODE_ID degrada com mensagem clara e código != 0', async () => {
    const env = await startServer({ nodes: [{ id: 't1', type: 'terminal', name: 'Líder' }] }, [])
    const { code, out } = await runOrq(['whoami'], env)
    expect(code).not.toBe(0)
    expect(out).toContain('não foi possível identificar')
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

  // T3 (#6): recruit passa o ORKESTRA_NODE_ID do Maestro como `from` (igual a `note write`), para o
  // renderer posicionar o recruta ABAIXO do Maestro e auto-conectar.
  it('recruit chama POST /recruit com {name, preset, role, from} e retorna código 0', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['recruit', 'Rev', 'claude', 'Reviewer'], { ...env, ORKESTRA_NODE_ID: 't1' })
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'recruit', name: 'Rev', preset: 'claude', role: 'Reviewer', from: 't1' }])
  })

  it('recruit sem role (opcional) ainda funciona e inclui o from', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['recruit', 'Rev', 'shell'], { ...env, ORKESTRA_NODE_ID: 't1' })
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'recruit', name: 'Rev', preset: 'shell', from: 't1' }])
  })

  // T4: o caminho REAL de ponta-a-ponta do `orq recruit "Dev"` (sem preset) — era ele que faltava.
  // O corpo sai sem o campo `preset` (JSON.stringify some com undefined) e o servidor precisa
  // aceitá-lo: só assim a herança de preset (resolveRecruitPreset, no renderer) é alcançável.
  it('recruit sem preset (orq recruit "Dev") chega ao servidor e emite o comando, sem 400', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['recruit', 'Dev'], { ...env, ORKESTRA_NODE_ID: 't1' })
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'recruit', name: 'Dev', from: 't1' }])
  })

  // T7 (reassign): troca o papel de um recruta mid-task. Mesmo padrão de `from` dos demais verbos de
  // gerência (ORKESTRA_NODE_ID do Maestro) — aqui ele serve ao gating de T6 (403 se não for Maestro).
  it('reassign chama POST /reassign com {target, role, from} e retorna código 0', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['reassign', 'Dev', 'Revisor'], { ...env, ORKESTRA_NODE_ID: 't1' })
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'reassign', target: 'Dev', role: 'Revisor', from: 't1' }])
  })

  it('reassign sem papel devolve a linha de uso (code 1) sem chamar o servidor', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code, out } = await runOrq(['reassign', 'Dev'], { ...env, ORKESTRA_NODE_ID: 't1' })
    expect(code).toBe(1)
    expect(out).toContain('orq reassign')
    expect(commands).toEqual([])
  })

  it('reassign de NÃO-Maestro (403) devolve a orientação do errOut e código != 0', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer(
      { nodes: [{ id: 'c1', type: 'terminal', name: 'Comum', maestro: false }] },
      commands
    )
    const { code, out } = await runOrq(['reassign', 'Dev', 'Revisor'], { ...env, ORKESTRA_NODE_ID: 'c1' })
    expect(code).not.toBe(0)
    expect(out).toContain('Maestro')
    expect(commands).toEqual([])
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

  // T1 (round-trip do booleano): quando o servidor tem runPortalAction (produção: aguarda o
  // resultado da ação no renderer), click/fill leem o corpo JSON {ok} e imprimem `ok: <bool>` —
  // sem precisar de um `orq portal snapshot` extra para saber se a ação pegou.
  it('portal click imprime ok: true quando a ação teve sucesso (runPortalAction)', async () => {
    const runPortalAction = vi.fn().mockResolvedValue({ ok: true })
    const env = await startServer({ nodes: [] }, [], { runPortalAction })
    const { code, out } = await runOrq(['portal', 'click', 'P', '#existe'], env)
    expect(code).toBe(0)
    expect(out).toContain('ok: true')
  })

  it('portal click imprime ok: false quando o elemento não existe (ação falhou, transporte ok)', async () => {
    const runPortalAction = vi.fn().mockResolvedValue({ ok: false })
    const env = await startServer({ nodes: [] }, [], { runPortalAction })
    const { code, out } = await runOrq(['portal', 'click', 'P', '.naoexiste'], env)
    expect(code).toBe(0) // HTTP 200 = transporte ok; o booleano é o resultado da ação
    expect(out).toContain('ok: false')
  })

  it('portal fill imprime ok: <bool> conforme o resultado da ação (runPortalAction)', async () => {
    const runPortalAction = vi.fn().mockResolvedValue({ ok: true })
    const env = await startServer({ nodes: [] }, [], { runPortalAction })
    const { code, out } = await runOrq(['portal', 'fill', 'P', '#in', 'olá'], env)
    expect(code).toBe(0)
    expect(out).toContain('ok: true')
  })

  it('portal click sem renderer vivo (runPortalAction -> null) responde 503 e código != 0', async () => {
    const runPortalAction = vi.fn().mockResolvedValue(null)
    const env = await startServer({ nodes: [] }, [], { runPortalAction })
    const { code, out } = await runOrq(['portal', 'click', 'P', '.x'], env)
    expect(code).not.toBe(0)
    expect(out).toContain('sem janela ativa')
  })

  // T2: back/forward/reload → POST /portal/nav com a action correspondente (união fechada).
  it('portal back/forward/reload emitem portalNavigate com a action certa', async () => {
    for (const action of ['back', 'forward', 'reload'] as const) {
      const commands: OrchestrationCommand[] = []
      const env = await startServer({ nodes: [] }, commands)
      const { code } = await runOrq(['portal', action, 'P'], env)
      expect(code).toBe(0)
      expect(commands).toEqual([{ type: 'portalNavigate', target: 'P', action }])
      await server?.stop()
      server = undefined
    }
  })

  // T3: scroll "<nome>" <dx> <dy> — números coeridos no cliente (dy default 0).
  it('portal scroll chama POST /portal/scroll com {target, x, y} numéricos', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['portal', 'scroll', 'P', '0', '800'], env)
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'portalScroll', target: 'P', x: 0, y: 800 }])
  })

  it('portal scroll com dy omitido usa 0', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    await runOrq(['portal', 'scroll', 'P', '0'], env)
    expect(commands).toEqual([{ type: 'portalScroll', target: 'P', x: 0, y: 0 }])
  })

  it('portal scroll coage argumentos não-numéricos para 0', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    await runOrq(['portal', 'scroll', 'P', 'abc', 'def'], env)
    expect(commands).toEqual([{ type: 'portalScroll', target: 'P', x: 0, y: 0 }])
  })

  // T5: create "<nome>" ["<url>"] → POST /portal/create; url opcional.
  it('portal create chama POST /portal/create com {name, url}', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['portal', 'create', 'Pesquisa', 'https://example.com'], env)
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'portalCreate', name: 'Pesquisa', url: 'https://example.com' }])
  })

  it('portal create só com nome (sem url) também funciona', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands)
    const { code } = await runOrq(['portal', 'create', 'Vazio'], env)
    expect(code).toBe(0)
    expect(commands).toEqual([{ type: 'portalCreate', name: 'Vazio' }])
  })

  // T4: snapshot --dom imprime a seção de elementos interativos (campo dom do estado); sem a flag,
  // o dom NÃO aparece (retrocompat — só url/title/text como antes).
  it('portal snapshot --dom inclui os seletores interativos (campo dom)', async () => {
    const getPortalState = vi
      .fn()
      .mockReturnValue({ url: 'https://x', title: 'X', text: 'corpo', dom: '[button] #enviar — Enviar' })
    const env = await startServer({ nodes: [] }, [], { getPortalState })
    const { code, out } = await runOrq(['portal', 'snapshot', 'P', '--dom'], env)
    expect(code).toBe(0)
    expect(out).toContain('#enviar')
  })

  it('portal snapshot --dom ANTES do nome do portal também funciona (flag em qualquer posição)', async () => {
    const getPortalState = vi
      .fn()
      .mockReturnValue({ url: 'https://x', title: 'X', text: 'corpo', dom: '[button] #enviar — Enviar' })
    const env = await startServer({ nodes: [] }, [], { getPortalState })
    const { code, out } = await runOrq(['portal', 'snapshot', '--dom', 'P'], env)
    expect(code).toBe(0)
    expect(out).toContain('#enviar')
    expect(getPortalState).toHaveBeenCalledWith('P')
  })

  it('portal snapshot --html é sinônimo de --dom, antes ou depois do nome', async () => {
    const state = { url: 'https://x', title: 'X', text: 'corpo', dom: '[button] #enviar — Enviar' }

    const depois = vi.fn().mockReturnValue(state)
    const envDepois = await startServer({ nodes: [] }, [], { getPortalState: depois })
    const r1 = await runOrq(['portal', 'snapshot', 'P', '--html'], envDepois)
    expect(r1.code).toBe(0)
    expect(r1.out).toContain('#enviar')
    expect(depois).toHaveBeenCalledWith('P')

    const antes = vi.fn().mockReturnValue(state)
    const envAntes = await startServer({ nodes: [] }, [], { getPortalState: antes })
    const r2 = await runOrq(['portal', 'snapshot', '--html', 'P'], envAntes)
    expect(r2.code).toBe(0)
    expect(r2.out).toContain('#enviar')
    expect(antes).toHaveBeenCalledWith('P')
  })

  it('portal snapshot sem --dom não inclui o dom (retrocompat)', async () => {
    const getPortalState = vi
      .fn()
      .mockReturnValue({ url: 'https://x', title: 'X', text: 'corpo da página', dom: '[button] #enviar — Enviar' })
    const env = await startServer({ nodes: [] }, [], { getPortalState })
    const { code, out } = await runOrq(['portal', 'snapshot', 'P'], env)
    expect(code).toBe(0)
    expect(out).toContain('corpo da página')
    expect(out).not.toContain('#enviar')
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

  // Escopo de projeto (auditoria 2026-07-14): o orq envia o ORKESTRA_PROJECT_ID do env (projeto
  // dono do terminal) em x-orkestra-project; agente de projeto que NÃO está ativo recebe uma
  // orientação clara em vez de mutar/ler o canvas do projeto exibido.
  it('comando de terminal do projeto ATIVO passa (header igual ao ativo)', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands, { getActiveProjectId: () => 'proj-A' })
    const { code } = await runOrq(['note', 'write', '--to', 'Spec', 'oi'], { ...env, ORKESTRA_PROJECT_ID: 'proj-A' })
    expect(code).toBe(0)
    expect(commands).toHaveLength(1)
  })

  it('comando de terminal de projeto NÃO-ativo falha com orientação (409), sem emitir comando', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer({ nodes: [] }, commands, { getActiveProjectId: () => 'proj-B' })
    const { code, out } = await runOrq(['note', 'write', '--to', 'Spec', 'oi'], { ...env, ORKESTRA_PROJECT_ID: 'proj-A' })
    expect(code).toBe(1)
    expect(out).toContain('NÃO está ativo')
    expect(commands).toEqual([])
  })

  it('leituras (list/context) de projeto NÃO-ativo também falham com a mesma orientação', async () => {
    const env = await startServer({ nodes: [{ id: 'n1', type: 'note', name: 'Spec' }] }, [], {
      getActiveProjectId: () => 'proj-B'
    })
    const list = await runOrq(['list'], { ...env, ORKESTRA_PROJECT_ID: 'proj-A' })
    expect(list.code).toBe(1)
    expect(list.out).toContain('NÃO está ativo')
    const ctx = await runOrq(['context'], { ...env, ORKESTRA_PROJECT_ID: 'proj-A', ORKESTRA_NODE_ID: 't1' })
    expect(ctx.code).toBe(1)
    expect(ctx.out).toContain('NÃO está ativo')
  })

  it('sem ORKESTRA_PROJECT_ID no env (orq externo/legado) segue funcionando', async () => {
    const env = await startServer({ nodes: [{ id: 'n1', type: 'note', name: 'Spec' }] }, [], {
      getActiveProjectId: () => 'proj-B'
    })
    const { code, out } = await runOrq(['list'], env)
    expect(code).toBe(0)
    expect(out).toContain('Spec')
  })

  it('squad monta 4 recrutas + 4 conexões à nota-spec (de um Maestro), em sequência', async () => {
    const commands: OrchestrationCommand[] = []
    const env = await startServer(
      { nodes: [{ id: 'm1', type: 'terminal', name: 'Maestro', maestro: true }] },
      commands
    )
    const { code } = await runOrq(['squad', 'claude', 'Spec'], { ...env, ORKESTRA_NODE_ID: 'm1' })
    expect(code).toBe(0)
    const recruits = commands.filter((c) => c.type === 'recruit')
    const connects = commands.filter((c) => c.type === 'connect')
    expect(recruits).toHaveLength(4)
    expect(connects).toHaveLength(4)
    expect(recruits.map((c) => (c as { name: string }).name)).toEqual(['Dev', 'Revisor', 'Testador', 'Docs'])
    expect(connects.every((c) => (c as { target: string }).target === 'Spec')).toBe(true)
  })
})

// BLD-6 (auditoria 2026-07-14): quando o app está sem janela ativa (onCommand devolve false), o
// servidor responde 503 e o orq traduz numa orientação clara, em vez de dizer "ok".
describe('runOrq — app sem janela ativa (503)', () => {
  it('note write com 503 devolve orientação e código != 0', async () => {
    const env = await startServer({ nodes: [] }, [], { onCommand: () => false })
    const { code, out } = await runOrq(['note', 'write', '--to', 'X', 'oi'], env)
    expect(code).not.toBe(0)
    expect(out).toContain('sem janela ativa')
  })
})

// T4 (orq role): ida-e-volta HTTP real do cliente — o parser puro é testado em ./role.test.ts.
// O sidecar dos fakes é o texto REAL do serializeRoleSidecar de produção.
describe('runOrq — role (T4)', () => {
  const node = { id: 'n1', type: 'terminal', name: 'Rev', role: 'revisor' }
  const roleJson = (prompt: string): string =>
    serializeRoleSidecar({ name: 'Revisor', color: 'var(--paper-orange)', prompt })

  it('role show imprime o prompt do papel', async () => {
    const env = await startServer({ nodes: [node] }, [], {
      readRoleSidecar: () => roleJson('revise o auth com cuidado')
    })
    const { code, out } = await runOrq(['role', 'show', 'Rev'], env)
    expect(code).toBe(0)
    expect(out).toBe('revise o auth com cuidado')
  })

  it('role write substitui o prompt inteiro', async () => {
    const written: string[] = []
    const env = await startServer({ nodes: [node] }, [], {
      readRoleSidecar: () => roleJson('antigo'),
      writeRoleSidecar: (_id, json) => {
        written.push(json)
        return true
      }
    })
    const { code, out } = await runOrq(['role', 'write', 'Rev', 'prompt novo inteiro'], env)
    expect(code).toBe(0)
    expect(out).toBe('ok')
    expect(parseRoleSidecar(written[0])?.prompt).toBe('prompt novo inteiro')
  })

  it('role edit troca uma substring do prompt', async () => {
    const written: string[] = []
    const env = await startServer({ nodes: [node] }, [], {
      readRoleSidecar: () => roleJson('revise o auth'),
      writeRoleSidecar: (_id, json) => {
        written.push(json)
        return true
      }
    })
    const { code } = await runOrq(['role', 'edit', 'Rev', 'auth', 'billing'], env)
    expect(code).toBe(0)
    expect(parseRoleSidecar(written[0])?.prompt).toBe('revise o billing')
  })

  it('role sem subcomando imprime o uso com código 2 (como os demais comandos)', async () => {
    const env = await startServer({ nodes: [node] }, [])
    const { code, out } = await runOrq(['role'], env)
    expect(code).toBe(2)
    expect(out).toContain('orq role show')
  })

  // Descobribilidade: a string de uso do orq é a segunda porta pela qual o agente encontra um verbo
  // (a primeira é o onboarding). O `orq squad` existiu invisível nas duas — este teste fecha uma.
  it('a string de uso do orq lista o comando role', async () => {
    const env = await startServer({ nodes: [node] }, [])
    const { code, out } = await runOrq(['comando-que-nao-existe'], env)
    expect(code).toBe(2)
    expect(out).toContain('orq role show|write|edit')
  })

  it('role show de um terminal sem papel avisa em vez de imprimir vazio', async () => {
    const env = await startServer({ nodes: [{ id: 'n2', type: 'terminal', name: 'Solto' }] }, [], {
      readRoleSidecar: () => null
    })
    const { code, out } = await runOrq(['role', 'show', 'Solto'], env)
    expect(code).toBe(0)
    expect(out).toContain('não tem papel')
  })

  // Escopo de projeto: papel não vaza entre projetos — o 409 vira a orientação padrão do errOut.
  it('role show de um terminal de projeto NÃO ativo devolve a orientação de 409', async () => {
    const env = await startServer({ nodes: [node] }, [], {
      getActiveProjectId: () => 'proj-B',
      readRoleSidecar: () => roleJson('x')
    })
    const { code, out } = await runOrq(['role', 'show', 'Rev'], { ...env, ORKESTRA_PROJECT_ID: 'proj-A' })
    expect(code).not.toBe(0)
    expect(out).toContain('NÃO está ativo')
  })
})

// T4c: o caminho REAL CLI→servidor do gating de escrita em terceiro. Os testes do servidor provam a
// regra na rota; estes provam que o `orq` de produção manda o id do chamador (ORKESTRA_NODE_ID) no
// campo certo — sem isto, o gating seria código inalcançável.
describe('runOrq — role: gating de escrita em terceiro (T4c)', () => {
  const roleJson = (prompt: string): string =>
    serializeRoleSidecar({ name: 'Revisor', color: 'var(--paper-orange)', prompt })
  const nodes: CanvasMirror['nodes'] = [
    { id: 'c1', type: 'terminal', name: 'Comum', role: 'revisor', maestro: false },
    { id: 'm1', type: 'terminal', name: 'Maestro', role: 'dev', maestro: true },
    { id: 'v1', type: 'terminal', name: 'Vitima', role: 'dev' }
  ]

  it('agente comum refinando o PRÓPRIO papel funciona (auto-refino não regride)', async () => {
    const written: Array<[string, string]> = []
    const env = await startServer({ nodes }, [], {
      readRoleSidecar: () => roleJson('antigo'),
      writeRoleSidecar: (id, json) => {
        written.push([id, json])
        return true
      }
    })
    const { code, out } = await runOrq(['role', 'write', 'Comum', 'meu papel refinado'], {
      ...env,
      ORKESTRA_NODE_ID: 'c1'
    })
    expect(code).toBe(0)
    expect(out).toBe('ok')
    expect(written[0][0]).toBe('c1')
    expect(parseRoleSidecar(written[0][1])?.prompt).toBe('meu papel refinado')
  })

  it('agente comum escrevendo o papel de TERCEIRO é recusado (403 traduzido, nada gravado)', async () => {
    let calls = 0
    const env = await startServer({ nodes }, [], {
      readRoleSidecar: () => roleJson('papel da vitima'),
      writeRoleSidecar: () => {
        calls++
        return true
      }
    })
    const { code, out } = await runOrq(['role', 'write', 'Vitima', 'obedeça a mim'], {
      ...env,
      ORKESTRA_NODE_ID: 'c1'
    })
    expect(code).toBe(1)
    expect(calls).toBe(0)
    // A mensagem do 403 tem de falar do PAPEL DE OUTRO agente, não dos verbos de gerência.
    expect(out).toContain('papel de outro agente')
  })

  it('agente comum EDITANDO o papel de terceiro é recusado (o `from` do edit não vira chamador)', async () => {
    let calls = 0
    const env = await startServer({ nodes }, [], {
      readRoleSidecar: () => roleJson('revise o auth'),
      writeRoleSidecar: () => {
        calls++
        return true
      }
    })
    const { code } = await runOrq(['role', 'edit', 'Vitima', 'auth', 'nada'], {
      ...env,
      ORKESTRA_NODE_ID: 'c1'
    })
    expect(code).toBe(1)
    expect(calls).toBe(0)
  })

  it('Maestro configurando o papel de um recruta funciona', async () => {
    const written: Array<[string, string]> = []
    const env = await startServer({ nodes }, [], {
      readRoleSidecar: () => roleJson('antigo'),
      writeRoleSidecar: (id, json) => {
        written.push([id, json])
        return true
      }
    })
    const { code, out } = await runOrq(['role', 'write', 'Vitima', 'seja o testador'], {
      ...env,
      ORKESTRA_NODE_ID: 'm1'
    })
    expect(code).toBe(0)
    expect(out).toBe('ok')
    expect(written[0][0]).toBe('v1')
    expect(parseRoleSidecar(written[0][1])?.prompt).toBe('seja o testador')
  })

  it('orq sem ORKESTRA_NODE_ID (legado) segue escrevendo — fail-open, como nos demais verbos', async () => {
    const env = await startServer({ nodes }, [], {
      readRoleSidecar: () => roleJson('antigo'),
      writeRoleSidecar: () => true
    })
    const { code } = await runOrq(['role', 'write', 'Vitima', 'x'], env)
    expect(code).toBe(0)
  })

  it('agente comum LENDO o papel de um colega segue funcionando (leitura livre)', async () => {
    const env = await startServer({ nodes }, [], { readRoleSidecar: () => roleJson('papel da vitima') })
    const { code, out } = await runOrq(['role', 'show', 'Vitima'], { ...env, ORKESTRA_NODE_ID: 'c1' })
    expect(code).toBe(0)
    expect(out).toBe('papel da vitima')
  })
})
