import { useEffect, useRef } from 'react'
import type { WebviewTag } from 'electron'
import { useCanvasStore } from '../store/canvasStore'
import type { CanvasMirror, OrchestrationCommand } from '../../../shared/orchestration'
import { clickScript, fillScript } from '../../../shared/portalScripts'
import { isSafePortalUrl } from '../../../shared/portalUrl'
import { getPortal } from '../portalRegistry'
import { markdownToHtml } from '../markdown/markdownToHtml'
import { htmlToText } from '../context/contextBlock'

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

// T1 (round-trip do booleano): executa um script de ação (clickScript/fillScript) no <webview> do
// portal e, quando o comando trouxe requestId, encaminha o booleano de sucesso de volta ao main
// (window.orkestra.portalResult) — fechando o round-trip que o OrchestrationServer aguarda. Sem
// requestId (comando legado/externo), mantém o fire-and-forget silencioso de antes (.catch(()=>{})).
//
// Determinismo p/ não travar o servidor no timeout: se o portal não resolve (nome errado / webview
// ainda não montado) ou o executeJavaScript rejeita/lança, respondemos `false` na hora em vez de
// deixar o servidor esperar o teto do registry. O booleano vem coerido (=== true): o clickScript já
// retorna true/false, mas isto blinda contra um retorno inesperado do webview.
function runPortalAction(
  nodes: ReturnType<typeof useCanvasStore.getState>['nodes'],
  target: string,
  script: string,
  requestId?: string
): void {
  const reply = (ok: boolean): void => {
    if (requestId) window.orkestra.portalResult(requestId, ok)
  }
  try {
    const pending = resolvePortalWebview(nodes, target)?.executeJavaScript(script)
    if (!pending) {
      reply(false)
      return
    }
    if (requestId) {
      pending.then((ok) => reply(ok === true)).catch(() => reply(false))
    } else {
      pending.catch(() => {})
    }
  } catch {
    reply(false)
  }
}

