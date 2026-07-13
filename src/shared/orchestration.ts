export interface MirrorNode {
  id: string
  type: string
  name: string
  content?: string
  role?: string
  preset?: string
  monitor?: boolean
}

export interface CanvasMirror {
  nodes: MirrorNode[]
}

// Estado reportado por um portal (Fase 9): último {url,title,text} capturado no did-finish-load
// do seu <webview> (ver PortalNode.tsx). Não inclui `name` — é a própria chave de lookup em
// GET /portal?name=... / opts.getPortalState(name); o canal IPC portal:state carrega name +
// PortalState juntos (ver preload/index.ts).
export interface PortalState {
  url: string
  title: string
  text: string
}

export type OrchestrationCommand =
  | { type: 'updateNote'; target: string; content: string; from?: string }
  | { type: 'recruit'; name: string; preset: string; role?: string }
  | { type: 'dismiss'; target: string }
  | { type: 'connect'; source: string; target: string }
  | { type: 'portalOpen'; target: string; url: string }
  | { type: 'portalClick'; target: string; selector: string }
  | { type: 'portalFill'; target: string; selector: string; text: string }
  | { type: 'portalEval'; target: string; js: string }
