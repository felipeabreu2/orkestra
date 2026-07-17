import { app, BrowserWindow, ipcMain, dialog, Menu, Notification, shell, session } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { homedir, tmpdir, freemem, totalmem } from 'os'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { readdir, unlink, writeFile } from 'fs/promises'
import { isSafeNodeId } from '../shared/roleSidecar'
import { PtyManager } from './pty/PtyManager'
import { nodePtySpawner } from './pty/nodePtySpawner'
import { registerPtyIpc } from './pty/registerPtyIpc'
import { registerPersistenceIpc } from './persistence/registerPersistenceIpc'
import { ProjectManager } from './projects/ProjectManager'
import { registerProjectIpc } from './projects/registerProjectIpc'
import { FileTreeService } from './filetree/FileTreeService'
import { FileTreeWatcher } from './filetree/FileTreeWatcher'
import { registerFileTreeIpc } from './filetree/registerFileTreeIpc'
import { registerIdeIpc } from './ide/registerIdeIpc'
import { registerSshIpc } from './ssh/registerSshIpc'
import { registerRolesIpc } from './roles/registerRolesIpc'
import { OrchestrationServer } from './orchestration/OrchestrationServer'
import { PortalActionRegistry } from './orchestration/portalActionRegistry'
import { screenshotFilename, isScreenshotOf } from './orchestration/portalScreenshot'
import { buildAppMenu } from './menu'
import { Logger } from './diagnostics/Logger'
import { registerDiagnosticsIpc } from './diagnostics/registerDiagnosticsIpc'
import { buildDiagnosticReport } from './diagnostics/collectDiagnostics'
import { pushConsole } from '../shared/portalConsoleBuffer'
import { PortalStateStore } from './orchestration/portalStateStore'
import { installOrq } from './orchestration/installOrq'
import { buildEnvPath, resolveNvmBinDirs } from './orchestration/envPath'
import { AgentBus } from './orchestration/AgentBus'
import {
  NotificationCoalescer,
  buildAggregateBody,
  aggregateClickTarget,
  DEFAULT_COALESCE_WINDOW_MS
} from './orchestration/NotificationCoalescer'
import { setupAutoUpdater } from './updater'
import type { CanvasMirror, PortalState } from '../shared/orchestration'

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager(nodePtySpawner)
// Onda 3 · T9: watch de filesystem da árvore de arquivos. Nível de módulo (como o ptyManager) porque
// o before-quit precisa alcançá-lo para fechar os fs.watch na saída do app.
//
// O push é main -> renderer, unidirecional (mesmo padrão de 'orchestration:command'/'agent:frame').
// A guarda isDestroyed é obrigatória: os watchers vivem no MAIN e sobrevivem ao webContents, então
// sem ela um evento de fs chegando durante o teardown da janela derrubaria o processo. Aqui o evento
// é simplesmente descartado — o renderer que voltar re-assina do zero e re-lista, então não há
// estado a perder. O carimbo de projeto viaja DENTRO do evento (ver FileTreeWatcher/shared).
const fileTreeWatcher = new FileTreeWatcher((ev) => {
  if (!mainWindow || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send('filetree:changed', ev)
})
// Buffer de saída por pty + ask/read (Fase 6). track()/untrack() são geridos via o hook
// onSpawn de registerPtyIpc (abaixo) e o auto-untrack interno do próprio AgentBus (onExit).
//
// Fase 20 (Task 1): onAttention dispara quando um pty tracked produz output e depois fica
// ocioso (ver watcher em AgentBus.track) — resolve ptyId -> nodeId (PtyManager.nodeForPty) e
// avisa o renderer via IPC, além de notificar o SO quando a janela não está em foco.
// `agentBus` é construído aqui, ANTES de mainWindow existir (mainWindow só é atribuído dentro
// de createWindow(), chamada de dentro de app.whenReady() lá embaixo) — mas onAttention só é
// CHAMADO bem depois, quando algum pty realmente ficar ocioso. Por isso o callback lê a
// variável `mainWindow` no momento em que dispara (closure sobre a variável do módulo, `let`),
// e não uma referência capturada agora — nunca ficaria presa a `null`.
// Ombro T6 — coalescer anti-spam: os eventos de atenção com a janela fora de foco são enfileirados
// numa janela curta e o `onFlush` monta e dispara UMA Notification (agregada se ≥2 na rajada; a
// individual rica da T4 se só 1). Declarado ANTES de `agentBus` para o closure de onAttention (que
// roda muito depois, quando um pty fica ocioso) referenciá-lo já inicializado.
const attentionCoalescer = new NotificationCoalescer((events) => {
  // A janela pode ter voltado ao foco durante a janela de coalescência; não re-checamos — os eventos
  // já foram enfileirados com a janela FORA de foco (mesmo comportamento pré-coalescer). Tudo dentro
  // do try/catch: notificações nativas podem faltar/ser negadas no SO — nunca travar o app.
  try {
    // Ombro T4 — corpo enriquecido: título por status (precisa de você / travou / ficou ocioso) +
    // prévia da última linha, para 1 evento; contagem + nomes para a rajada agregada.
    const { title, body } = buildAggregateBody(events)
    const notification = new Notification({ title, body })
    // Ombro T2 — clicar na notificação traz a janela à frente (mesmo minimizada) e enquadra o nó do
    // agente (o primeiro/mais antigo da rajada; ver aggregateClickTarget). Nó ausente no canvas atual
    // (agente de outro projeto) = no-op seguro no renderer.
    const targetNodeId = aggregateClickTarget(events)
    notification.on('click', () => {
      if (!mainWindow) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      if (targetNodeId && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('agent:frame', targetNodeId)
      }
    })
    notification.show()
  } catch {
    // Notificações nativas podem faltar/ser negadas dependendo do SO — nunca travar o app.
  }
}, DEFAULT_COALESCE_WINDOW_MS)

const agentBus = new AgentBus(ptyManager, {
  onAttention: (ptyId) => {
    const nodeId = ptyManager.nodeForPty(ptyId)
    if (!nodeId) return
    // "Monitorar atividade" desligado (Fase 29, data.monitor === false via mirror): não sinaliza
    // atenção nem notifica este terminal.
    const node = mirror.nodes.find((n) => n.id === nodeId)
    if (node?.monitor === false) return
    // BLD-9: guard isDestroyed — na janela entre a destruição do webContents e o evento 'closed'
    // (que zera mainWindow), um send() num objeto destruído lançaria dentro deste callback.
    if (mainWindow && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('agent:attention', nodeId)
    }
    // Só notifica o SO com a janela FORA de foco (guard mantido). Em vez de criar a Notification
    // inline, roteia pelo coalescer (T6): lê o nome do agente do mirror e o buffer via
    // agentBus.read(ptyId) UMA vez, e enfileira o evento — o onFlush acima monta e dispara.
    if (mainWindow && !mainWindow.isFocused()) {
      attentionCoalescer.push({ nodeId, agentName: node?.name, bufferText: agentBus.read(ptyId) })
    }
  }
})

// Espelho leve do canvas (renderer -> main via 'orchestration:sync'), servido em GET /list e /context.
let mirror: CanvasMirror = { nodes: [], edges: [] }
// Escopo de projeto (auditoria 2026-07-14): resolver late-bound do projeto ATIVO — preenchido em
// whenReady (o ProjectManager nasce lá), lido a cada request do OrchestrationServer e a cada
// relay de comando. `let` + closure, mesmo padrão de mainWindow acima.
let resolveActiveProjectId: () => string | undefined = () => undefined
// Estado reportado por cada portal, atualizado via IPC 'portal:state' a cada did-finish-load do
// <webview> correspondente (PortalNode); servido em GET /portal. T9: a chave é COMPOSTA
// (projectId, name) — ver PortalStateStore — para um snapshot do projeto A nunca responder a um
// `orq portal snapshot` rodado no projeto B (gap #8, resíduo cross-project).
const portalStates = new PortalStateStore<PortalState>()
// T8: console de cada portal (últimas linhas), alimentado via IPC 'portal:console' pelos batches
// do PortalNode; ring-buffer com cap no pushConsole (uma página com log em loop não cresce sem
// teto). Servido em GET /portal/console. T9: mesma chave composta do portalStates.
const portalConsoles = new PortalStateStore<string[]>()
// T1 (round-trip do booleano de portal click/fill): pendências de ação por requestId. A ponte
// main->renderer é unidirecional (webContents.send), então o resultado da ação volta pelo canal
// separado 'portal:result' (ipcMain.on lá embaixo) e resolve a promise correspondente. Timeout
// interno do registry evita pendurar o agente se o webview morrer entre o send e o reply.
const portalActions = new PortalActionRegistry()
// Env extra injetado em todo pty spawnado; populado após orchestration.start() (porta+token).
let orchestrationEnv: Record<string, string> = {}
// Resiliência T1/T4 — "Ajuda → Reportar um Problema" no menu chama isto. Late-bound (mesmo padrão
// do resolveActiveProjectId acima): o menu nasce no whenReady, o fluxo real de export (T4, com
// dialog + coleta redigida) é plugado quando o registro de diagnóstico sobe. Antes disso, no-op.
let runDiagnosticsExport: () => Promise<void> = async () => {}

// Resiliência T2 — logger rotativo em userData/logs (SUBPASTA própria; nunca varrer o userData,
// compartilhado com o Cache do Chromium). O construtor não toca o disco (lazy) — seguro no
// top-level. `obs()` é o eco DUPLO dos eventos de observabilidade: console.error continua (dev/
// stderr de sempre) e a mesma linha vai ao arquivo/ring, que é o que o diagnóstico (T3/T4) coleta.
const logger = new Logger(join(app.getPath('userData'), 'logs'))
function obs(...parts: unknown[]): void {
  console.error(...parts)
  logger.write(parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' '))
}

