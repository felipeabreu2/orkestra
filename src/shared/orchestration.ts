export interface MirrorNode {
  id: string
  type: string
  name: string
  content?: string
  role?: string
  preset?: string
  monitor?: boolean
}

// Ligações do canvas no espelho — o suficiente para o servidor resolver "o que está conectado a
// este terminal" (usado por GET /context → orq context). Direção não importa para contexto: um
// bloco ligado em qualquer ponta é legível pelo agente.
export interface MirrorEdge {
  source: string
  target: string
}

export interface CanvasMirror {
  nodes: MirrorNode[]
  edges: MirrorEdge[]
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

// T1 (round-trip de portal click/fill): resultado de uma ação de portal que o renderer devolve ao
// main. `ok` = a ação achou o elemento e agiu (clickScript/fillScript já retornam esse booleano);
// o servidor o repassa como JSON `{ok}` ao orq. Tipo próprio (não só `boolean`) para as ações
// futuras (T7 screenshot) estenderem com campos extras sem quebrar o contrato.
export interface PortalActionResult {
  ok: boolean
}

export type OrchestrationCommand =
  | { type: 'updateNote'; target: string; content: string; from?: string }
  | { type: 'recruit'; name: string; preset: string; role?: string; from?: string }
  | { type: 'dismiss'; target: string }
  | { type: 'connect'; source: string; target: string }
  | { type: 'portalOpen'; target: string; url: string }
  // requestId (T1): carimbado pelo main ao relayar a ação para o renderer; quando presente, o
  // renderer devolve o booleano de sucesso via IPC 'portal:result' (fecha o round-trip). Ausente
  // (comando legado/externo) → fire-and-forget silencioso como antes.
  | { type: 'portalClick'; target: string; selector: string; requestId?: string }
  | { type: 'portalFill'; target: string; selector: string; text: string; requestId?: string }
  | { type: 'portalEval'; target: string; js: string }
