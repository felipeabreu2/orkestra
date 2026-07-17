import { useEffect, useRef } from 'react'
import type { WebviewTag } from 'electron'
import type { Node, Edge } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import type { CanvasMirror, OrchestrationCommand } from '../../../shared/orchestration'
import { clickScript, fillScript, scrollScript } from '../../../shared/portalScripts'
import { isSafePortalUrl } from '../../../shared/portalUrl'
import { getPortal, notifyPortalDriving } from '../portalRegistry'
import { markdownToHtml } from '../markdown/markdownToHtml'
import { htmlToText } from '../context/contextBlock'
import { deriveNoteName } from '../notes/noteName'
import { resolveNoteTarget } from '../notes/noteTarget'

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

// T6 (indicador "agente dirigindo"): resolve o NÓ portal pelo nome e dispara o pulso efêmero no
// PortalNode correspondente (via o pub/sub do portalRegistry). Chamado no início de cada comando de
// portal que atua sobre um portal EXISTENTE (open/click/fill/eval/navigate/scroll) — puramente
// visual, não bloqueia nem depende do sucesso da ação. portalCreate não usa (o nó ainda não existe).
function markPortalDriving(
  nodes: ReturnType<typeof useCanvasStore.getState>['nodes'],
  target: string
): void {
  const node = nodes.find((n) => n.type === 'portal' && (n.data?.name as string) === target)
  if (node) notifyPortalDriving(node.id)
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

// Builder PURO do espelho leve do canvas enviado ao main (id/tipo/nome/conteúdo/preset/monitor/
// maestro dos nós + as ligações). Extraído do useEffect abaixo para (a) permitir teste unitário
// (T5: garantir que data.maestro entra no MirrorNode, alimentando o gating server-side de T6) e
// (b) ser reusado por resolveRecruitPreset ao herdar o preset do Maestro. Posição NÃO entra no
// mirror (arrastar não deve reenviar via IPC) — o posicionamento do recruta vive no store.
export function buildMirror(nodes: Node[], edges: Edge[]): CanvasMirror {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'terminal',
      name: (n.type === 'note'
        ? // Notas #10: nome personalizado (data.name) vence; sem ele, a 1ª linha do conteúdo. A
          // regra vive só em deriveNoteName (notes/noteName.ts) — nada de reimplementar inline
          // aqui, senão o helper testado e o `orq list` divergem (era o caso: o inline mandava o
          // texto INTEIRO truncado, o helper corta na 1ª linha).
          deriveNoteName({ name: n.data?.name as string | undefined, html: n.data?.html as string | undefined })
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
      monitor: n.data?.monitor as boolean | undefined,
      maestro: n.data?.maestro as boolean | undefined,
      // T9: nota vinculada a arquivo .md — o /context expõe o caminho ao agente.
      filePath: n.type === 'note' ? (n.data?.filePath as string | undefined) : undefined
    })),
    // Ligações (source/target) — o servidor usa para resolver os blocos conectados a um terminal.
    edges: edges.map((e) => ({ source: e.source, target: e.target }))
  }
}

