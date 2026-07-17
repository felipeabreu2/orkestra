import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

// Resiliência · T1 — PRIMEIRO Menu de aplicação do Orkestra (até aqui o app rodava com o menu
// default do Electron). Mínimo de propósito: os papéis NATIVOS de app/editar/janela ficam — sem
// eles o macOS perde ⌘C/⌘V/⌘Q e ocultar/minimizar — e entra só o que é nosso:
//   · Visualizar → Resetar Foco (⌘Esc): manda `view:reset-focus` ao renderer, que solta um
//     xterm/webview prendendo o teclado e devolve o foco ao canvas (paliativo de 1 gesto; o bug
//     de foco preso continua sendo bug a eliminar).
//   · Ajuda → Reportar um Problema… (T4): dispara o export de diagnóstico REDIGIDO no main.
// `deps.exportDiagnostics` é injetado (o menu não conhece dialog/fs) — mesmo padrão de seams de
// registerProjectIpc.
export function buildAppMenu(
  win: BrowserWindow,
  deps: { exportDiagnostics?: () => void } = {}
): Menu {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    // Papel de app do macOS (Sobre/Ocultar/Sair). Em win/linux não existe — omitido.
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'Visualizar',
      submenu: [
        {
          label: 'Resetar Foco',
          accelerator: 'CmdOrCtrl+Escape',
          click: () => {
            if (!win.isDestroyed()) win.webContents.send('view:reset-focus')
          }
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Reportar um Problema…',
          click: () => deps.exportDiagnostics?.()
        }
      ]
    }
  ]
  return Menu.buildFromTemplate(template)
}
