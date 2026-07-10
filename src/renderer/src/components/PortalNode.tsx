import { forwardRef } from 'react'
import type { WebviewTag } from 'electron'

// Hospeda o <webview> em si (Fase 9). Fica deliberadamente burro: só renderiza o browser
// embutido e expõe o elemento via ref para o pai (PortalFlowNode) dirigir (loadURL na barra de
// URL aqui na Task 1; executeJavaScript/comandos de orq via um registry na Task 2 — não
// construído ainda aqui de propósito, ver brief da Fase 9).
export const PortalNode = forwardRef<WebviewTag, { url: string }>(function PortalNode({ url }, ref) {
  return <webview ref={ref} src={url} style={{ width: '100%', height: '100%' }} />
})
