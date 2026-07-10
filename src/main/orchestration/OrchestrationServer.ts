import { createServer, type Server } from 'http'
import { randomBytes } from 'crypto'
import type { CanvasMirror, OrchestrationCommand, PortalState } from '../../shared/orchestration'
import type { Routine } from '../../shared/routines'

interface Opts {
  getMirror: () => CanvasMirror
  onCommand: (cmd: OrchestrationCommand) => void
  ask?: (name: string, prompt: string) => { ok: boolean; error?: string }
  check?: (name: string) => { output: string } | null
  getPortalState?: (name: string) => PortalState | null
  // Fase 10 (Rotinas): CRUD fino sobre o RoutineScheduler do main. add() é o validador
  // (Task 2 hardened): lança em nome/schedule/target/command inválidos — as rotas abaixo
  // capturam esse throw e respondem 400 em vez de deixá-lo estourar a requisição.
  routines?: {
    list(): Routine[]
    add(r: Omit<Routine, 'id'>): Routine
    remove(id: string): void
  }
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

  private handle(req: import('http').IncomingMessage, res: import('http').ServerResponse): void {
    if (req.headers['x-orkestra-token'] !== this.token) {
      res.writeHead(401).end('unauthorized')
      return
    }
    if (req.method === 'GET' && req.url === '/list') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(this.opts.getMirror()))
      return
    }
    if (req.method === 'GET' && req.url === '/routines') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(this.opts.routines?.list() ?? []))
      return
    }
    if (req.method === 'POST' && req.url === '/note') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('error', () => { res.writeHead(400).end('bad request') })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { target?: unknown; content?: unknown }
          if (typeof parsed.target !== 'string' || typeof parsed.content !== 'string') {
            res.writeHead(400).end('bad request')
            return
          }
          this.opts.onCommand({ type: 'updateNote', target: parsed.target, content: parsed.content })
          res.writeHead(200).end('ok')
        } catch {
          res.writeHead(400).end('bad json')
        }
      })
      return
    }
    if (req.method === 'POST' && req.url === '/recruit') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('error', () => { res.writeHead(400).end('bad request') })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { name?: unknown; preset?: unknown; role?: unknown }
          if (
            typeof parsed.name !== 'string' ||
            typeof parsed.preset !== 'string' ||
            (parsed.role !== undefined && typeof parsed.role !== 'string')
          ) {
            res.writeHead(400).end('bad request')
            return
          }
          this.opts.onCommand({
            type: 'recruit',
            name: parsed.name,
            preset: parsed.preset,
            role: parsed.role as string | undefined
          })
          res.writeHead(200).end('ok')
        } catch {
          res.writeHead(400).end('bad json')
        }
      })
      return
    }
    if (req.method === 'POST' && req.url === '/dismiss') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('error', () => { res.writeHead(400).end('bad request') })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { target?: unknown }
          if (typeof parsed.target !== 'string') {
            res.writeHead(400).end('bad request')
            return
          }
          this.opts.onCommand({ type: 'dismiss', target: parsed.target })
          res.writeHead(200).end('ok')
        } catch {
          res.writeHead(400).end('bad json')
        }
      })
      return
    }
    if (req.method === 'POST' && req.url === '/connect') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('error', () => { res.writeHead(400).end('bad request') })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { source?: unknown; target?: unknown }
          if (typeof parsed.source !== 'string' || typeof parsed.target !== 'string') {
            res.writeHead(400).end('bad request')
            return
          }
          this.opts.onCommand({ type: 'connect', source: parsed.source, target: parsed.target })
          res.writeHead(200).end('ok')
        } catch {
          res.writeHead(400).end('bad json')
        }
      })
      return
    }
    if (req.method === 'POST' && req.url === '/routines') {
      if (!this.opts.routines) {
        res.writeHead(404).end('not found')
        return
      }
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('error', () => { res.writeHead(400).end('bad request') })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as {
            name?: unknown
            schedule?: unknown
            target?: unknown
            command?: unknown
          }
          // routines.add (RoutineScheduler, Task 2) é o validador: lança em name/schedule/
          // target/command ausentes, não-string ou vazios. O catch abaixo converte esse throw
          // em 400 — nunca deixamos a validação derrubar a requisição. Uma rotina recém-criada
          // nasce habilitada (enabled não é um campo do contrato HTTP; desabilitar é um passo
          // explícito via POST /routines/remove... via routines.toggle no IPC do renderer).
          this.opts.routines!.add({
            name: parsed.name as string,
            schedule: parsed.schedule as string,
            target: parsed.target as string,
            command: parsed.command as string,
            enabled: true
          })
          res.writeHead(200).end('ok')
        } catch {
          res.writeHead(400).end('bad request')
        }
      })
      return
    }
    if (req.method === 'POST' && req.url === '/routines/remove') {
      if (!this.opts.routines) {
        res.writeHead(404).end('not found')
        return
      }
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('error', () => { res.writeHead(400).end('bad request') })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { id?: unknown }
          if (typeof parsed.id !== 'string') {
            res.writeHead(400).end('bad request')
            return
          }
          this.opts.routines!.remove(parsed.id)
          res.writeHead(200).end('ok')
        } catch {
          res.writeHead(400).end('bad json')
        }
      })
      return
    }
    if (req.method === 'POST' && req.url === '/portal/open') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('error', () => { res.writeHead(400).end('bad request') })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { target?: unknown; url?: unknown }
          if (typeof parsed.target !== 'string' || typeof parsed.url !== 'string') {
            res.writeHead(400).end('bad request')
            return
          }
          this.opts.onCommand({ type: 'portalOpen', target: parsed.target, url: parsed.url })
          res.writeHead(200).end('ok')
        } catch {
          res.writeHead(400).end('bad json')
        }
      })
      return
    }
    if (req.method === 'POST' && req.url === '/portal/click') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('error', () => { res.writeHead(400).end('bad request') })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { target?: unknown; selector?: unknown }
          if (typeof parsed.target !== 'string' || typeof parsed.selector !== 'string') {
            res.writeHead(400).end('bad request')
            return
          }
          this.opts.onCommand({ type: 'portalClick', target: parsed.target, selector: parsed.selector })
          res.writeHead(200).end('ok')
        } catch {
          res.writeHead(400).end('bad json')
        }
      })
      return
    }
    if (req.method === 'POST' && req.url === '/portal/fill') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('error', () => { res.writeHead(400).end('bad request') })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { target?: unknown; selector?: unknown; text?: unknown }
          if (
            typeof parsed.target !== 'string' ||
            typeof parsed.selector !== 'string' ||
            typeof parsed.text !== 'string'
          ) {
            res.writeHead(400).end('bad request')
            return
          }
          this.opts.onCommand({
            type: 'portalFill',
            target: parsed.target,
            selector: parsed.selector,
            text: parsed.text
          })
          res.writeHead(200).end('ok')
        } catch {
          res.writeHead(400).end('bad json')
        }
      })
      return
    }
    if (req.method === 'POST' && req.url === '/portal/eval') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('error', () => { res.writeHead(400).end('bad request') })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { target?: unknown; js?: unknown }
          if (typeof parsed.target !== 'string' || typeof parsed.js !== 'string') {
            res.writeHead(400).end('bad request')
            return
          }
          this.opts.onCommand({ type: 'portalEval', target: parsed.target, js: parsed.js })
          res.writeHead(200).end('ok')
        } catch {
          res.writeHead(400).end('bad json')
        }
      })
      return
    }
    if (req.method === 'POST' && req.url === '/ask') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('error', () => { res.writeHead(400).end('bad request') })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { name?: unknown; prompt?: unknown }
          if (typeof parsed.name !== 'string' || typeof parsed.prompt !== 'string') {
            res.writeHead(400).end('bad request')
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
    }
    res.writeHead(404).end('not found')
  }
}
