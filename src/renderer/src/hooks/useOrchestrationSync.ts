import { useEffect } from 'react'
import type { WebviewTag } from 'electron'
import { useCanvasStore } from '../store/canvasStore'
import type { CanvasMirror, OrchestrationCommand } from '../../../shared/orchestration'
import { clickScript, fillScript } from '../../../shared/portalScripts'
import { getPortal } from '../portalRegistry'
import { markdownToHtml } from '../markdown/markdownToHtml'

// Resolve um portal pelo nome atual no espelho local do canvas -> node.id -> webview (via o
// registry que o PortalNode popula ao montar). Mesmo padrão nome->nó->recurso usado no main para
// terminais (resolvePtyByName, Fase 6) — aqui a busca é local (useCanvasStore.getState()), não
// via IPC, já que o registry de webviews só existe neste processo (renderer).
function resolvePortalWebview(
  nodes: ReturnType<typeof useCanvasStore.getState>['nodes'],
  target: string
): WebviewTag | undefined {
  const node = nodes.find((n) => n.type === 'portal' && (n.data?.name as string) === target)
  return node ? getPortal(node.id) : undefined
}

// Mantém o main sincronizado com um espelho leve do canvas (id/tipo/nome/conteúdo dos nós)
// e aplica de volta no store os comandos vindos do orq (via main), ex.: updateNote.
export function useOrchestrationSync(): void {
  const nodes = useCanvasStore((s) => s.nodes)
  const updateNoteHtml = useCanvasStore((s) => s.updateNoteHtml)

  // Envia um espelho leve do canvas ao main sempre que os nós mudam.
  useEffect(() => {
    const mirror: CanvasMirror = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type ?? 'terminal',
        name: ((n.data?.name as string) ?? (n.data?.content as string) ?? n.type ?? 'nó').slice(0, 40),
        content: n.data?.content as string | undefined,
        role: (n.data?.role as string) ?? '',
        preset: (n.data?.preset as string) ?? 'shell',
        monitor: n.data?.monitor as boolean | undefined
      }))
    }
    window.orkestra.orchestration.sync(mirror)
  }, [nodes])

  // Aplica comandos vindos do orq (via main). Sempre lê o estado fresco via getState() (em vez
  // de depender de `nodes` no dep array) para evitar closures obsoletas entre re-renders.
  useEffect(() => {
    const dispose = window.orkestra.orchestration.onCommand((cmd: OrchestrationCommand) => {
      const store = useCanvasStore.getState()
      if (cmd.type === 'updateNote') {
        const notes = store.nodes.filter((n) => n.type === 'note')
        const target = cmd.target
          ? notes.find((n) => n.id === cmd.target || (n.data?.name as string) === cmd.target)
          : notes[0]
        // Nota agora é TipTap (html): converte o texto/markdown que o agente escreveu em html.
        if (target) updateNoteHtml(target.id, markdownToHtml(cmd.content))
      } else if (cmd.type === 'recruit') {
        store.addTerminalNode(undefined, { name: cmd.name, preset: cmd.preset, role: cmd.role })
      } else if (cmd.type === 'dismiss') {
        const terminals = store.nodes.filter((n) => n.type === 'terminal')
        const target = terminals.find((n) => (n.data?.name as string) === cmd.target)
        if (target) store.removeNode(target.id)
      } else if (cmd.type === 'connect') {
        const terminals = store.nodes.filter((n) => n.type === 'terminal')
        const source = terminals.find((n) => (n.data?.name as string) === cmd.source)
        const target = terminals.find((n) => (n.data?.name as string) === cmd.target)
        if (source && target) {
          store.onConnect({ source: source.id, target: target.id, sourceHandle: null, targetHandle: null })
        }
      } else if (cmd.type === 'portalOpen') {
        try {
          resolvePortalWebview(store.nodes, cmd.target)?.loadURL(cmd.url)?.catch(() => {})
        } catch {
          // Automação de portal é best-effort/fire-and-forget (ver notas de risco da Fase 9): o
          // webview alvo pode não existir ainda ou não estar pronto — nunca deixa este hook
          // quebrar por causa disso. `orq portal snapshot` é o feedback, não este comando.
        }
      } else if (cmd.type === 'portalClick') {
        try {
          resolvePortalWebview(store.nodes, cmd.target)
            ?.executeJavaScript(clickScript(cmd.selector))
            ?.catch(() => {})
        } catch {
          // idem
        }
      } else if (cmd.type === 'portalFill') {
        try {
          resolvePortalWebview(store.nodes, cmd.target)
            ?.executeJavaScript(fillScript(cmd.selector, cmd.text))
            ?.catch(() => {})
        } catch {
          // idem
        }
      } else if (cmd.type === 'portalEval') {
        try {
          resolvePortalWebview(store.nodes, cmd.target)?.executeJavaScript(cmd.js)?.catch(() => {})
        } catch {
          // idem
        }
      }
    })
    return dispose
  }, [updateNoteHtml])
}
