/// <reference types="vite/client" />
import type { OrkestraApi } from '../../preload'
import type { DetailedHTMLProps, HTMLAttributes } from 'react'
// Import type-only: apagado na transpilação, não cria dependência de runtime do renderer no
// módulo 'electron' (o preload é quem de fato usa a API em runtime). Usado só para tipar a tag
// <webview>, que o React/JSX não conhece nativamente (Fase 9 — ver PortalNode.tsx).
import type { WebviewTag } from 'electron'

declare global {
  interface Window {
    orkestra: OrkestraApi
  }

  namespace JSX {
    interface IntrinsicElements {
      // Tipo mínimo (atributos HTML padrão + src) o bastante para o que o PortalNode usa;
      // a API de automação real (loadURL/executeJavaScript/...) é acessada via ref: WebviewTag.
      webview: DetailedHTMLProps<HTMLAttributes<WebviewTag>, WebviewTag> & {
        src?: string
        partition?: string
      }
    }
  }
}
