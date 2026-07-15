import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { CanvasSnapshot } from '../shared/canvasSnapshot'
import type { CanvasMirror, OrchestrationCommand, PortalState } from '../shared/orchestration'
import type { Project, ProjectIndex } from '../shared/project'
import type { FileEntry } from '../shared/filetree'

// PTY-9 (auditoria 2026-07-14): cada TerminalNode registra um listener 'pty:data' no ipcRenderer;
// com muitos terminais no canvas passaríamos do teto default de 10 e o Node emitiria
// MaxListenersExceededWarning (ruído no console, falsa pista em debug). Os listeners são removidos
// corretamente no unmount (não é vazamento) — só precisam de mais folga.
ipcRenderer.setMaxListeners(200)

const api = {
  pty: {
    spawn: (opts: {
      cwd?: string
      cols?: number
      rows?: number
      nodeId?: string
      initialCommand?: string
      // Fase 27 (Task 2): destino SSH opcional — validado e mapeado p/ file:'ssh', args:[host]
      // no main (registerPtyIpc); aqui é só o tipo, o objeto é repassado inteiro via invoke.
      sshHost?: string
    }): Promise<string> => ipcRenderer.invoke('pty:spawn', opts),
    write: (id: string, data: string): void => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id: string): void => ipcRenderer.send('pty:kill', id),
    // Fase 31: re-attach a um pty existente do nó (que sobreviveu a uma troca de projeto) —
    // devolve o ptyId + o scrollback p/ restaurar o xterm, ou null se o nó ainda não tem pty.
    attach: (nodeId: string): Promise<{ ptyId: string; buffer: string } | null> =>
      ipcRenderer.invoke('pty:attach', nodeId),
    // Fase 31: mata o pty de um nó (ao remover o terminal do canvas via ×).
    killForNode: (nodeId: string): void => ipcRenderer.send('pty:killForNode', nodeId),
    onData: (id: string, cb: (data: string) => void): (() => void) => {
      const listener = (_e: unknown, incomingId: string, data: string): void => {
        if (incomingId === id) cb(data)
      }
      ipcRenderer.on('pty:data', listener)
      return () => ipcRenderer.removeListener('pty:data', listener)
    }
  },
  persistence: {
    // Fix de corrupção cross-project (2026-07-14): o load devolve snapshot + id do projeto dono
    // num único round-trip atômico — o renderer guarda o id e salva por id explícito
    // (projects.saveCanvas), nunca mais "no projeto ativo do momento da escrita". INT-6: o antigo
    // `save` (canal persistence:save) foi REMOVIDO — era o vetor da corrupção e não tinha mais uso.
    load: (): Promise<{ projectId: string | null; snapshot: CanvasSnapshot | null }> =>
      ipcRenderer.invoke('persistence:load')
  },
  // Fase 15 (Task 2): CRUD de projetos (cada um com seu próprio canvas, ver ProjectManager no
  // main). persistence.load/save acima continuam operando sobre o projeto ATIVO — trocar de
  // projeto é feito via switch(id), que já devolve o canvas do projeto recém-ativado.
  projects: {
    list: (): Promise<ProjectIndex> => ipcRenderer.invoke('projects:list'),
    // Fase 17 (Task 1): cwd opcional — a pasta escolhida via pickDirectory() antes de criar.
    create: (name: string, cwd?: string): Promise<Project> => ipcRenderer.invoke('projects:create', name, cwd),
    switch: (id: string): Promise<CanvasSnapshot | null> => ipcRenderer.invoke('projects:switch', id),
    rename: (id: string, name: string): Promise<void> => ipcRenderer.invoke('projects:rename', id, name),
    remove: (id: string): Promise<{ activeId: string; snapshot: CanvasSnapshot | null }> =>
      ipcRenderer.invoke('projects:remove', id),
    // Fase 15 (Task 3): flush explícito por id (awaitable) — usado por ProjectsSidebar.switchTo
    // para salvar o canvas do projeto que está SAINDO por id, antes de chamar switch(). Ao
    // contrário de persistence.save (fire-and-forget, sempre mira o projeto ativo do momento em
    // que o handler roda), este grava sempre no projeto do `id` passado, então não há dependência
    // de ordem entre o flush e a troca do ativo.
    saveCanvas: (id: string, snapshot: CanvasSnapshot): Promise<void> =>
      ipcRenderer.invoke('projects:saveCanvas', id, snapshot),
    // Fase 17 (Task 1): troca a pasta de um projeto já existente (ex.: botão "pasta" na sidebar).
    setCwd: (id: string, cwd: string): Promise<void> => ipcRenderer.invoke('projects:setCwd', id, cwd),
    // Fase 18 (Task 4): troca o ícone (emoji) de um projeto já existente (seletor inline na
    // sidebar — lista curada + input de texto livre).
    setIcon: (id: string, icon: string): Promise<void> => ipcRenderer.invoke('projects:setIcon', id, icon),
    // Abre o diálogo nativo de escolha de pasta (roda no main) -> path escolhido, ou null se o
    // usuário cancelar. Renderer nunca toca fs/dialog diretamente.
    pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('projects:pickDirectory'),
    // Onda 7: seletor de 1 arquivo (nó de arquivo/clip).
    pickFile: (): Promise<string | null> => ipcRenderer.invoke('projects:pickFile'),
    // Badge da sidebar (2026-07-14): nº de terminais por projeto (id -> count).
    terminalCounts: (): Promise<Record<string, number>> => ipcRenderer.invoke('projects:terminalCounts')
  },
  // Fase 19 (Task 1): árvore de arquivos (canvas file-explorer node) — read-only, delega tudo ao
  // FileTreeService no main (ver registerFileTreeIpc). O renderer nunca importa `fs`/`child_process`
  // diretamente; list/read/gitStatus podem rejeitar (dir/arquivo inexistente etc.) — quem chama trata.
  filetree: {
    list: (dir: string): Promise<FileEntry[]> => ipcRenderer.invoke('filetree:list', dir),
    read: (path: string): Promise<{ content: string; truncated: boolean; binary: boolean }> =>
      ipcRenderer.invoke('filetree:read', path),
    gitStatus: (dir: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke('filetree:gitStatus', dir)
  },
  orchestration: {
    sync: (mirror: CanvasMirror): void => ipcRenderer.send('orchestration:sync', mirror),
    // projectId (escopo de projeto, 2026-07-14): projeto ativo no main no momento do relay — o
    // renderer só aplica o comando se ainda estiver exibindo esse projeto (useOrchestrationSync).
    // null/ausente = relay legado, aplicado como antes.
    onCommand: (cb: (cmd: OrchestrationCommand, projectId?: string | null) => void): (() => void) => {
      const listener = (_e: unknown, cmd: OrchestrationCommand, projectId?: string | null): void =>
        cb(cmd, projectId)
      ipcRenderer.on('orchestration:command', listener)
      return () => ipcRenderer.removeListener('orchestration:command', listener)
    }
  },
  // R1 (abrir no editor externo): pede ao main para abrir um caminho (a pasta do projeto ativo) no
  // editor de código instalado, com fallback pro gerenciador de arquivos do SO. Retorna qual editor
  // abriu ({ ok, editor }) — o renderer nunca toca em child_process/shell.
  ide: {
    open: (path: string): Promise<{ ok: boolean; editor?: string }> => ipcRenderer.invoke('ide:open', path)
  },
  // Fase 9 (Portais): o PortalNode reporta {name,url,title,text} ao main a cada did-finish-load
  // do seu <webview> — o main guarda por nome, servindo de estado para `orq portal snapshot`
  // (GET /portal?name=...). Fire-and-forget: sem retorno/confirmação.
  portalState: (state: { name: string } & PortalState): void => ipcRenderer.send('portal:state', state),
  // Fase 20 (Task 1): watcher de atenção (ver AgentBus no main) — avisa o renderer quando um
  // terminal-agente produziu saída e depois ficou ocioso. onAgentAttention segue o mesmo padrão
  // de assinatura com unsubscribe de orchestration.onCommand acima; clearAgentAttention é
  // fire-and-forget, chamado ao focar o terminal daquele nó (Task 2, renderer).
  onAgentAttention: (cb: (nodeId: string) => void): (() => void) => {
    const listener = (_e: unknown, nodeId: string): void => cb(nodeId)
    ipcRenderer.on('agent:attention', listener)
    return () => ipcRenderer.removeListener('agent:attention', listener)
  },
  clearAgentAttention: (nodeId: string): void => ipcRenderer.send('agent:attention:clear', nodeId),
  // Fix border-beam preso (2026-07-15): sinal REAL de "generating" (ver AgentBus.onBusyChange no
  // main) — busy=true logo no primeiro chunk de uma rajada de output do pty, busy=false só depois
  // de idleMs de silêncio real (mesma detecção de ociosidade já tunada do onAgentAttention acima,
  // mas com timer PRÓPRIO — sobrevive a clearAgentAttention, ver AgentBus.ts). Mesmo padrão de
  // assinatura com unsubscribe dos demais listeners deste arquivo.
  onAgentBusy: (cb: (nodeId: string, busy: boolean) => void): (() => void) => {
    const listener = (_e: unknown, nodeId: string, busy: boolean): void => cb(nodeId, busy)
    ipcRenderer.on('agent:busy', listener)
    return () => ipcRenderer.removeListener('agent:busy', listener)
  },
  // Caminho absoluto de um File solto no terminal (drag-drop do Finder). No Electron 33 o
  // File.path foi removido — webUtils.getPathForFile é a forma suportada (resolve no preload,
  // sem o renderer tocar em `fs`). Só resolve Files reais que o usuário arrastou.
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('orkestra', api)

export type OrkestraApi = typeof api
