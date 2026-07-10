import { createServer, type Server } from 'http'
import { randomBytes } from 'crypto'
import type { CanvasMirror, OrchestrationCommand } from '../../shared/orchestration'

interface Opts {
  getMirror: () => CanvasMirror
  onCommand: (cmd: OrchestrationCommand) => void
}

export class OrchestrationServer {
  private server?: Server
  private token = ''

  constructor(private opts: Opts) {}

  start(): Promise<{ port: number; token: string }> {
    this.token = randomBytes(24).toString('hex')
    this.server = createServer((req, res) => this.handle(req, res))
    return new Promise((resolve) => {
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
    if (req.method === 'POST' && req.url === '/note') {
      let body = ''
      req.on('data', (c) => { body += c })
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
    res.writeHead(404).end('not found')
  }
}
