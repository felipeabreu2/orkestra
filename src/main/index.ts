import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { PtyManager } from './pty/PtyManager'
import { nodePtySpawner } from './pty/nodePtySpawner'
import { registerPtyIpc } from './pty/registerPtyIpc'
import { CanvasPersistence } from './persistence/CanvasPersistence'
import { registerPersistenceIpc } from './persistence/registerPersistenceIpc'
import { OrchestrationServer } from './orchestration/OrchestrationServer'
import { installOrq } from './orchestration/installOrq'
import { AgentBus } from './orchestration/AgentBus'
import { FloorManager } from './floors/FloorManager'
import { registerFloorIpc } from './floors/registerFloorIpc'
import { RoutineScheduler } from './routines/RoutineScheduler'
import { registerRoutineIpc } from './routines/registerRoutineIpc'
import { setupAutoUpdater } from './updater'
import type { CanvasMirror, PortalState } from '../shared/orchestration'

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager(nodePtySpawner)
// Buffer de saída por pty + ask/read (Fase 6). track()/untrack() são geridos via o hook
// onSpawn de registerPtyIpc (abaixo) e o auto-untrack interno do próprio AgentBus (onExit).
const agentBus = new AgentBus(ptyManager)

// Espelho leve do canvas (renderer -> main via 'orchestration:sync'), servido em GET /list.
let mirror: CanvasMirror = { nodes: [] }
// Estado reportado por cada portal (nome -> {url,title,text}), atualizado via IPC 'portal:state'
// a cada did-finish-load do <webview> correspondente (PortalNode); servido em GET /portal.
const portalStates = new Map<string, PortalState>()
// Env extra injetado em todo pty spawnado; populado após orchestration.start() (porta+token).
let orchestrationEnv: Record<string, string> = {}
// Rotinas (Fase 10): construído dentro de app.whenReady() (precisa de app.getPath), bem depois
// deste módulo já ter sido avaliado — igual ao mainWindow abaixo, referenciado via optional
// chaining nas opts do orchestration (só é lido de fato quando uma requisição HTTP chega, o
// que nunca acontece antes do app terminar de subir).
let routineScheduler: RoutineScheduler | undefined

// Resolve um terminal pelo nome atual no espelho do canvas -> ptyId (via PtyManager). Nomes
// duplicados resolvem para o primeiro nó encontrado; renomear é responsabilidade do usuário.
function resolvePtyByName(name: string): string | undefined {
  const node = mirror.nodes.find((n) => n.type === 'terminal' && n.name === name)
  return node ? ptyManager.ptyIdForNode(node.id) : undefined
}

const orchestration = new OrchestrationServer({
  getMirror: () => mirror,
  onCommand: (cmd) => mainWindow?.webContents.send('orchestration:command', cmd),
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
  check: (name) => {
    const p = resolvePtyByName(name)
    return p ? { output: agentBus.read(p) } : null
  },
  getPortalState: (name) => portalStates.get(name) ?? null,
  routines: {
    list: () => routineScheduler?.list() ?? [],
    add: (r) => {
      if (!routineScheduler) throw new Error('rotinas indisponíveis (scheduler ainda não iniciado)')
      return routineScheduler.add(r)
    },
    remove: (id) => routineScheduler?.remove(id)
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

// Renderização por software: silencia os erros de driver EGL/GPU em Macs Intel (a UI é 2D, não precisa de aceleração).
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  // Sobe o servidor de orquestração (HTTP local + token) e instala o `orq` compilado em
  // ~/.orkestra/bin/orq. Se algo falhar aqui (ex.: build sem out/orq/bin.js), a app segue
  // sem orquestração em vez de travar no boot — orchestrationEnv fica {} (spawns normais).
  try {
    const { port, token } = await orchestration.start()
    const binDir = installOrq(join(__dirname, '../orq/bin.js'))
    orchestrationEnv = {
      ORKESTRA_PORT: String(port),
      ORKESTRA_TOKEN: token,
      PATH: `${binDir}:${process.env.PATH ?? ''}`
    }
  } catch (err) {
    console.error('[orchestration] falha ao iniciar servidor ou instalar o orq:', err)
  }
  ipcMain.on('orchestration:sync', (_e, m: CanvasMirror) => {
    mirror = m
  })
  ipcMain.on('portal:state', (_e, s: { name: string } & PortalState) => {
    portalStates.set(s.name, { url: s.url, title: s.title, text: s.text })
  })

  // Floors (Fase 8): worktrees git isolados por tarefa, persistidos em
  // ~/.orkestra/floors/floors.json e recarregados no boot.
  const floorManager = new FloorManager(join(app.getPath('home'), '.orkestra', 'floors'))
  await floorManager.loadPersisted()
  registerFloorIpc(ipcMain, floorManager, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  // Rotinas (Fase 10): comandos agendados via cron (RoutineScheduler.tick, a cada 30s) que
  // disparam num terminal existente via AgentBus.ask. Persistidas em ~/.orkestra/routines.json
  // e recarregadas no boot; alvo resolvido por nome (resolvePtyByName) a cada disparo — se o
  // terminal não existir mais, o disparo é um no-op silencioso (documentado no brief).
  const scheduler = new RoutineScheduler({
    persistPath: join(app.getPath('home'), '.orkestra', 'routines.json'),
    onFire: (r) => {
      const pty = resolvePtyByName(r.target)
      if (pty) agentBus.ask(pty, r.command)
    }
  })
  await scheduler.loadPersisted()
  scheduler.start()
  app.on('before-quit', () => scheduler.stop())
  registerRoutineIpc(ipcMain, scheduler)
  // Publica no binding de módulo só depois de carregado/iniciado — as opts.routines do
  // orchestration (acima) só o enxergam a partir daqui (antes disso, list()/add()/remove()
  // caem no fallback dos optional chains, o que na prática nunca é observado: nenhuma
  // requisição HTTP chega antes do app terminar de subir).
  routineScheduler = scheduler

  registerPtyIpc(
    ipcMain,
    ptyManager,
    () => mainWindow?.webContents ?? null,
    () => orchestrationEnv,
    (id) => agentBus.track(id),
    (floorId) => floorManager.get(floorId)?.worktreePath
  )
  const persistence = new CanvasPersistence(join(app.getPath('userData'), 'canvas.json'))
  registerPersistenceIpc(ipcMain, persistence)
  createWindow()
  // Auto-update (Fase 12 Task 2): no-op em dev/test (app.isPackaged=false); só em build
  // empacotado tenta checkForUpdatesAndNotify() contra o feed do GitHub Releases (ver
  // electron-builder.yml publish). Falha silenciosamente enquanto owner/release reais não
  // existirem (ver TODOs no electron-builder.yml).
  setupAutoUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  ptyManager.killAll()
  void orchestration.stop()
})
