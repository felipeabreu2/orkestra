import { contextBridge, ipcRenderer } from 'electron'
import type { CanvasSnapshot } from '../shared/canvasSnapshot'
import type { CanvasMirror, OrchestrationCommand, PortalState } from '../shared/orchestration'
import type { Project, ProjectIndex } from '../shared/project'

const api = {
  pty: {
    spawn: (opts: {
      cwd?: string
      cols?: number
      rows?: number
      nodeId?: string
      initialCommand?: string
    }): Promise<string> => ipcRenderer.invoke('pty:spawn', opts),
    write: (id: string, data: string): void => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id: string): void => ipcRenderer.send('pty:kill', id),
    onData: (id: string, cb: (data: string) => void): (() => void) => {
      const listener = (_e: unknown, incomingId: string, data: string): void => {
        if (incomingId === id) cb(data)
      }
      ipcRenderer.on('pty:data', listener)
      return () => ipcRenderer.removeListener('pty:data', listener)
    }
  },
  persistence: {
    load: (): Promise<CanvasSnapshot | null> => ipcRenderer.invoke('persistence:load'),
    save: (snapshot: CanvasSnapshot): void => ipcRenderer.send('persistence:save', snapshot)
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
    pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('projects:pickDirectory')
  },
  orchestration: {
    sync: (mirror: CanvasMirror): void => ipcRenderer.send('orchestration:sync', mirror),
    onCommand: (cb: (cmd: OrchestrationCommand) => void): (() => void) => {
      const listener = (_e: unknown, cmd: OrchestrationCommand): void => cb(cmd)
      ipcRenderer.on('orchestration:command', listener)
      return () => ipcRenderer.removeListener('orchestration:command', listener)
    }
  },
  // Fase 9 (Portais): o PortalNode reporta {name,url,title,text} ao main a cada did-finish-load
  // do seu <webview> — o main guarda por nome, servindo de estado para `orq portal snapshot`
  // (GET /portal?name=...). Fire-and-forget: sem retorno/confirmação.
  portalState: (state: { name: string } & PortalState): void => ipcRenderer.send('portal:state', state)
}

contextBridge.exposeInMainWorld('orkestra', api)

export type OrkestraApi = typeof api