// T4: resolve o preset de um recruta. Preset pedido explícito SEMPRE vence; omitido, herda o preset
// do Maestro (nó `from` no espelho) — alinhado ao Maestri ("recruta cópias de si mesmo"); from
// desconhecido/ausente cai no default seguro 'shell'. Puro (sem servidor/DOM) — testável isolado.
export function resolveRecruitPreset(
  mirror: CanvasMirror,
  fromId: string | undefined,
  requested: string | undefined
): string {
  if (requested && requested.trim()) return requested
  const from = fromId ? mirror.nodes.find((n) => n.id === fromId) : undefined
  return from?.preset || 'shell'
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
    const mirror = buildMirror(nodes, edges)
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
        // Alvo: por id/nome explícito (resolveNoteTarget — id → data.name exato → prefixo do
        // texto, ordem determinística, Notas §5); senão a nota ligada à SAÍDA do terminal `from`
        // (edge from→nota); senão a primeira nota (retrocompat). A nota agora é TipTap (html):
        // converte o markdown que o agente escreveu.
        let target = resolveNoteTarget(notes, cmd.target)
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
        // T4: preset omitido herda o do Maestro (resolveRecruitPreset sobre o espelho local).
        const preset = resolveRecruitPreset(buildMirror(store.nodes, store.edges), cmd.from, cmd.preset)
        const maestro = cmd.from
          ? store.nodes.find((n) => n.id === cmd.from && n.type === 'terminal')
          : undefined
        if (maestro) {
          store.recruitBelow(maestro.id, { name: cmd.name, preset, role: cmd.role })
        } else {
          store.addTerminalNode(undefined, { name: cmd.name, preset, role: cmd.role })
        }
      } else if (cmd.type === 'dismiss') {
        const terminals = store.nodes.filter((n) => n.type === 'terminal')
        const target = terminals.find((n) => (n.data?.name as string) === cmd.target)
        if (target) store.removeNode(target.id)
      } else if (cmd.type === 'reassign') {
        // T7: resolve o terminal pelo NOME (mesmo best-effort de dismiss/connect), troca o papel e
        // reinicia SÓ o processo. updateTerminalRole toca apenas data.role — posição, nome e edges
        // ficam intactos; restartTerminal mata o pty e bumpa o epoch de remount, e o TerminalNode
        // remontado re-spawna com o ORKESTRA_ROLE novo no env (o papel viaja por env var, não por
        // arquivo — nada a reescrever aqui). Ordem importa: o papel PRIMEIRO, senão o re-spawn
        // pegaria o papel antigo (o TerminalNode lê `role` como prop do nó já atualizado).
        // Nome desconhecido → silencioso, como os demais verbos por nome.
        const terminals = store.nodes.filter((n) => n.type === 'terminal')
        const target = terminals.find((n) => (n.data?.name as string) === cmd.target)
        if (target) {
          store.updateTerminalRole(target.id, cmd.role)
          store.restartTerminal(target.id)
        }
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
        markPortalDriving(store.nodes, cmd.target) // T6: pulso "agente dirigindo"
        try {
          resolvePortalWebview(store.nodes, cmd.target)?.loadURL(cmd.url)?.catch(() => {})
        } catch {
          // Automação de portal é best-effort/fire-and-forget (ver notas de risco da Fase 9): o
          // webview alvo pode não existir ainda ou não estar pronto — nunca deixa este hook
          // quebrar por causa disso. `orq portal snapshot` é o feedback, não este comando.
        }
      } else if (cmd.type === 'portalClick') {
        markPortalDriving(store.nodes, cmd.target) // T6
        runPortalAction(store.nodes, cmd.target, clickScript(cmd.selector), cmd.requestId)
      } else if (cmd.type === 'portalFill') {
        markPortalDriving(store.nodes, cmd.target) // T6
        runPortalAction(store.nodes, cmd.target, fillScript(cmd.selector, cmd.text), cmd.requestId)
      } else if (cmd.type === 'portalEval') {
        markPortalDriving(store.nodes, cmd.target) // T6
        try {
          resolvePortalWebview(store.nodes, cmd.target)?.executeJavaScript(cmd.js)?.catch(() => {})
        } catch {
          // idem
        }
      } else if (cmd.type === 'portalNavigate') {
        // T2: back/forward/reload via métodos NATIVOS do WebviewTag — sem injeção de script. A união
        // fechada de `action` já foi validada no servidor; back/forward são no-op seguros sem
        // histórico. Best-effort como o resto da automação de portal.
        markPortalDriving(store.nodes, cmd.target) // T6
        try {
          const webview = resolvePortalWebview(store.nodes, cmd.target)
          if (cmd.action === 'back') webview?.goBack()
          else if (cmd.action === 'forward') webview?.goForward()
          else if (cmd.action === 'reload') webview?.reload()
        } catch {
          // idem
        }
      } else if (cmd.type === 'portalScroll') {
        // T3: rolagem via scrollScript(x,y) — a coerção numérica no gerador é a barreira anti-injeção
        // (x/y já vieram números do servidor; scrollScript re-coage por segurança).
        markPortalDriving(store.nodes, cmd.target) // T6
        try {
          resolvePortalWebview(store.nodes, cmd.target)
            ?.executeJavaScript(scrollScript(cmd.x, cmd.y))
            ?.catch(() => {})
        } catch {
          // idem
        }
      } else if (cmd.type === 'portalCreate') {
        // T5: o agente cria um portal. Guard SEC-3 OBRIGATÓRIO: só passa a url ao novo nó se for
        // http/https (isSafePortalUrl) — file://, javascript:, data: são descartados (o portal nasce
        // sem navegar, nunca carregando esquema hostil). addPortalNode dá partition isolada própria
        // (partitionForPortal) e o hardenSession é herdado via session-created. Sem markPortalDriving
        // aqui: o nó ainda não existe (não há PortalNode montado para pulsar).
        const safeUrl = cmd.url && isSafePortalUrl(cmd.url) ? cmd.url : undefined
        store.addPortalNode(undefined, { name: cmd.name, url: safeUrl })
      } else if (cmd.type === 'portalScreenshot') {
        // T7: o agente "vê" a página. capturePage é método NATIVO do WebviewTag (sem injeção de
        // script) e só captura o que já está renderizado — a mesma visibilidade do humano, nenhum
        // vazamento novo. O PNG atravessa para o main como base64 (via toDataURL — o renderer
        // sandboxed não tem Buffer) pelo mesmo portal:result do T1; é o MAIN quem grava o arquivo
        // em tmpdir e responde o caminho ao servidor. Sem requestId não há a quem responder o
        // caminho — comando legado vira no-op (nada a capturar às cegas).
        markPortalDriving(store.nodes, cmd.target) // T6
        const requestId = cmd.requestId
        const reply = (ok: boolean, shot?: { png: string; name: string }): void => {
          if (requestId) window.orkestra.portalResult(requestId, ok, shot)
        }
        try {
          const view = resolvePortalWebview(store.nodes, cmd.target)
          if (!view) {
            reply(false)
          } else {
            view
              .capturePage()
              .then((img) => {
                const dataUrl = img.toDataURL()
                const prefix = 'data:image/png;base64,'
                const png = dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : ''
                if (png) reply(true, { png, name: cmd.target })
                else reply(false)
              })
              .catch(() => reply(false))
          }
        } catch {
          reply(false)
        }
      }
    })
    return dispose
  }, [updateNoteHtml])
}
