import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { PtyManager } from './pty/PtyManager'
import { nodePtySpawner } from './pty/nodePtySpawner'
import { registerPtyIpc } from './pty/registerPtyIpc'
import { registerPersistenceIpc } from './persistence/registerPersistenceIpc'
import { ProjectManager } from './projects/ProjectManager'
import { registerProjectIpc } from './projects/registerProjectIpc'
import { OrchestrationServer } from './orchestration/OrchestrationServer'
import { installOrq } from './orchestration/installOrq'
import { AgentBus } from './orchestration/AgentBus'
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
  getPortalState: (name) => portalStates.get(name) ?? null
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

  // Projetos (Fase 15 Task 2): cada projeto tem seu próprio canvas; bootstrap() cria o índice na
  // primeira vez (migrando o canvas.json legado single-projeto) e é idempotente depois disso.
  // persistence:load/save (registerPersistenceIpc) passam a operar sobre o projeto ATIVO.
  // Criado ANTES de registerPtyIpc (Fase 17 Task 1) porque este último recebe um resolver que
  // fecha sobre `projectManager` (getProjectCwd) — precisa existir antes de ser referenciado.
  const projectManager = new ProjectManager(app.getPath('userData'))
  projectManager.bootstrap()

  registerPtyIpc(
    ipcMain,
    ptyManager,
    () => mainWindow?.webContents ?? null,
    () => orchestrationEnv,
    (id) => agentBus.track(id),
    // Fase 17 (Task 1): late-bound — lido a cada pty:spawn, então trocar de projeto muda a
    // pasta dos PRÓXIMOS terminais (os já abertos não mudam de cwd).
    () => projectManager.getActive()?.cwd
  )
  registerPersistenceIpc(ipcMain, projectManager)
  // Fase 17 (Task 1): pickDirectory real — diálogo nativo do Electron (só existe aqui no main;
  // registerProjectIpc não importa `dialog` para continuar testável com um fake).
  registerProjectIpc(ipcMain, projectManager, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
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