// Mantém o main sincronizado com um espelho leve do canvas (id/tipo/nome/conteúdo dos nós)
// e aplica de volta no store os comandos vindos do orq (via main), ex.: updateNote.
export function useOrchestrationSync(): void {
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const updateNoteHtml = useCanvasStore((s) => s.updateNoteHtml)
  // Otimização (Bloco 2b): último mirror serializado enviado — evita reenviar via IPC quando o que
  // mudou nos nós não afeta o mirror (arrastar só muda position, ~60x/s, e position não entra no
  // mirror). Comparação O(tamanho do mirror), barata (o mirror é leve por construção).
  const lastMirrorRef = useRef<string>('')

  // Envia um espelho leve do canvas ao main quando o mirror muda de fato (ver diff abaixo).
  useEffect(() => {
    const mirror: CanvasMirror = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type ?? 'terminal',
        name: (n.type === 'note'
          ? // Notas #10: nome personalizado (data.name) vence; sem ele, a 1ª linha do conteúdo.
            (n.data?.name as string)?.trim() || htmlToText((n.data?.html as string) ?? '') || 'Nota'
          : (n.data?.name as string) ?? (n.data?.content as string) ?? n.type ?? 'nó'
        ).slice(0, 40),
        // content = conteúdo LEGÍVEL do bloco, para `orq context` entregar ao agente: texto da nota
        // (htmlToText do TipTap), caminho do arquivo (o agente lê com sua própria ferramenta), ou a
        // URL do site. Terminais não têm content de contexto.
        content:
          n.type === 'note'
            ? htmlToText((n.data?.html as string) ?? '')
            : n.type === 'file'
              ? (n.data?.path as string) ?? ''
              : n.type === 'portal'
                ? (n.data?.url as string) ?? ''
                : (n.data?.content as string | undefined),
        role: (n.data?.role as string) ?? '',
        preset: (n.data?.preset as string) ?? 'shell',
        monitor: n.data?.monitor as boolean | undefined
      })),
      // Ligações (source/target) — o servidor usa para resolver os blocos conectados a um terminal.
      edges: edges.map((e) => ({ source: e.source, target: e.target }))
    }
    const serialized = JSON.stringify(mirror)
    if (serialized === lastMirrorRef.current) return // nada relevante mudou (ex.: só posição) → não reenvia
    lastMirrorRef.current = serialized
    window.orkestra.orchestration.sync(mirror)
  }, [nodes, edges])

  // Aplica comandos vindos do orq (via main). Sempre lê o estado fresco via getState() (em vez
  // de depender de `nodes` no dep array) para evitar closures obsoletas entre re-renders.
  useEffect(() => {
    const dispose = window.orkestra.orchestration.onCommand((cmd: OrchestrationCommand, projectId?: string | null) => {
      const store = useCanvasStore.getState()
      // Escopo de projeto (2026-07-14): o main carimba cada comando com o projeto ativo no
      // momento do relay; se o canvas exibido aqui já/ainda é OUTRO projeto (janela de ms no meio
      // de uma troca), descarta — aplicar mutaria o canvas errado. Sem carimbo ou sem dono
      // conhecido (legado/boot), aplica como antes.
      if (projectId != null && store.activeProjectId != null && projectId !== store.activeProjectId) return
      if (cmd.type === 'updateNote') {
        const notes = store.nodes.filter((n) => n.type === 'note')
        // Alvo: por id/nome explícito; senão a nota ligada à SAÍDA do terminal `from` (edge
        // from→nota); senão a primeira nota (retrocompat). A nota agora é TipTap (html): converte o
        // markdown que o agente escreveu.
        const wanted = cmd.target?.toLowerCase().trim()
        let target = wanted
          ? notes.find(
              (n) => n.id === cmd.target || htmlToText((n.data?.html as string) ?? '').toLowerCase().startsWith(wanted)
            )
          : undefined
        if (!target && cmd.from) {
          const edge = store.edges.find((e) => e.source === cmd.from && notes.some((n) => n.id === e.target))
          target = edge ? notes.find((n) => n.id === edge.target) : undefined
        }
        if (!target && !cmd.target && !cmd.from) target = notes[0]
        if (target) updateNoteHtml(target.id, markdownToHtml(cmd.content))
      } else if (cmd.type === 'recruit') {
        // T3 (#6): quando o `from` (ORKESTRA_NODE_ID do Maestro) resolve a um terminal do canvas,
        // posiciona o recruta ABAIXO dele e auto-conecta (recruitBelow). Sem `from` resolvível
        // (orq legado/externo, ou id sem correspondência) → fallback de cascata (addTerminalNode).
        const maestro = cmd.from
          ? store.nodes.find((n) => n.id === cmd.from && n.type === 'terminal')
          : undefined
        if (maestro) {
          store.recruitBelow(maestro.id, { name: cmd.name, preset: cmd.preset, role: cmd.role })
        } else {
          store.addTerminalNode(undefined, { name: cmd.name, preset: cmd.preset, role: cmd.role })
        }
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
        // SEC-3 (auditoria 2026-07-14): a URL vem de um agente (não confiável) — só navega para
        // http/https. Bloqueia file:// (leitura de arquivo local via snapshot) e javascript:/data:
        // (execução de script na sessão possivelmente autenticada do portal). Silencioso, como
        // toda automação de portal (best-effort).
        if (!isSafePortalUrl(cmd.url)) return
        try {
          resolvePortalWebview(store.nodes, cmd.target)?.loadURL(cmd.url)?.catch(() => {})
        } catch {
          // Automação de portal é best-effort/fire-and-forget (ver notas de risco da Fase 9): o
          // webview alvo pode não existir ainda ou não estar pronto — nunca deixa este hook
          // quebrar por causa disso. `orq portal snapshot` é o feedback, não este comando.
        }
      } else if (cmd.type === 'portalClick') {
        runPortalAction(store.nodes, cmd.target, clickScript(cmd.selector), cmd.requestId)
      } else if (cmd.type === 'portalFill') {
        runPortalAction(store.nodes, cmd.target, fillScript(cmd.selector, cmd.text), cmd.requestId)
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
