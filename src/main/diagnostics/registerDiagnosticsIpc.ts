import type { IpcMain } from 'electron'
import { buildDiagnosticReport, type DiagnosticInput } from './collectDiagnostics'

// Resiliência · T4 — o handler do "Reportar um Problema". Compõe: coletar (gatherInput, injetado —
// quem lê app/process/os/logger é o index.ts) → REDIGIR (buildDiagnosticReport, T3) → perguntar
// onde salvar (saveDialog, injetado) → gravar (writeFile, injetado). Tudo injetado no mesmo padrão
// do pickDirectory de registerProjectIpc: o módulo fica livre de electron e testável.
//
// Privacidade por padrão: NADA é enviado a lugar nenhum — o export grava um JSON local e o
// usuário decide se/para quem manda. Cancelar o diálogo não escreve nada; falha de escrita devolve
// {ok:false} (nunca um "ok" por algo que não foi gravado — mesmo contrato do writeRoleSidecar).
export interface DiagnosticsIpcDeps {
  gatherInput: () => DiagnosticInput
  saveDialog: () => Promise<string | null>
  writeFile: (path: string, content: string) => void
}

export function registerDiagnosticsIpc(ipcMain: IpcMain, deps: DiagnosticsIpcDeps): void {
  ipcMain.handle('diagnostics:export', async (): Promise<{ ok: boolean; path?: string }> => {
    try {
      const report = buildDiagnosticReport(deps.gatherInput())
      const path = await deps.saveDialog()
      if (!path) return { ok: false }
      deps.writeFile(path, JSON.stringify(report, null, 2))
      return { ok: true, path }
    } catch {
      return { ok: false }
    }
  })
}
