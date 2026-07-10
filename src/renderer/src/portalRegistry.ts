import type { WebviewTag } from 'electron'

// Registry de webviews de portal (Fase 9 Task 2): o PortalNode registra seu elemento <webview>
// aqui ao montar (chaveado pelo node.id do React Flow) e remove ao desmontar. O hook de comandos
// (useOrchestrationSync) resolve nome de portal -> nó (no canvasStore) -> node.id -> webview
// aqui — mesmo padrão nome->nó->recurso usado no main para terminais (resolvePtyByName, Fase 6),
// só que local ao renderer, já que o webview em si só existe aqui.
const portals = new Map<string, WebviewTag>()

export function registerPortal(nodeId: string, el: WebviewTag): void {
  portals.set(nodeId, el)
}

export function unregisterPortal(nodeId: string): void {
  portals.delete(nodeId)
}

export function getPortal(nodeId: string): WebviewTag | undefined {
  return portals.get(nodeId)
}
