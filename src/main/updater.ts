import { app, dialog, shell, BrowserWindow } from 'electron'
import { isNewerVersion } from './updateCheck'

// Checagem de atualização (Fase 12, revisão pós-1.0). Em vez do auto-update binário do
// electron-updater — que no macOS exigiria publicar também um .zip além do .dmg, quebrando a
// regra "um arquivo por dispositivo" — consultamos a última release publicada no GitHub e, se
// houver versão nova, mostramos um diálogo com a versão INSTALADA e a ÚLTIMA disponível. O botão
// principal só abre a página de download (o usuário baixa o instalador do próprio SO). Assim o
// mesmo fluxo vale igual para dmg/exe/AppImage, sem depender do formato do artefato.
const REPO = 'felipeabreu2/orkestra'
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`

// Só roda em build empacotado (em dev/test app.isPackaged é false → no-op: nada de rede). O
// atraso deixa a janela abrir antes de um eventual diálogo, e o catch silencioso cobre o caso
// offline / sem release publicada (não pode derrubar nem travar o boot do app).
export function setupAutoUpdater(): void {
  if (!app.isPackaged) return
  setTimeout(() => {
    void checkForUpdate()
  }, 4000)
}

async function checkForUpdate(): Promise<void> {
  try {
    const res = await fetch(API_LATEST, {
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return
    const data = (await res.json()) as { tag_name?: string }
    const remote = data.tag_name
    if (!remote) return
    const local = app.getVersion()
    if (!isNewerVersion(local, remote)) return
    await promptUpdate(local, remote.replace(/^v/i, ''))
  } catch {
    /* offline ou API indisponível: ignora silenciosamente */
  }
}

async function promptUpdate(local: string, remote: string): Promise<void> {
  const win = BrowserWindow.getAllWindows()[0]
  const opts = {
    type: 'info' as const,
    buttons: ['Baixar atualização', 'Agora não'],
    defaultId: 0,
    cancelId: 1,
    title: 'Atualização disponível',
    message: 'Uma nova versão do Orkestra está disponível.',
    detail: `Versão instalada: ${local}\nÚltima versão: ${remote}`
  }
  const { response } = win
    ? await dialog.showMessageBox(win, opts)
    : await dialog.showMessageBox(opts)
  if (response === 0) void shell.openExternal(RELEASES_PAGE)
}
