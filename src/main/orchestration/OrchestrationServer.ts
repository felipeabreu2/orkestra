import { createServer, type Server } from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import type {
  CanvasMirror,
  OrchestrationCommand,
  PortalActionResult,
  PortalState
} from '../../shared/orchestration'
import { resolveContextNodes, formatContextBlocks } from '../../shared/contextResolver'
import { serializeRoleSidecar } from '../../shared/roleSidecar'
import { applyRoleEdit, resolveRoleSidecar } from '../../shared/roleEdit'

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
  // T1 (round-trip do booleano de portal click/fill): variante ASSÍNCRONA de emit para as ações
  // que confirmam sucesso. A ponte main->renderer é unidirecional, então o main relaya o comando
  // com um requestId e só resolve esta promise quando o renderer devolve o booleano (IPC
  // portal:result); um timeout interno garante que ela sempre resolve. `null` = não havia renderer
  // vivo para receber (mesma semântica BLD-6 do onCommand → 503). Ausente (fakes de teste antigos,
  // orq legado) → o servidor cai no emit síncrono de sempre (fallback retrocompatível).
  runPortalAction?: (cmd: OrchestrationCommand) => Promise<PortalActionResult | null>
  // T4 (orq role): I/O do sidecar `role.json` do nó (~/.orkestra/agents/<nodeId>/role.json),
  // INJETADO — este servidor não faz fs, e assim as rotas /role são testáveis sem tocar no disco
  // do usuário. `readRoleSidecar` devolve o conteúdo cru (null = sem arquivo/ilegível — as rotas
  // caem no papel do espelho via resolveRoleSidecar); `writeRoleSidecar` devolve se gravou
  // (false → 500, o agente não pode receber "ok" por algo que não foi gravado). Ausentes (fakes
  // antigos) → 404, mesma degradação de ask/check.
  readRoleSidecar?: (nodeId: string) => string | null
  writeRoleSidecar?: (nodeId: string, json: string) => boolean
}

// T6 (gating do Modo Maestro): um nó só pode recrutar/conectar/dispensar se for um Maestro. Fail-open
// deliberado (mesma filosofia do escopo de projeto): sem `from` (orq legado/externo) ou nó desconhecido
// no espelho → permite; só BLOQUEIA quando o nó existe e está EXPLICITAMENTE marcado maestro:false
// (terminal comum criado pelo modal com o toggle desligado). data.maestro undefined (legado) = permitido.
export function isMaestro(mirror: CanvasMirror, fromId: string | undefined): boolean {
  if (!fromId) return true
  const node = mirror.nodes.find((n) => n.id === fromId)
  return !node || node.maestro !== false
}

