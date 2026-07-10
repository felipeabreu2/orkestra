import { forwardRef, useEffect, useRef } from 'react'
import type { WebviewTag } from 'electron'
import { registerPortal, unregisterPortal } from '../portalRegistry'
import { snapshotScript } from '../../../shared/portalScripts'
import type { PortalState } from '../../../shared/orchestration'

// Hospeda o <webview> em si (Fase 9). Task 1: renderiza o browser embutido e expõe o elemento
// via ref para o pai (PortalFlowNode) dirigir a barra de URL. Task 2: também (a) registra o
// elemento no portalRegistry ao montar — chaveado por nodeId, é como o hook de comandos
// (useOrchestrationSync) alcança este webview a partir do nome do portal — e (b) reporta
// {name,url,title,text} ao main a cada did-finish-load, via window.orkestra.portalState (canal
// IPC 'portal:state'); o main guarda por nome, servindo de estado para `orq portal snapshot`.
export const PortalNode = forwardRef<WebviewTag, { url: string; nodeId: string; name: string }>(
  function PortalNode({ url, nodeId, name }, forwardedRef) {
    const localRef = useRef<WebviewTag | null>(null)

    // Combina o ref local (usado pelos efeitos abaixo, que precisam do elemento de verdade) com
    // o ref encaminhado pelo pai (usado pela barra de URL em PortalFlowNode) — ambos apontam
    // para o mesmo <webview>.
    const setRef = (el: WebviewTag | null): void => {
      localRef.current = el
      if (typeof forwardedRef === 'function') forwardedRef(el)
      else if (forwardedRef) forwardedRef.current = el
    }

    // Registry (Task 2): permite ao hook de comandos alcançar este webview a partir do nome do
    // portal (nome -> nó -> nodeId -> registry), sem prop-drilling da árvore do React Flow.
    useEffect(() => {
      const el = localRef.current
      if (!el) return
      registerPortal(nodeId, el)
      return () => unregisterPortal(nodeId)
    }, [nodeId])

    // Estado/snapshot (Task 2): a cada carregamento completo, captura {url,title,text} via
    // snapshotScript() e reporta ao main — best-effort/fire-and-forget (ver notas de risco da
    // Fase 9), guardado contra reportar depois de desmontado.
    useEffect(() => {
      const el = localRef.current
      if (!el) return
      let disposed = false
      const onFinishLoad = (): void => {
        el.executeJavaScript(snapshotScript())
          .then((state: PortalState) => {
            if (disposed) return
            window.orkestra.portalState({ name, ...state })
          })
          .catch(() => {
            // best-effort: se a captura do snapshot falhar, só não reporta este ciclo — o
            // próximo did-finish-load tenta de novo.
          })
      }
      el.addEventListener('did-finish-load', onFinishLoad)
      return () => {
        disposed = true
        el.removeEventListener('did-finish-load', onFinishLoad)
      }
    }, [name])

    return <webview ref={setRef} src={url} style={{ width: '100%', height: '100%' }} />
  }
)