// Resolve um terminal pelo nome atual no espelho do canvas -> ptyId (via PtyManager). Nomes
// duplicados resolvem para o primeiro nó encontrado; renomear é responsabilidade do usuário.
function resolvePtyByName(name: string): string | undefined {
  const node = mirror.nodes.find((n) => n.type === 'terminal' && n.name === name)
  return node ? ptyManager.ptyIdForNode(node.id) : undefined
}

// T4 (orq role): I/O do sidecar `role.json` do agente, em ~/.orkestra/agents/<nodeId>/ — MESMO
// caminho que o spawn grava (registerPtyIpc.writeRoleSidecar), FORA do repositório do usuário. O
// isSafeNodeId é o mesmo guard anti-traversal de lá: o id vem do espelho do renderer, e ele é
// componente de caminho. Leitura tolerante (arquivo ausente/ilegível → null, o servidor cai no
// papel do espelho); escrita devolve se gravou (false → 500, o agente não recebe "ok" à toa).
function roleSidecarPath(nodeId: string): string {
  return join(homedir(), '.orkestra', 'agents', nodeId, 'role.json')
}

const orchestration = new OrchestrationServer({
  getMirror: () => mirror,
  readRoleSidecar: (nodeId) => {
    if (!isSafeNodeId(nodeId)) return null
    try {
      return readFileSync(roleSidecarPath(nodeId), 'utf-8')
    } catch {
      return null
    }
  },
  writeRoleSidecar: (nodeId, json) => {
    if (!isSafeNodeId(nodeId)) return false
    try {
      mkdirSync(join(homedir(), '.orkestra', 'agents', nodeId), { recursive: true })
      writeFileSync(roleSidecarPath(nodeId), json, 'utf-8')
      return true
    } catch {
      return false
    }
  },
  // O comando segue carimbado com o projeto ativo NO MOMENTO do relay: o renderer só aplica se
  // ainda estiver exibindo esse projeto (useOrchestrationSync) — cobre a janela de ms no meio de
  // uma troca em que o main já apontou para o projeto novo e o canvas antigo ainda está na tela.
  // BLD-6/BLD-9: devolve se havia um renderer VIVO para receber (guard isDestroyed) — o servidor
  // responde 503 quando não, em vez de mentir "ok" ao agente. Sem janela (macOS a mantém viva sem
  // janela) ou webContents destruído → false.
  onCommand: (cmd) => {
    if (!mainWindow || mainWindow.webContents.isDestroyed()) return false
    mainWindow.webContents.send('orchestration:command', cmd, resolveActiveProjectId() ?? null)
    return true
  },
  getActiveProjectId: () => resolveActiveProjectId(),
  ask: (name, prompt) => {
    const p = resolvePtyByName(name)
    if (!p) return { ok: false, error: 'not found' }
    agentBus.ask(p, prompt)
    return { ok: true }
  },
  // Fase 14 (Task 1): variante bloqueante de ask — envia o prompt e só resolve quando o
  // terminal alvo ficar ocioso (ver AgentBus.waitForIdle), devolvendo o output acumulado.
  askWait: async (name, prompt) => {
    const p = resolvePtyByName(name)
    if (!p) return { ok: false, error: 'not found' }
    agentBus.ask(p, prompt)
    const output = await agentBus.waitForIdle(p)
    return { ok: true, output }
  },
  // R2 (orq ask --raw): escreve os bytes crus no pty do agente (sem '\n') — controlar TUIs/pagers.
  askRaw: (name, data) => {
    const p = resolvePtyByName(name)
    if (!p) return { ok: false, error: 'not found' }
    agentBus.writeRaw(p, data)
    return { ok: true }
  },
  check: (name) => {
    const p = resolvePtyByName(name)
    return p ? { output: agentBus.read(p) } : null
  },
  // T9: a leitura resolve pelo projeto ATIVO do main (autoridade), não pelo hint do payload —
  // snapshot/console só devolvem estado do projeto exibido; de outro projeto → null (404).
  getPortalState: (name) => portalStates.get(resolveActiveProjectId() ?? null, name),
  // T8: linhas de console bufferizadas do portal (null → 404 na rota).
  getPortalConsole: (name) => portalConsoles.get(resolveActiveProjectId() ?? null, name),
  // T1: variante ASSÍNCRONA do relay para as ações que confirmam sucesso (click/fill). Gera um
  // requestId, registra a pendência e carimba o comando com ele no MESMO canal unidirecional
  // 'orchestration:command' (sem abrir canal novo por ação — minimiza a superfície); o renderer
  // roda o script, lê o booleano (clickScript/fillScript já o retornam) e devolve por
  // 'portal:result'. Sem renderer vivo → null (o servidor traduz em 503, orientação BLD-6). O
  // projectId vai carimbado igual ao onCommand: se o renderer descartar pelo guard de projeto
  // (janela de ms numa troca), o timeout do registry cobre — nunca pendura o agente.
  runPortalAction: async (cmd) => {
    if (!mainWindow || mainWindow.webContents.isDestroyed()) return null
    const requestId = randomUUID()
    const pending = portalActions.register(requestId)
    mainWindow.webContents.send(
      'orchestration:command',
      { ...cmd, requestId },
      resolveActiveProjectId() ?? null
    )
    return pending
  }
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Fase 9 (Portais): habilita a tag <webview> no renderer para o PortalNode hospedar um
      // browser embutido dirigível. contextIsolation/sandbox/nodeIntegration acima permanecem
      // inalterados — o próprio <webview> roda isolado (nodeintegration off por padrão),
      // então conteúdo web não confiável carregado nele não alcança o processo main/Node.
      webviewTag: true
    }
  })
  // Defense-in-depth: strip dangerous webPreferences from any <webview> guest, even if
  // a future renderer compromise tries to attach one with nodeIntegration/preload.
  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences, _params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
  })

  // Fase 21 (Task 2): nenhum conteúdo do renderer pode abrir uma nova janela Electron (ex.:
  // target="_blank" nos links renderizados a partir do Markdown das notas, ou qualquer
  // window.open futuro). http(s) vira aba no navegador padrão do SO via shell.openExternal;
  // qualquer outro esquema é apenas descartado. Sempre `{ action: 'deny' }` — não é o mesmo
  // mecanismo do will-attach-webview acima (que só rege a tag <webview> dos portais); os dois
  // convivem sem conflito.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:\/\/|mailto:)/i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Observabilidade: crashes do renderer e erros do console dele ficam invisíveis fora do DevTools.
  // Ecoá-los no log do processo principal ajuda a diagnosticar tela preta/travamento tanto em dev
  // quanto em builds empacotados (onde o log vai para o arquivo de log do app, não para a tela).
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    obs('[RENDERER-GONE]', JSON.stringify(details))
  })
  mainWindow.webContents.on('unresponsive', () => obs('[RENDERER-UNRESPONSIVE]'))
  mainWindow.webContents.on(
    'console-message',
    (_e, level, message, line, sourceId) => {
      if (level >= 2) obs('[RENDERER-CONSOLE]', message, `@ ${sourceId}:${line}`)
    }
  )
  // BLD-4 (auditoria 2026-07-14): sem isto, uma falha de load do renderer (pacote quebrado,
  // out/renderer/index.html ausente) deixa a janela invisível PARA SEMPRE — ela só é mostrada em
  // 'ready-to-show', que nunca dispara nesse caso. Aqui mostramos a janela e um diálogo nativo com
  // o motivo, em vez do estado zumbi. errorCode -3 = ABORTED (navegações/redirects normais) → ignora.
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return
    obs('[RENDERER-LOAD-FAILED]', errorCode, errorDescription, validatedURL)
    mainWindow?.show()
    try {
      dialog.showErrorBox(
        'Orkestra não conseguiu iniciar',
        `Falha ao carregar a interface (${errorCode} ${errorDescription}).\nTente reinstalar o app; se persistir, reporte o erro.`
      )
    } catch {
      /* dialog pode não estar disponível em cenários de teardown */
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    ptyManager.killAll()
    mainWindow = null
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Instância única (fix de corrupção cross-project, 2026-07-14): duas instâncias do app (ex.:
// `npm run dev` + build instalado, ou dois lançamentos acidentais) compartilham o MESMO userData
// e gravam nos mesmos arquivos de projeto — cada uma com sua própria noção de "projeto ativo",
// o autosave de uma escreve por cima dos canvases da outra. A segunda instância sai já; a
// primeira recebe 'second-instance' e traz a janela existente à frente.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// Otimização (Bloco 1a): aceleração de hardware LIGADA. NÃO desligar no macOS, mesmo com o ruído
// EGL "eglQueryDeviceAttribEXT: Bad attribute". Sem GPU, o Chromium moderno BLOQUEIA o software
// WebGL ("fallback to software WebGL has been deprecated") e pode derrubar a renderização →
// TELA PRETA (o Excalidraw e outras superfícies do canvas dependem de WebGL/GPU). Aquele ruído EGL
// é apenas cosmético (só aparece no log do dev). O fallback ORKESTRA_NO_GPU=1 existe para
// Windows/Linux — evite-o no macOS. (BLD-8, auditoria 2026-07-14: o @xterm/addon-webgl foi removido
// no commit 46a2b91 — este comentário não o cita mais; a decisão de manter a GPU segue válida.)
if (process.env.ORKESTRA_NO_GPU === '1') app.disableHardwareAcceleration()

// Observabilidade: se o processo de GPU/utility morrer, o compositor para de desenhar e a janela
// fica preta sem erro no renderer. Logar o motivo ajuda a diagnosticar esse caso silencioso.
app.on('child-process-gone', (_e, details) => {
  obs('[CHILD-PROCESS-GONE]', JSON.stringify(details))
})

// SEC-1/SEC-4 (auditoria 2026-07-14): Content-Security-Policy no renderer privilegiado. SÓ em
// build EMPACOTADO — em dev o Vite/HMR exige 'unsafe-inline'/'unsafe-eval'/ws:, e o dev não é a
// superfície de ameaça (produção é, carregada de file://). O bundle de produção não tem NENHUM
// script inline (só um <script src> externo), então `script-src 'self'` não quebra a app E bloqueia
// tanto script injetado quanto handlers inline (ex.: o `<img onerror>` de uma nota envenenada — a
// segunda camada, junto do fix de htmlToText/DOMParser). O renderer não faz fetch (tudo via IPC),
// então connect-src 'self' impede exfiltração por qualquer script que escape. Portais NÃO são
// afetados: usam partitions `persist:portal-*` (sessão própria), não a defaultSession daqui.
// Kill-switch ORKESTRA_NO_CSP=1 (mesmo padrão de ORKESTRA_NO_GPU) caso 'self' não case com file://
// em algum ambiente — NECESSÁRIO fazer um smoke-test no build empacotado antes de confiar nisto.
// SEC-6 (auditoria 2026-07-14): portais carregam sites arbitrários. Sem um handler de permissão, um
// site hostil num portal pode pedir câmera/microfone/geolocalização/etc e o default do Electron
// concede vários sem prompt. Negamos por padrão o conjunto sensível em TODA sessão (a defaultSession
// da janela principal e as partitions `persist:portal-*` de cada portal), permitindo o resto para
// não quebrar navegação comum. `session-created` cobre as partitions criadas quando um portal monta;
// hardenSession(defaultSession) cobre a que já existe no boot.
const DENIED_PERMISSIONS = new Set([
  'media', // câmera + microfone
  'geolocation',
  'notifications',
  'midi',
  'midiSysex',
  'hid',
  'serial',
  'usb',
  'bluetooth',
  'idle-detection'
])
function hardenSession(sess: Electron.Session): void {
  sess.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(!DENIED_PERMISSIONS.has(permission))
  })
  // Fecha também o caminho síncrono (permissionCheck) que alguns recursos usam sem o request.
  sess.setPermissionCheckHandler((_wc, permission) => !DENIED_PERMISSIONS.has(permission))
}

