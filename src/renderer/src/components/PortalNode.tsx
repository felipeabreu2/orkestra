import { forwardRef, useEffect, useRef, useState } from 'react'
import type { WebviewTag } from 'electron'
import { registerPortal, unregisterPortal, subscribePortalDriving } from '../portalRegistry'
import { snapshotScript, domSnapshotScript } from '../../../shared/portalScripts'
import { pushConsole } from '../../../shared/portalConsoleBuffer'
import type { PortalState } from '../../../shared/orchestration'
import './PortalNode.css'

// Hospeda o <webview> em si (Fase 9). Task 1: renderiza o browser embutido e expõe o elemento
// via ref para o pai (PortalFlowNode) dirigir a barra de URL. Task 2: também (a) registra o
// elemento no portalRegistry ao montar — chaveado por nodeId, é como o hook de comandos
// (useOrchestrationSync) alcança este webview a partir do nome do portal — e (b) reporta
// {name,url,title,text} ao main a cada did-finish-load, via window.orkestra.portalState (canal
// IPC 'portal:state'); o main guarda por nome, servindo de estado para `orq portal snapshot`.
// Fase 25 (Task 2): `partition` (calculada pelo pai via partitionForPortal) vai direto pro
// atributo do <webview> — é o Electron quem isola/compartilha cookies e storage por partition;
// este componente só repassa a string, sem lógica própria de sessão.
export const PortalNode = forwardRef<
  WebviewTag,
  { url: string; nodeId: string; name: string; partition: string }
>(
  function PortalNode({ url, nodeId, name, partition }, forwardedRef) {
    const localRef = useRef<WebviewTag | null>(null)
    // T6 (indicador "agente dirigindo"): true por uma janela efêmera sempre que um comando de portal
    // atinge ESTE nó (via o pub/sub do portalRegistry). Aciona o pulso visual no wrapper abaixo.
    const [driving, setDriving] = useState(false)

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
        // T4: captura o snapshot de TEXTO e o snapshot de DOM interativo no MESMO ciclo (sem
        // round-trip novo) e reporta ambos em portal:state. O DOM é best-effort independente: se a
        // sua captura falhar (página que restringe eval, etc.), cai pro '' e o texto ainda vai.
        Promise.all([
          el.executeJavaScript(snapshotScript()) as Promise<PortalState>,
          (el.executeJavaScript(domSnapshotScript()) as Promise<string>).catch(() => '')
        ])
          .then(([state, dom]) => {
            if (disposed) return
            window.orkestra.portalState({ name, ...state, dom: typeof dom === 'string' ? dom : '' })
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

    // T8 (console do portal): assina o console-message do webview e repassa ao main em BATCHES
    // (throttle de 300ms) pelo IPC portal:console — uma página verborrágica (log em loop) não pode
    // virar tempestade de IPC. O acúmulo entre flushes usa o MESMO pushConsole do main (cap de
    // linhas e de tamanho por linha): a mangueira é fechada nas duas pontas. O buffer canônico
    // vive no main (servido em GET /portal/console); aqui só a fila do próximo batch.
    useEffect(() => {
      const el = localRef.current
      if (!el) return
      let pending: string[] = []
      let timer: ReturnType<typeof setTimeout> | null = null
      const flush = (): void => {
        timer = null
        if (pending.length === 0) return
        const entries = pending
        pending = []
        window.orkestra.portalConsole({ name, entries })
      }
      const onConsole = (e: Event): void => {
        // O shape do evento vem do CONTEÚDO do site (não confiável): level pode ser número
        // (Electron clássico: 0..3) ou string; message pode faltar. Tudo coerido.
        const ev = e as { level?: unknown; message?: unknown }
        const level =
          typeof ev.level === 'number'
            ? (['debug', 'log', 'warn', 'error'][ev.level] ?? 'log')
            : typeof ev.level === 'string'
              ? ev.level
              : 'log'
        const message = typeof ev.message === 'string' ? ev.message : String(ev.message ?? '')
        pushConsole(pending, `[${level}] ${message}`)
        if (!timer) timer = setTimeout(flush, 300)
      }
      el.addEventListener('console-message', onConsole)
      return () => {
        el.removeEventListener('console-message', onConsole)
        if (timer) clearTimeout(timer)
      }
    }, [name])

    // T6: inscrição no pub/sub de "agente dirigindo" para ESTE nó. Cada toque acende o pulso e
    // (re)agenda o apagamento após ~1.2s — comandos em sequência ESTENDEM a janela (reinicia o
    // timer), mantendo o realce aceso enquanto o agente dirige. Timer limpo no unmount (sem vazar).
    useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | null = null
      const off = subscribePortalDriving(nodeId, () => {
        setDriving(true)
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => setDriving(false), 1200)
      })
      return () => {
        off()
        if (timer) clearTimeout(timer)
      }
    }, [nodeId])

    return (
      <div className={`ork-portal-view${driving ? ' ork-portal-view--driving' : ''}`}>
        <webview
          ref={setRef}
          src={url}
          partition={partition}
          style={{ width: '100%', height: '100%', background: 'var(--bg-1)' }}
        />
      </div>
    )
  }
)
