import { contextBridge, ipcRenderer } from 'electron'
import type { CanvasSnapshot } from '../shared/canvasSnapshot'
import type { CanvasMirror, OrchestrationCommand } from '../shared/orchestration'
import type { Floor } from '../shared/floors'

const api = {
  pty: {
    spawn: (opts: {
      cwd?: string
      cols?: number
      rows?: number
      nodeId?: string
      initialCommand?: string
      floorId?: string
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
  orchestration: {
    sync: (mirror: CanvasMirror): void => ipcRenderer.send('orchestration:sync', mirror),
    onCommand: (cb: (cmd: OrchestrationCommand) => void): (() => void) => {
      const listener = (_e: unknown, cmd: OrchestrationCommand): void => cb(cmd)
      ipcRenderer.on('orchestration:command', listener)
      return () => ipcRenderer.removeListener('orchestration:command', listener)
    }
  },
  floors: {
    create: (name: string): Promise<Floor | null> => ipcRenderer.invoke('floor:create', name),
    list: (): Promise<Floor[]> => ipcRenderer.invoke('floor:list'),
    land: (id: string): Promise<{ ok: boolean; output: string }> =>
      ipcRenderer.invoke('floor:land', id),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('floor:remove', id)
  }
}

contextBridge.exposeInMainWorld('orkestra', api)

export type OrkestraApi = typeof api