// T4c (2026-07-16) — quem pode ESCREVER o `role.json` de um terminal.
//
// A T4 dispensou o gating do /role com uma premissa que a T4b derrubou: o sidecar era metadado
// INERTE, então "o raio de dano é um arquivo". Depois da T4b ele virou a FONTE DO PROMPT EFETIVO no
// spawn — escrever o role.json de um colega passou a ser escolher as instruções com que ele arranca.
// Como o alvo do `role write/edit` é por NOME, qualquer recruta comum podia fazer isso: escalação de
// privilégio num canvas multi-agente.
//
// Regra: auto-refino (callerId === targetId) é SEMPRE livre, Maestro ou não — é o caso de uso central
// da T4 e não pode regredir. Escrever em TERCEIRO é verbo de gerência: exige maestro:true, e por isso
// delega ao isMaestro (incluindo o fail-open dele para nó legado/desconhecido — decisão consciente,
// fixada em testes; não "consertar" aqui por tabela).
export function canWriteRole(mirror: CanvasMirror, callerId: string | undefined, targetId: string): boolean {
  // Sem chamador (orq legado/externo, sem ORKESTRA_NODE_ID): mesmo fail-open de `from` ausente nos
  // demais verbos — o isMaestro já decidiria assim, mas explicitar evita depender do acaso.
  if (!callerId) return true
  if (callerId === targetId) return true
  return isMaestro(mirror, callerId)
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

  // T1: emite uma ação de portal (click/fill) que CONFIRMA sucesso e responde `{ok}` JSON. Com
  // runPortalAction presente (produção), aguarda o round-trip do renderer: `null` = sem renderer
  // vivo → 503 (mesma orientação BLD-6); senão 200 com o booleano da ação (o webview morto entre
  // send e reply cai no timeout do registry → {ok:false}, resposta determinística, nunca pendura o
  // agente). Sem runPortalAction (fakes antigos / orq legado), cai no onCommand síncrono mas
  // responde no MESMO formato JSON — assim o orq lê o corpo de uma única forma. O `void async` aqui
  // espelha o ramo askWait; o try/catch cobre uma runPortalAction que rejeite (transporte quebrado).
  private emitPortalAction(cmd: OrchestrationCommand, res: import('http').ServerResponse): void {
    if (!this.opts.runPortalAction) {
      if (this.opts.onCommand(cmd)) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } else {
        res.writeHead(503).end('app unavailable')
      }
      return
    }
    void (async () => {
      try {
        const result = await this.opts.runPortalAction!(cmd)
        if (result === null) {
          res.writeHead(503).end('app unavailable')
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        // T7: screenshot devolve também o caminho do PNG gravado; click/fill seguem só com o ok.
        res.end(JSON.stringify(result.path ? { ok: result.ok, path: result.path } : { ok: result.ok }))
      } catch {
        res.writeHead(503).end('app unavailable')
      }
    })()
  }

  // T4: resolve o TERMINAL alvo do /role pelo nome no espelho (mesma regra best-effort por nome do
  // resto do orq: nomes duplicados resolvem para o primeiro). Devolve o nó — as rotas precisam do
  // `id` (chave do sidecar em disco) e do `role` (fallback quando não há arquivo).
  private terminalByName(name: string): CanvasMirror['nodes'][number] | undefined {
    return this.opts.getMirror().nodes.find((n) => n.type === 'terminal' && n.name === name)
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
        // T4: `preset` é OPCIONAL — mesmo contrato de `role`. `orq recruit "Dev"` monta o corpo SEM
        // o campo (JSON.stringify some com undefined); enquanto exigíamos string aqui, esse caminho
        // morria em 400 antes de chegar ao renderer e a herança de preset (resolveRecruitPreset)
        // era código inalcançável. Ausente → o renderer herda o preset do Maestro (`from`), com
        // 'shell' como default seguro. Presente → segue tendo de ser string.
        if (
          typeof parsed.name !== 'string' ||
          (parsed.preset !== undefined && typeof parsed.preset !== 'string') ||
          (parsed.role !== undefined && typeof parsed.role !== 'string')
        ) {
          res.writeHead(400).end('bad request')
          return
        }
        // `from` (opcional, T3): id do nó do Maestro (ORKESTRA_NODE_ID) — o renderer usa para
        // posicionar o recruta ABAIXO do Maestro e auto-conectar. Mesmo padrão retrocompatível
        // de `/note`: ausente (orq legado) → undefined → o renderer cai na cascata.
        const from = typeof parsed.from === 'string' ? parsed.from : undefined
        if (!isMaestro(this.opts.getMirror(), from)) {
          res.writeHead(403).end('not a maestro')
          return
        }
        this.emit(
          {
            type: 'recruit',
            name: parsed.name,
            preset: parsed.preset as string | undefined,
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
        const parsed = raw as { target?: unknown; from?: unknown }
        if (typeof parsed.target !== 'string') {
          res.writeHead(400).end('bad request')
          return
        }
        // T6: `from` só serve ao gating — nunca vaza no comando emitido.
        const from = typeof parsed.from === 'string' ? parsed.from : undefined
        if (!isMaestro(this.opts.getMirror(), from)) {
          res.writeHead(403).end('not a maestro')
          return
        }
        this.emit({ type: 'dismiss', target: parsed.target }, res)
      })
      return
    }
    if (req.method === 'POST' && req.url === '/reassign') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { target?: unknown; role?: unknown; from?: unknown }
        // target e role são AMBOS obrigatórios: reatribuir sem papel não tem semântica (limpar o
        // papel seria outro verbo), e o renderer precisa dos dois para resolver o nó e reiniciá-lo.
        if (typeof parsed.target !== 'string' || typeof parsed.role !== 'string') {
          res.writeHead(400).end('bad request')
          return
        }
        // T6: mesmo gating dos demais verbos de gerência (fail-open p/ `from` ausente/desconhecido).
        // Ao contrário de /connect e /dismiss, o `from` VAI no comando emitido — espelha /recruit e
        // deixa a origem da reatribuição auditável no renderer.
        const from = typeof parsed.from === 'string' ? parsed.from : undefined
        if (!isMaestro(this.opts.getMirror(), from)) {
          res.writeHead(403).end('not a maestro')
          return
        }
        this.emit({ type: 'reassign', target: parsed.target, role: parsed.role, from }, res)
      })
      return
    }
    // T4 (auto-refino do papel): escreve o prompt do papel do terminal alvo no sidecar. Dois modos
    // exclusivos — {name, prompt} (substitui inteiro) ou {name, from, to} (troca UMA substring, via
    // applyRoleEdit; `from` ausente no texto → grava o original, idempotente).
    //
    // ATENÇÃO ao `from` daqui: nas OUTRAS rotas `from` é o id do nó CHAMADOR (gating/posicionamento);
    // aqui é o trecho de texto a substituir (contrato do plano, paridade com `maestri role edit`).
    // Não reuse este corpo como referência de gating. Por isso o id do chamador chega em `caller`
    // (T4c) e NÃO em `from`: o nome já estava tomado, com outro significado.
    //
    // Gating (T4c, revisão da decisão do T4 após a T4b ligar o sidecar ao spawn): auto-refino
    // (caller === nó alvo) é livre para qualquer agente; escrever o papel de TERCEIRO exige
    // maestro:true — ver canWriteRole. LEITURA (GET /role) segue livre, sem gating.
    if (req.method === 'POST' && req.url === '/role') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { name?: unknown; prompt?: unknown; from?: unknown; to?: unknown; caller?: unknown }
        const isWrite = typeof parsed.prompt === 'string'
        const isEdit = typeof parsed.from === 'string' && typeof parsed.to === 'string'
        // Exatamente um dos dois modos: nem nenhum (nada a fazer), nem os dois (qual vence?).
        if (typeof parsed.name !== 'string' || isWrite === isEdit) {
          res.writeHead(400).end('bad request')
          return
        }
        const node = this.terminalByName(parsed.name)
        if (!node || !this.opts.writeRoleSidecar) {
          res.writeHead(404).end('not found')
          return
        }
        // `caller` = ORKESTRA_NODE_ID do terminal que rodou o orq. Mesmo tratamento retrocompatível
        // do `from` das outras rotas: ausente/não-string → undefined → fail-open. O 403 vem DEPOIS do
        // 404 (o espelho inteiro já é legível via /list, então o 404 não vaza nada novo).
        const caller = typeof parsed.caller === 'string' && parsed.caller !== '' ? parsed.caller : undefined
        if (!canWriteRole(this.opts.getMirror(), caller, node.id)) {
          res.writeHead(403).end('not a maestro')
          return
        }
        const current = resolveRoleSidecar(this.opts.readRoleSidecar?.(node.id) ?? null, node)
        // name/color do sidecar são PRESERVADOS: `role write/edit` mexe no prompt, não na identidade
        // visual do papel (o badge do canvas continua vindo do papel do nó).
        const prompt = isWrite
          ? (parsed.prompt as string)
          : applyRoleEdit(current.prompt, parsed.from as string, parsed.to as string)
        if (!this.opts.writeRoleSidecar(node.id, serializeRoleSidecar({ ...current, prompt }))) {
          res.writeHead(500).end('write failed')
          return
        }
        res.writeHead(200).end('ok')
      })
      return
    }
    if (req.method === 'POST' && req.url === '/connect') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { source?: unknown; target?: unknown; from?: unknown }
        if (typeof parsed.source !== 'string' || typeof parsed.target !== 'string') {
          res.writeHead(400).end('bad request')
          return
        }
        // T6: `from` só serve ao gating — nunca vaza no comando emitido.
        const from = typeof parsed.from === 'string' ? parsed.from : undefined
        if (!isMaestro(this.opts.getMirror(), from)) {
          res.writeHead(403).end('not a maestro')
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
        this.emitPortalAction(
          { type: 'portalClick', target: parsed.target, selector: parsed.selector },
          res
        )
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
        this.emitPortalAction(
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
    if (req.method === 'POST' && req.url === '/portal/screenshot') {
      // T7: captura de tela do portal. EXIGE o round-trip (runPortalAction): a resposta é o
      // caminho do PNG que o main gravou, e sem o canal de volta não existe caminho a devolver —
      // servidor legado/fake sem a opt responde 503 honesto, nunca um {ok:true} sem arquivo.
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { target?: unknown }
        if (typeof parsed.target !== 'string') {
          res.writeHead(400).end('bad request')
          return
        }
        if (!this.opts.runPortalAction) {
          res.writeHead(503).end('screenshot indisponível (app sem round-trip de portal)')
          return
        }
        this.emitPortalAction({ type: 'portalScreenshot', target: parsed.target }, res)
      })
      return
    }
    if (req.method === 'POST' && req.url === '/portal/nav') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { target?: unknown; action?: unknown }
        // action é uma união FECHADA (enum), validada aqui: só back/forward/reload passam — sem
        // superfície de string livre. O renderer aplica via método NATIVO do WebviewTag (T2).
        if (
          typeof parsed.target !== 'string' ||
          (parsed.action !== 'back' && parsed.action !== 'forward' && parsed.action !== 'reload')
        ) {
          res.writeHead(400).end('bad request')
          return
        }
        this.emit({ type: 'portalNavigate', target: parsed.target, action: parsed.action }, res)
      })
      return
    }
    if (req.method === 'POST' && req.url === '/portal/scroll') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { target?: unknown; x?: unknown; y?: unknown }
        // x/y devem chegar já numéricos (o orq coage no cliente); rejeitamos não-número aqui como
        // defesa (o renderer ainda re-coage via scrollScript, barreira anti-injeção final — T3).
        if (
          typeof parsed.target !== 'string' ||
          typeof parsed.x !== 'number' ||
          typeof parsed.y !== 'number'
        ) {
          res.writeHead(400).end('bad request')
          return
        }
        this.emit({ type: 'portalScroll', target: parsed.target, x: parsed.x, y: parsed.y }, res)
      })
      return
    }
    if (req.method === 'POST' && req.url === '/portal/create') {
      this.readJsonBody(req, res, (raw) => {
        const parsed = raw as { name?: unknown; url?: unknown }
        // name obrigatório; url opcional. A validação de ESQUEMA da url (isSafePortalUrl) fica no
        // renderer (T5), junto do addPortalNode — mesma barreira SEC-3 do portalOpen; aqui só o
        // contrato de tipos. url ausente → comando sem o campo (portal criado sem navegar).
        if (typeof parsed.name !== 'string' || (parsed.url !== undefined && typeof parsed.url !== 'string')) {
          res.writeHead(400).end('bad request')
          return
        }
        this.emit(
          typeof parsed.url === 'string'
            ? { type: 'portalCreate', name: parsed.name, url: parsed.url }
            : { type: 'portalCreate', name: parsed.name },
          res
        )
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
      if (url.pathname === '/role') {
        // T4: papel ATUAL do terminal alvo. Fonte: sidecar em disco → papel do nó no espelho
        // (resolveRoleSidecar), então `role show` responde mesmo em terminal que nunca gravou
        // arquivo (spawn anterior ao T3a). Nome desconhecido → 404, como /check.
        const node = this.terminalByName(url.searchParams.get('name') ?? '')
        if (!node) {
          res.writeHead(404).end('not found')
          return
        }
        const sidecar = resolveRoleSidecar(this.opts.readRoleSidecar?.(node.id) ?? null, node)
        res.writeHead(200, { 'content-type': 'application/json' })
        // Mesmo serializador do arquivo: a resposta é o sidecar, byte a byte no shape do contrato.
        res.end(serializeRoleSidecar(sidecar))
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
