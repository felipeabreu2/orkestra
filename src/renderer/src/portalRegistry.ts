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

// T6 (indicador "agente dirigindo") — pub/sub PURO por nodeId. Quando o hook de comandos
// (useOrchestrationSync) aplica QUALQUER ação de portal a um nó, chama notifyPortalDriving(nodeId);
// o PortalNode daquele nó, inscrito por subscribePortalDriving, acende um realce efêmero (pulso) e
// o apaga sozinho após ~1s. Fica aqui (não no canvasStore) porque o alvo é o mesmo nodeId que o
// registry já usa para resolver o webview — e mantém o efeito local ao componente, sem inflar o
// store global. Sem timers aqui: a janela de expiração vive no componente; este módulo só entrega o
// "toque". Puro e testável (o subscribe/notify não depende de DOM/Electron).
type DrivingListener = () => void
const drivingListeners = new Map<string, Set<DrivingListener>>()

export function subscribePortalDriving(nodeId: string, cb: DrivingListener): () => void {
  let set = drivingListeners.get(nodeId)
  if (!set) {
    set = new Set()
    drivingListeners.set(nodeId, set)
  }
  set.add(cb)
  return () => {
    const s = drivingListeners.get(nodeId)
    if (!s) return
    s.delete(cb)
    if (s.size === 0) drivingListeners.delete(nodeId)
  }
}

export function notifyPortalDriving(nodeId: string): void {
  const set = drivingListeners.get(nodeId)
  if (set) for (const cb of [...set]) cb()
}
