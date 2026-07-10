import { app } from 'electron'
import electronUpdater from 'electron-updater'

// Auto-update (Fase 12 Task 2). Ativo somente em build empacotado (app.isPackaged) - em
// dev/test isso é sempre false, então esta função é um no-op ali (nada de rede, nada de
// tocar electron-updater de verdade). checkForUpdatesAndNotify() consulta o feed configurado
// em electron-builder.yml (publish.provider: github); até o "owner" placeholder ser
// preenchido com o usuário real do GitHub e existir um release publicado, a checagem
// simplesmente falha em runtime — por isso o catch silencioso (não deve derrubar o app).
export function setupAutoUpdater(): void {
  if (!app.isPackaged) return
  try {
    const { autoUpdater } = electronUpdater
    autoUpdater.autoDownload = true
    void autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  } catch {
    /* updater unavailable: ignore */
  }
}
