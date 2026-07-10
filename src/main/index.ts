import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { PtyManager } from './pty/PtyManager'
import { nodePtySpawner } from './pty/nodePtySpawner'
import { registerPtyIpc } from './pty/registerPtyIpc'
import { CanvasPersistence } from './persistence/CanvasPersistence'
import { registerPersistenceIpc } from './persistence/registerPersistenceIpc'
import { OrchestrationServer } from './orchestration/OrchestrationServer'
import { installOrq } from './orchestration/installOrq'
import { AgentBus } from './orchestration/AgentBus'
import type { CanvasMirror } from '../shared/orchestration'

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager(nodePtySpawner)
// Buffer de saída por pty + ask/read (Fase 6). track()/untrack() são geridos via o hook
// onSpawn de registerPtyIpc (abaixo) e o auto-untrack interno do próprio AgentBus (onExit).
const agentBus = new AgentBus(ptyManager)

// Espelho leve do canvas (renderer -> main via 'orchestration:sync'), servido em GET /list.
let mirror: CanvasMirror = { nodes: [] }
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
  check: (name) => {
    const p = resolvePtyByName(name)
    return p ? { output: agentBus.read(p) } : null
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
      nodeIntegration: false
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

  registerPtyIpc(
    ipcMain,
    ptyManager,
    () => mainWindow?.webContents ?? null,
    () => orchestrationEnv,
    (id) => agentBus.track(id)
  )
  const persistence = new CanvasPersistence(join(app.getPath('userData'), 'canvas.json'))
  registerPersistenceIpc(ipcMain, persistence)
  createWindow()
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