function installCsp(): void {
  if (!app.isPackaged || process.env.ORKESTRA_NO_CSP === '1') return
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'"
  ].join('; ')
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
  })
}

app.whenReady().then(async () => {
  // Sem o lock (segunda instância), app.quit() acima já está em curso — não registrar handlers
  // nem criar janela (evita a janela-fantasma que piscaria antes do quit completar).
  if (!gotSingleInstanceLock) return
  installCsp()
  // SEC-6: endurece a sessão já existente + toda sessão futura (partitions de portal).
  hardenSession(session.defaultSession)
  app.on('session-created', (sess) => hardenSession(sess))
  ipcMain.on('orchestration:sync', (_e, m: CanvasMirror) => {
    mirror = m
  })
  ipcMain.on(
    'portal:state',
    (_e, s: { name: string; projectId?: string | null } & PortalState) => {
      // T4: guarda o `dom` (lista de elementos interativos) ao lado de url/title/text — servido em
      // GET /portal e impresso por `orq portal snapshot --dom`. Opcional (estados/portais legados
      // sem o campo continuam válidos).
      // T9: o projectId do payload é o projeto que o renderer EXIBIA ao reportar (hint de
      // escrita); payload legado sem o campo cai no escopo null — nunca vaza para projetos reais.
      const projectId = typeof s.projectId === 'string' ? s.projectId : null
      portalStates.set(projectId, s.name, { url: s.url, title: s.title, text: s.text, dom: s.dom })
    }
  )
  // T8: batches de console-message vindos do PortalNode. O pushConsole re-aplica os tetos AQUI
  // (cap de linhas e de tamanho por linha) — o renderer também os aplica, mas o main não confia
  // no formato do que atravessa a ponte (entries é coerido item a item).
  ipcMain.on(
    'portal:console',
    (_e, p: { name?: unknown; entries?: unknown; projectId?: unknown }) => {
      if (typeof p?.name !== 'string' || !Array.isArray(p.entries)) return
      const projectId = typeof p.projectId === 'string' ? p.projectId : null
      const buf = portalConsoles.get(projectId, p.name) ?? []
      for (const entry of p.entries) pushConsole(buf, typeof entry === 'string' ? entry : String(entry))
      portalConsoles.set(projectId, p.name, buf)
    }
  )
  // T1: canal de volta do round-trip de portal click/fill. O renderer devolve aqui o booleano de
  // sucesso da ação (via window.orkestra.portalResult), correlacionado pelo requestId que o main
  // carimbou no relay; o registry resolve a promise que o OrchestrationServer está aguardando.
  // requestId desconhecido (reply duplicado / já expirado pelo timeout) é no-op no registry.
  //
  // T7 (screenshot): o mesmo canal carrega opcionalmente a captura ({png: base64, name}). Aí o
  // fluxo ganha uma etapa: o MAIN grava o PNG em os.tmpdir() — nome sanitizado por
  // screenshotFilename (o `name` vem do renderer; nunca vira pedaço de path sem sanitizar) — e só
  // então resolve a pendência com o CAMINHO. Antes de gravar, apaga as capturas anteriores DESTE
  // portal (best-effort): tmpdir não acumula um cemitério de PNG por sessão longa. Falha de
  // escrita resolve {ok:false} — o timeout do registry nunca é o caminho normal de erro.
  ipcMain.on(
    'portal:result',
    (_e, requestId: string, ok: boolean, shot?: { png?: unknown; name?: unknown }) => {
      const png = shot && typeof shot.png === 'string' && shot.png.length > 0 ? shot.png : null
      if (ok === true && png) {
        const name = typeof shot?.name === 'string' ? shot.name : 'portal'
        void (async () => {
          try {
            const dir = tmpdir()
            const antigos = await readdir(dir).catch(() => [] as string[])
            await Promise.all(
              antigos
                .filter((f) => isScreenshotOf(name, f))
                .map((f) => unlink(join(dir, f)).catch(() => {}))
            )
            const file = join(dir, screenshotFilename(name, Date.now()))
            await writeFile(file, Buffer.from(png, 'base64'))
            portalActions.resolve(requestId, { ok: true, path: file })
          } catch {
            portalActions.resolve(requestId, { ok: false })
          }
        })()
        return
      }
      portalActions.resolve(requestId, { ok: ok === true })
    }
  )
  // Fase 20 (Task 1): o renderer manda isto quando o usuário foca o terminal daquele nó — limpa
  // o watcher de atenção (ver AgentBus.clearAttention) para exigir NOVO output antes de disparar
  // onAttention de novo para este pty.
  ipcMain.on('agent:attention:clear', (_e, nodeId: string) => {
    const p = ptyManager.ptyIdForNode(nodeId)
    if (p) agentBus.clearAttention(p)
  })

  // Projetos (Fase 15 Task 2): cada projeto tem seu próprio canvas; bootstrap() cria o índice na
  // primeira vez (migrando o canvas.json legado single-projeto) e é idempotente depois disso.
  // persistence:load/save (registerPersistenceIpc) passam a operar sobre o projeto ATIVO.
  // Criado ANTES de registerPtyIpc (Fase 17 Task 1) porque este último recebe um resolver que
  // fecha sobre `projectManager` (getProjectCwd) — precisa existir antes de ser referenciado.
  const projectManager = new ProjectManager(app.getPath('userData'))
  projectManager.bootstrap()
  resolveActiveProjectId = () => projectManager.getActive()?.id

  registerPtyIpc(
    ipcMain,
    ptyManager,
    () => mainWindow?.webContents ?? null,
    () => orchestrationEnv,
    (id) => agentBus.track(id),
    // Fase 17 (Task 1): late-bound — lido a cada pty:spawn, então trocar de projeto muda a
    // pasta dos PRÓXIMOS terminais (os já abertos não mudam de cwd).
    () => projectManager.getActive()?.cwd,
    // Escopo de projeto: cada pty nasce etiquetado com o projeto ativo (ORKESTRA_PROJECT_ID) —
    // o orq envia isso em toda request e o servidor rejeita agentes de projetos não-ativos.
    () => projectManager.getActive()?.id
  )
  registerPersistenceIpc(ipcMain, projectManager)
  // Fase 17 (Task 1): pickDirectory real — diálogo nativo do Electron (só existe aqui no main;
  // registerProjectIpc não importa `dialog` para continuar testável com um fake).
  registerProjectIpc(ipcMain, projectManager, async () => {
    // Fase 17 (Task 2, polish cosmético): passa mainWindow como dono do diálogo quando ele já
    // existe (sempre existe em uso normal, já que este callback só roda a partir de um clique na
    // UI, depois de createWindow() abaixo) — no macOS isso faz o diálogo abrir como sheet anexado
    // à janela em vez de solto. mainWindow é `let` nullable no escopo do módulo; guard evita
    // passar null pro overload que exige BrowserWindow.
    const r = mainWindow
      ? await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  }, async () => {
    // Onda 7: seletor de 1 arquivo para o nó de arquivo (clip). Mesmo dono de janela (sheet no mac).
    const r = mainWindow
      ? await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] })
      : await dialog.showOpenDialog({ properties: ['openFile'] })
    return r.canceled ? null : r.filePaths[0]
  }, (nodeIds, projectId) => {
    // PTY-1 (auditoria 2026-07-14): ao remover um projeto, mata os ptys dos seus terminais — eles
    // sobrevivem à troca de projeto (re-attach), mas um projeto REMOVIDO não tem mais como
    // re-attachar, então seguiriam vivos (agentes consumindo CPU/RAM/tokens) e inalcançáveis.
    for (const nodeId of nodeIds) ptyManager.killByNode(nodeId)
    // T9: estados/consoles de portal do projeto removido não têm mais leitor possível — fora do mapa.
    if (projectId) {
      portalStates.clearProject(projectId)
      portalConsoles.clearProject(projectId)
    }
  }, (nodeIds) => {
    // Resiliência · T6 (hibernação): "Descarregar" libera os ptys do projeto NÃO-ativo — o exato
    // reuso do killByNode acima, sem tocar índice/ativo/canvas. Ao reabrir, os terminais
    // re-spawnam (pty:attach → null): canvas volta de onde parou, agentes reiniciam.
    for (const nodeId of nodeIds) ptyManager.killByNode(nodeId)
  })
  // Resiliência T4 — export de diagnóstico ("Ajuda → Reportar um Problema" / IPC do renderer).
  // As deps reais vivem SÓ aqui (dialog/fs); a composição coleta→REDIGE→salva é o módulo testado.
  // NADA é enviado a lugar nenhum: grava um JSON local e o usuário decide o destino.
  const gatherDiagnosticInput = (): import('./diagnostics/collectDiagnostics').DiagnosticInput => {
    const counts: Record<string, number> = projectManager.terminalCounts()
    return {
      appVersion: app.getVersion(),
      versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node
      },
      platform: process.platform,
      arch: process.arch,
      memory: {
        rssBytes: process.memoryUsage().rss,
        freeBytes: freemem(),
        totalBytes: totalmem()
      },
      env: process.env,
      // o token desta sessão é aleatório por boot — redigido por VALOR exato, além dos regexes
      knownSecrets: [orchestrationEnv.ORKESTRA_TOKEN ?? ''].filter(Boolean),
      logs: logger.recent(),
      projectCount: projectManager.list().projects.length,
      // contagens, nunca conteúdo: nº de terminais por projeto agregado em um total simples
      nodeCounts: { terminal: Object.values(counts).reduce((a, b) => a + b, 0) }
    }
  }
  const diagnosticsDeps = {
    gatherInput: gatherDiagnosticInput,
    saveDialog: async (): Promise<string | null> => {
      const r = mainWindow
        ? await dialog.showSaveDialog(mainWindow, { defaultPath: 'orkestra-diagnostico.json' })
        : await dialog.showSaveDialog({ defaultPath: 'orkestra-diagnostico.json' })
      return r.canceled || !r.filePath ? null : r.filePath
    },
    writeFile: (path: string, content: string): void => writeFileSync(path, content)
  }
  registerDiagnosticsIpc(ipcMain, diagnosticsDeps)
  // O item de menu (T1) roda a MESMA composição do IPC, com as MESMAS deps — coleta → redige →
  // salva. Best-effort: falha aqui não pode derrubar o menu.
  runDiagnosticsExport = async () => {
    try {
      const report = buildDiagnosticReport(diagnosticsDeps.gatherInput())
      const path = await diagnosticsDeps.saveDialog()
      if (path) diagnosticsDeps.writeFile(path, JSON.stringify(report, null, 2))
    } catch (err) {
      obs('[DIAGNOSTICS] export pelo menu falhou:', String(err))
    }
  }
  // Árvore de arquivos (Fase 19 Task 1): serviço de fs + git para o nó de file-explorer do canvas
  // (renderer, Task 2). Sem estado próprio — não precisa de bootstrap. A dep `trash` (Onda 3 ·
  // T13) liga o remove() do menu de contexto à LIXEIRA do sistema (shell.trashItem): excluir pela
  // árvore é sempre recuperável — exclusão definitiva não existe nesse canal.
  const fileTreeService = new FileTreeService({ trash: (p) => shell.trashItem(p) })
  registerFileTreeIpc(ipcMain, fileTreeService, fileTreeWatcher)
  // R1 (abrir no editor externo): handler 'ide:open' — abre a pasta do projeto no editor de código
  // instalado (VS Code/Cursor/…), com fallback pro gerenciador de arquivos. Sem estado próprio.
  registerIdeIpc(ipcMain)
  // Onda 2 (SSH Trilha B): handler ssh:scpDrop (spawn scp sem shell) para arrastar arquivo local
  // → terminal remoto. buildScpDrop valida host (isValidSshHost) e sanitiza o basename.
  registerSshIpc(ipcMain)
  // T5 ("Descobrir Responsabilidades"): handlers roles:discover/roles:import — varrem os sidecars
  // ~/.orkestra/agents/*/role.json (varredura limitada, degradação em falha de I/O) e mantêm o
  // registro de papéis importados (~/.orkestra/roles.json) que o pty:spawn consulta para injetar o
  // prompt de um papel que não é preset. Sem estado próprio (tudo em disco).
  registerRolesIpc(ipcMain)
  // O `orq` + o wrapper `claude` (com onboarding) são instalados de forma SÍNCRONA e o PATH/
  // REAL_PATH entram no env ANTES de criar a janela. Assim os terminais HIDRATADOS — que spawnam
  // durante a hidratação do renderer, logo dentro de createWindow() — já nascem com o binDir no PATH
  // e o wrapper `claude`. Sem isto havia um race: o terminal spawnava antes do env ser preenchido
  // (na IIFE async, que espera o servidor) e o `claude` digitado usava o binário real, SEM onboarding.
  // installOrq é só cópia/writeFile de arquivos pequenos — não atrasa o boot de forma perceptível.
  try {
    const binDir = installOrq(join(__dirname, '../orq/bin.js'))
    // BLD-2: augmenta o PATH com os diretórios comuns de instalação que faltam num app empacotado
    // lançado pelo Finder (PATH mínimo do launchd) — em dev é no-op. Separador por plataforma.
    // BLD-2b: descobre o bin do node do nvm (I/O) — sem ele o `orq` (shebang `#!/usr/bin/env node`)
    // morre com "env: node: No such file or directory" e a orquestração inteira vai junto. No-op se
    // não houver nvm. Fica fora de buildEnvPath, que é pura/determinística por causa dos testes.
    const nvmBinDirs = resolveNvmBinDirs(process.env, app.getPath('home'), process.platform)
    const { path, realPath } = buildEnvPath(
      binDir,
      process.env.PATH ?? '',
      process.platform,
      app.getPath('home'),
      nvmBinDirs
    )
    orchestrationEnv = {
      // Diretório dos wrappers/orq. registerPtyIpc usa para chamar o wrapper `claude` pelo CAMINHO
      // ABSOLUTO no auto-início — o PATH não é confiável (o .zshrc do usuário o reordena e mascara
      // o wrapper com o binário real).
      ORKESTRA_BIN: binDir,
      // PATH augmentado SEM o binDir — o wrapper `claude` usa para achar o binário real do claude
      // sem chamar a si mesmo (ver installOrq).
      ORKESTRA_REAL_PATH: realPath,
      PATH: path
    }
  } catch (err) {
    console.error('[orchestration] falha ao instalar o orq:', err)
  }
  createWindow()
  // Resiliência T1 — primeiro Menu de aplicação do app (Visualizar → Resetar Foco, Ajuda →
  // Reportar um Problema). Papéis nativos preservados (⌘C/⌘V/⌘Q no macOS vêm deles). O
  // exportDiagnostics chama o MESMO fluxo do IPC diagnostics:export (T4) — late-bound via
  // runDiagnosticsExport, preenchido quando o registro de diagnóstico sobe.
  if (mainWindow) {
    Menu.setApplicationMenu(
      buildAppMenu(mainWindow, { exportDiagnostics: () => void runDiagnosticsExport() })
    )
  }
  // Otimização (Bloco 3): a janela aparece ANTES de esperar o servidor de orquestração (HTTP local
  // + token), que sobe em paralelo e, quando pronto, COMPLETA o env com PORT/TOKEN. orchestrationEnv
  // é late-bound (registerPtyIpc relê a cada spawn) — um terminal aberto antes disso apenas nasce sem
  // ORKESTRA_PORT/TOKEN (o orq degrada de forma prevista), mas JÁ com o wrapper/onboarding no PATH.
  void (async () => {
    try {
      const { port, token } = await orchestration.start()
      orchestrationEnv = {
        ...orchestrationEnv,
        ORKESTRA_PORT: String(port),
        ORKESTRA_TOKEN: token
      }
    } catch (err) {
      console.error('[orchestration] falha ao iniciar o servidor:', err)
    }
  })()
  // Auto-update (Fase 12 Task 2): no-op em dev/test (app.isPackaged=false); só em build
  // empacotado tenta checkForUpdatesAndNotify() contra o feed do GitHub Releases (ver
  // electron-builder.yml publish). Falha silenciosamente enquanto owner/release reais não
  // existirem (ver TODOs no electron-builder.yml).
  setupAutoUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((err) => {
  // BLD-3 (auditoria 2026-07-14): sem este .catch, um throw síncrono no boot (ex.: mkdirSync EACCES
  // em ProjectManager.bootstrap, falha em createWindow) vira unhandled rejection → app zumbi (ícone
  // no Dock, nenhuma janela, nenhum diálogo). Aqui logamos e mostramos o erro ao usuário.
  obs('[BOOT] falha fatal no whenReady:', String(err))
  try {
    dialog.showErrorBox('Orkestra', `Falha ao iniciar o aplicativo:\n${err instanceof Error ? err.message : String(err)}`)
  } catch {
    /* ignore */
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  ptyManager.killAll()
  // Onda 3 · T9: fecha todos os fs.watch da árvore. O SO recolheria os FDs ao matar o processo, mas
  // deixar recurso aberto na saída é lixo nosso — e o mesmo closeAll é a rede contra um watcher que
  // sobreviva a um teardown de janela.
  fileTreeWatcher.closeAll()
  void orchestration.stop()
})
