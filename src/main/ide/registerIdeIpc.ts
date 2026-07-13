import type { IpcMain } from 'electron'
import { shell } from 'electron'
import { spawn } from 'child_process'
import { openInEditor, type OpenInEditorResult } from './openInEditor'

// tryExec real: dispara o comando com spawn (SEM shell — sem risco de injeção; os comandos vêm da
// allowlist EDITOR_CANDIDATES, nunca do renderer). Resolve true no evento 'spawn' (o binário existe
// e iniciou) e false no 'error' (ENOENT quando não está instalado). `detached`+`unref` soltam o
// editor do ciclo de vida do app e não prendem o event loop. Nunca lança.
function tryExecReal(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: boolean): void => {
      if (!settled) {
        settled = true
        resolve(v)
      }
    }
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
      child.on('error', () => done(false))
      child.on('spawn', () => {
        child.unref()
        done(true)
      })
    } catch {
      done(false)
    }
  })
}

// R1: registra o handler 'ide:open' — o renderer manda o caminho (a pasta do projeto ativo) e o
// main tenta abrir no editor externo, com fallback pro gerenciador de arquivos do SO. O renderer
// nunca toca em child_process/shell diretamente.
export function registerIdeIpc(ipcMain: IpcMain): void {
  ipcMain.handle('ide:open', async (_e, path: unknown): Promise<OpenInEditorResult> => {
    if (typeof path !== 'string') return { ok: false }
    return openInEditor(path, {
      tryExec: tryExecReal,
      // shell.openPath resolve '' em sucesso, ou uma mensagem de erro — string vazia = abriu.
      openFiles: async (p) => (await shell.openPath(p)) === ''
    })
  })
}
