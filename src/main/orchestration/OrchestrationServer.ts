import { createServer, type Server } from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import type { CanvasMirror, OrchestrationCommand, PortalState } from '../../shared/orchestration'
import { resolveContextNodes, formatContextBlocks } from '../../shared/contextResolver'

// Fase 14 (Task 3): cap de tamanho do corpo dos POSTs — payloads acima disso respondem 413
// antes de terminar de acumular (ver readJsonBody). 1 MB é folgado para os payloads reais
// deste servidor (nota/prompt/JS de portal), mas barra um corpo hostil ou acidentalmente
// gigante de consumir memória sem limite.
const MAX_BODY = 1_000_000

interface Opts {
  getMirror: () => CanvasMirror
  // BLD-6 (auditoria 2026-07-14): devolve se havia um renderer VIVO para receber o comando. Com a
  // janela fechada / webContents destruído, o main devolve false e o servidor responde 503 em vez
  // de 200 "ok" — o agente saberia que o comando NÃO foi aplicado, em vez de receber "ok" por algo
  // jogado fora. (Não cobre o descarte pelo guard de projeto do renderer, que é assíncrono e
  // invisível ao main — mas fecha o caso "janela fechada", o mais comum e detectável.)
  onCommand: (cmd: OrchestrationCommand) => boolean
  // Escopo de projeto (auditoria 2026-07-14): id do projeto ATIVO no ProjectManager, resolvido a
  // cada request. Os ptys sobrevivem à troca de projeto, então um agente do projeto A pode chamar
  // o orq enquanto o usuário exibe o projeto B — e tanto os comandos quanto as leituras (/list,
  // /context) atuariam sobre o canvas EXIBIDO (de B), misturando projetos. Com o resolver
  // presente e o header x-orkestra-project na request (injetado no env do pty ao spawnar),
  // mismatch → 409. Opcional para fail-open: header ausente (orq externo/legado) ou resolver
  // ausente (fakes de teste) mantêm o comportamento anterior.
  getActiveProjectId?: () => string | undefined
  ask?: (name: string, prompt: string) => { ok: boolean; error?: string }
  // Fase 14 (Task 1): variante bloqueante de ask — usada por POST /ask quando o body traz
  // wait:true. Aguarda o agente ficar ocioso (ver AgentBus.waitForIdle) antes de responder.
  askWait?: (name: string, prompt: string) => Promise<{ ok: boolean; output?: string; error?: string }>
  // R2 (orq ask --raw): usada por POST /ask quando o body traz raw:true. Escreve os bytes crus no
  // pty do agente (sem '\n'), para controlar TUIs/pagers. Fire-and-forget, como o ask normal.
  askRaw?: (name: string, data: string) => { ok: boolean; error?: string }
  check?: (name: string) => { output: string } | null
  getPortalState?: (name: string) => PortalState | null
}

export class OrchestrationServer {
  private server?: Server
  private token = ''

  constructor(private opts: Opts) {}

  start(): Promise<{ port: number; token: string }> {
    this.token = randomBytes(24).toString('hex')
    this.server = createServer((req, res) => this.handle(req, res))
    return new Promise((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        resolve({ port, token: this.token })
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
      this.server = undefined
    })
  }

  // Fase 14 (Task 3): comparação de token em tempo constante. `timingSafeEqual` lança se os
  // buffers tiverem tamanhos diferentes, então a guarda de comprimento vem primeiro — um
  // header ausente/não-string ou de comprimento diferente é 401 direto, sem invocar
  // timingSafeEqual. Só buffers de mesmo tamanho chegam à comparação byte-a-byte.
  private isAuthorized(req: import('http').IncomingMessage): boolean {
    const header = req.headers['x-orkestra-token']
    if (typeof header !== 'string') return false
    const provided = Buffer.from(header)
    const expected = Buffer.from(this.token)
    if (provided.length !== expected.length) return false
    return timingSafeEqual(provided, expected)
  }

  // Fase 14 (Task 3): centraliza o que antes eram ~11 blocos quase idênticos de
  // acúmulo+parse do corpo dos POSTs. Mantém um contador de bytes recebidos; ao ultrapassar
  // MAX_BODY, responde 413 e destrói a conexão sem chamar onOk (nem terminar o parse) — o
  // objetivo é não deixar um corpo hostil ficar sendo acumulado indefinidamente em memória.
  // A validação dos campos de cada rota (typeof name === 'string' etc.) continua em cada
  // onOk, inalterada — este helper só resolve o acúmulo, o cap e o JSON.parse.
  private readJsonBody(
    req: import('http').IncomingMessage,
    res: import('http').ServerResponse,
    onOk: (parsed: unknown) => void
  ): void {
    let body = ''
    let size = 0
    let aborted = false
    req.on('data', (chunk) => {
      if (aborted) return
      size += Buffer.byteLength(chunk)
      if (size > MAX_BODY) {
        aborted = true
        res.writeHead(413).end('payload too large')
        req.destroy()
        return
      }
      body += chunk
    })
    req.on('error', () => {
      if (aborted) return
      res.writeHead(400).end('bad request')
    })
    req.on('end', () => {
      if (aborted) return
      try {
        const parsed = JSON.parse(body) as unknown
        onOk(parsed)
      } catch {
        res.writeHead(400).end('bad json')
      }
    })
  }

