import { app, BrowserWindow, ipcMain, dialog, Notification, shell } from 'electron'
import { join } from 'path'
import { PtyManager } from './pty/PtyManager'
import { nodePtySpawner } from './pty/nodePtySpawner'
import { registerPtyIpc } from './pty/registerPtyIpc'
import { registerPersistenceIpc } from './persistence/registerPersistenceIpc'
import { ProjectManager } from './projects/ProjectManager'
import { registerProjectIpc } from './projects/registerProjectIpc'
import { FileTreeService } from './filetree/FileTreeService'
import { registerFileTreeIpc } from './filetree/registerFileTreeIpc'
import { registerIdeIpc } from './ide/registerIdeIpc'
import { OrchestrationServer } from './orchestration/OrchestrationServer'
import { installOrq } from './orchestration/installOrq'
import { AgentBus } from './orchestration/AgentBus'
import { setupAutoUpdater } from './updater'
import type { CanvasMirror, PortalState } from '../shared/orchestration'

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager(nodePtySpawner)
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
const agentBus = new AgentBus(ptyManager, {
  onAttention: (ptyId) => {
    const nodeId = ptyManager.nodeForPty(ptyId)
    if (!nodeId) return
    // "Monitorar atividade" desligado (Fase 29, data.monitor === false via mirror): não sinaliza
    // atenção nem notifica este terminal.
    if (mirror.nodes.find((n) => n.id === nodeId)?.monitor === false) return
    mainWindow?.webContents.send('agent:attention', nodeId)
    if (mainWindow && !mainWindow.isFocused()) {
      try {
        new Notification({
          title: 'Agente ocioso',
          body: 'Um agente parou e pode precisar de você.'
        }).show()
      } catch {
        // Notificações nativas podem faltar/ser negadas dependendo do SO — nunca travar o app.
      }
    }
  }
})

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

// Otimização (Bloco 1a): aceleração de hardware LIGADA por padrão — o canvas (React Flow) e o WebGL
// do xterm ganham muito com GPU. O disable antigo só silenciava ruído de log de driver EGL em Macs
// Intel (não é quebra funcional). Fallback opt-in via env: ORKESTRA_NO_GPU=1 restaura o software
// rendering sem recompilar, caso algum driver realmente quebre a renderização.
if (process.env.ORKESTRA_NO_GPU === '1') app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  ipcMain.on('orchestration:sync', (_e, m: CanvasMirror) => {
    mirror = m
  })
  ipcMain.on('portal:state', (_e, s: { name: string } & PortalState) => {
    portalStates.set(s.name, { url: s.url, title: s.title, text: s.text })
  })
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
  })
  // Árvore de arquivos (Fase 19 Task 1): serviço read-only de fs + git status para o nó de
  // file-explorer do canvas (renderer, Task 2). Sem estado próprio — não precisa de bootstrap.
  const fileTreeService = new FileTreeService()
  registerFileTreeIpc(ipcMain, fileTreeService)
  // R1 (abrir no editor externo): handler 'ide:open' — abre a pasta do projeto no editor de código
  // instalado (VS Code/Cursor/…), com fallback pro gerenciador de arquivos. Sem estado próprio.
  registerIdeIpc(ipcMain)
  createWindow()
  // Otimização (Bloco 3): a janela aparece ANTES de esperar a orquestração. O servidor (HTTP local
  // + token) e o install do `orq` sobem em paralelo, SEM await bloqueante do caminho da janela.
  // Seguro porque orchestrationEnv é late-bound (registerPtyIpc lê a cada spawn) — um terminal
  // spawnado antes do servidor subir nasce sem ORKESTRA_PORT/TOKEN (mesma degradação já prevista
  // quando a orquestração falha). Se algo falhar aqui, a app segue sem orquestração.
  void (async () => {
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
  })()
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