  // Escopo de projeto: true quando a request declara um projeto (x-orkestra-project) e ele NÃO é
  // o ativo. Fail-closed só no mismatch explícito; header ausente ou ativo desconhecido → false.
  private isForeignProject(req: import('http').IncomingMessage): boolean {
    const requested = req.headers['x-orkestra-project']
    if (typeof requested !== 'string' || requested === '') return false
    const active = this.opts.getActiveProjectId?.()
    if (!active) return false
    return requested !== active
  }

  // BLD-6: emite o comando e responde conforme a entrega (200 se o renderer recebeu, 503 se não).
  private emit(cmd: OrchestrationCommand, res: import('http').ServerResponse): void {
    if (this.opts.onCommand(cmd)) res.writeHead(200).end('ok')
    else res.writeHead(503).end('app unavailable')
  }

  private handle(req: import('http').IncomingMessage, res: import('http').ServerResponse): void {
    if (!this.isAuthorized(req)) {
      res.writeHead(401).end('unauthorized')
      return
    }
    // Depois da auth, antes de qualquer rota: agente de projeto que não está ativo não pode nem
    // mutar nem LER o canvas exibido (o espelho é do projeto na tela, não o dele). 409 com corpo
    // estável — o orq o traduz numa mensagem de orientação para o agente.
    if (this.isForeignProject(req)) {
      res.writeHead(409).end('project not active')
      return
    }
    if (req.method === 'GET' && req.url === '/list') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(this.opts.getMirror()))
      return
    }
    if (req.method === 'POST' && req.url === '/note') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { target?: unknown; content?: unknown; from?: unknown }
        if (typeof parsed.target !== 'string' || typeof parsed.content !== 'string') {
          res.writeHead(400).end('bad request')
          return
        }
        // `from` (opcional): id do nó do terminal do agente (ORKESTRA_NODE_ID) — usado no renderer
        // para resolver as notas ligadas à SAÍDA desse terminal quando não há target explícito.
        const from = typeof parsed.from === 'string' ? parsed.from : undefined
        this.emit({ type: 'updateNote', target: parsed.target, content: parsed.content, from }, res)
      })
      return
    }
    if (req.method === 'POST' && req.url === '/recruit') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { name?: unknown; preset?: unknown; role?: unknown; from?: unknown }
        if (
          typeof parsed.name !== 'string' ||
          typeof parsed.preset !== 'string' ||
          (parsed.role !== undefined && typeof parsed.role !== 'string')
        ) {
          res.writeHead(400).end('bad request')
          return
        }
        // `from` (opcional, T3): id do nó do Maestro (ORKESTRA_NODE_ID) — o renderer usa para
        // posicionar o recruta ABAIXO do Maestro e auto-conectar. Mesmo padrão retrocompatível
        // de `/note`: ausente (orq legado) → undefined → o renderer cai na cascata.
        const from = typeof parsed.from === 'string' ? parsed.from : undefined
        this.emit(
          {
            type: 'recruit',
            name: parsed.name,
            preset: parsed.preset,
            role: parsed.role as string | undefined,
            from
          },
          res
        )
      })
      return
    }
    if (req.method === 'POST' && req.url === '/dismiss') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { target?: unknown }
        if (typeof parsed.target !== 'string') {
          res.writeHead(400).end('bad request')
          return
        }
        this.emit({ type: 'dismiss', target: parsed.target }, res)
      })
      return
    }
    if (req.method === 'POST' && req.url === '/connect') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { source?: unknown; target?: unknown }
        if (typeof parsed.source !== 'string' || typeof parsed.target !== 'string') {
          res.writeHead(400).end('bad request')
          return
        }
        this.emit({ type: 'connect', source: parsed.source, target: parsed.target }, res)
      })
      return
    }
    if (req.method === 'POST' && req.url === '/portal/open') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { target?: unknown; url?: unknown }
        if (typeof parsed.target !== 'string' || typeof parsed.url !== 'string') {
          res.writeHead(400).end('bad request')
          return
        }
        this.emit({ type: 'portalOpen', target: parsed.target, url: parsed.url }, res)
      })
      return
    }
    if (req.method === 'POST' && req.url === '/portal/click') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { target?: unknown; selector?: unknown }
        if (typeof parsed.target !== 'string' || typeof parsed.selector !== 'string') {
          res.writeHead(400).end('bad request')
          return
        }
        this.emit({ type: 'portalClick', target: parsed.target, selector: parsed.selector }, res)
      })
      return
    }
    if (req.method === 'POST' && req.url === '/portal/fill') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { target?: unknown; selector?: unknown; text?: unknown }
        if (
          typeof parsed.target !== 'string' ||
          typeof parsed.selector !== 'string' ||
          typeof parsed.text !== 'string'
        ) {
          res.writeHead(400).end('bad request')
          return
        }
        this.emit(
          { type: 'portalFill', target: parsed.target, selector: parsed.selector, text: parsed.text },
          res
        )
      })
      return
    }
    if (req.method === 'POST' && req.url === '/portal/eval') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { target?: unknown; js?: unknown }
        if (typeof parsed.target !== 'string' || typeof parsed.js !== 'string') {
          res.writeHead(400).end('bad request')
          return
        }
        this.emit({ type: 'portalEval', target: parsed.target, js: parsed.js }, res)
      })
      return
    }
    if (req.method === 'POST' && req.url === '/ask') {
      this.readJsonBody(req, res, (raw) => {
        // Fase 14 (Task 1): wait:true bifurca para askWait (bloqueante — espera o agente
        // ficar ocioso) e responde {output}. Sem wait (ou wait:false), segue o caminho ask
        // fire-and-forget de sempre, byte-a-byte igual à Fase 6. O try/catch aqui (distinto
        // do try/catch do JSON.parse já resolvido pelo readJsonBody) cobre uma askWait que
        // rejeite — preserva o comportamento pré-refactor de responder 400 nesse caso.
        void (async () => {
          try {
            const parsed = raw as { name?: unknown; prompt?: unknown; wait?: unknown; raw?: unknown }
            if (typeof parsed.name !== 'string' || typeof parsed.prompt !== 'string') {
              res.writeHead(400).end('bad request')
              return
            }
            // R2 (orq ask --raw): raw:true escreve os bytes crus no pty e responde na hora (sem
            // esperar) — precede o ramo wait para não confundir os dois modos.
            if (parsed.raw === true) {
              const result = this.opts.askRaw?.(parsed.name, parsed.prompt) ?? { ok: false, error: 'not available' }
              if (result.ok) {
                res.writeHead(200).end('ok')
              } else {
                res.writeHead(404).end(result.error ?? 'not found')
              }
              return
            }
            if (parsed.wait === true) {
              if (!this.opts.askWait) {
                res.writeHead(404).end('not found')
                return
              }
              const result = await this.opts.askWait(parsed.name, parsed.prompt)
              if (result.ok) {
                res.writeHead(200, { 'content-type': 'application/json' })
                res.end(JSON.stringify({ output: result.output ?? '' }))
              } else {
                res.writeHead(404).end(result.error ?? 'not found')
              }
              return
            }
            const result = this.opts.ask?.(parsed.name, parsed.prompt) ?? { ok: false, error: 'not available' }
            if (result.ok) {
              res.writeHead(200).end('ok')
            } else {
              res.writeHead(404).end(result.error ?? 'not found')
            }
          } catch {
            res.writeHead(400).end('bad json')
          }
        })()
      })
      return
    }
    if (req.method === 'GET') {
      const url = new URL(req.url ?? '', 'http://x')
      if (url.pathname === '/check') {
        const name = url.searchParams.get('name') ?? ''
        const result = this.opts.check?.(name) ?? null
        if (result) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(result))
        } else {
          res.writeHead(404).end('not found')
        }
        return
      }
      if (url.pathname === '/portal') {
        const name = url.searchParams.get('name') ?? ''
        const result = this.opts.getPortalState?.(name) ?? null
        if (result) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(result))
        } else {
          res.writeHead(404).end('not found')
        }
        return
      }
      if (url.pathname === '/context') {
        // orq context: reúne o conteúdo legível de tudo (nota/arquivo/site) ligado a este terminal,
        // em QUALQUER direção. Resolvido aqui no servidor a partir do espelho — não depende do timing
        // do agente estar pronto no prompt (ao contrário da injeção via pty.write no momento da
        // ligação). `from` = ORKESTRA_NODE_ID do terminal que rodou o comando.
        // Quick win #5: a resolução deixou de ser 1-salto (vizinhos diretos) e passou a atravessar
        // a cadeia de NOTAS transitivamente (BFS com guarda anti-ciclo e maxDepth). A regra pura
        // vive em ../../shared/contextResolver (sem HTTP/DOM); aqui só a plugamos ao espelho. O
        // formato do bloco e o filtro de conteúdo vazio seguem idênticos (formatContextBlocks).
        const from = url.searchParams.get('from') ?? ''
        const nodes = resolveContextNodes(this.opts.getMirror(), from)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ context: formatContextBlocks(nodes) }))
        return
      }
    }
    res.writeHead(404).end('not found')
  }
}
