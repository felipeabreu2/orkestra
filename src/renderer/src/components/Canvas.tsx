import { useEffect, useRef, useState, type ComponentType } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type NodeChange,
  type NodeProps,
  type Connection
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './Canvas.css'
import { useCanvasStore, hasWidgetClipboard, absolutePositionOf } from '../store/canvasStore'
import { TerminalFlowNode } from './TerminalFlowNode'
import { NoteNode } from './NoteNode'
import { PortalFlowNode } from './PortalFlowNode'
import { FileTreeNode } from './FileTreeNode'
import { FileNode } from './FileNode'
import { DrawNode } from './DrawNode'
import { GroupNode } from './GroupNode'
import { TypedEdge } from './TypedEdge'
import { CommandPalette } from './CommandPalette'
import { NewTerminalModal } from './NewTerminalModal'
import { Topbar } from './Topbar'
import { emitNewProject } from '../ui/appEvents'
import { NodeToolbar } from './NodeToolbar'
import { CreateOverlay } from './CreateOverlay'
import { CanvasContextMenu, type ContextMenuItem } from './CanvasContextMenu'
import { ErrorBoundary } from './ErrorBoundary'
import { useCanvasPersistence } from '../hooks/useCanvasPersistence'
import { useOrchestrationSync } from '../hooks/useOrchestrationSync'
import { alignNodes, distributeNodes, gridArrange, type AlignAxis, type DistributeAxis, type PosNode } from '../layout/arrange'

// REN-3 (auditoria 2026-07-14): cada nó renderiza dentro do seu próprio ErrorBoundary. Um
// data.scene do Excalidraw (DrawNode) ou html do TipTap (NoteNode) corrompido faz o componente
// lançar no render; sem o boundary local, o erro sobe até o boundary do App (App.tsx) e a UI
// INTEIRA — sidebar, canvas, todos os outros nós — vira o fallback de erro. Com ele, só o nó
// problemático mostra o fallback e o resto segue vivo. TerminalFlowNode já tem boundary interno.
// Wrappers criados UMA vez, no nível do módulo (nodeTypes precisa de identidade estável).
function withNodeBoundary(Comp: ComponentType<NodeProps>): ComponentType<NodeProps> {
  const Wrapped = (props: NodeProps): JSX.Element => (
    <ErrorBoundary>
      <Comp {...props} />
    </ErrorBoundary>
  )
  Wrapped.displayName = `NodeBoundary(${Comp.displayName ?? Comp.name ?? 'Node'})`
  return Wrapped
}

const nodeTypes = {
  terminal: TerminalFlowNode,
  note: withNodeBoundary(NoteNode),
  portal: withNodeBoundary(PortalFlowNode),
  filetree: withNodeBoundary(FileTreeNode),
  file: withNodeBoundary(FileNode),
  draw: withNodeBoundary(DrawNode),
  group: withNodeBoundary(GroupNode)
}

// Fase 22 (Task 2): registro de edge customizada, mesmo padrão do nodeTypes acima — constante
// de módulo (não recriada a cada render) para o React Flow não thrashear/avisar sobre uma nova
// referência de objeto em toda renderização. onConnect/hydrate (Task 1, canvasStore) já marcam
// toda edge com type:'typed', então este é o único entry necessário no registro.
const edgeTypes = {
  typed: TypedEdge
}

// MiniMap · maskColor tema-aware (reformulação Lote B, §4.11). A máscara é a área ESCURECIDA fora
// do viewport no minimap; o React Flow expõe `maskColor` só como prop e a pinta no atributo SVG
// `fill` de um <path>, que NÃO resolve var()/color-mix() — precisa de uma cor CONCRETA. Antes era
// "rgba(11,13,18,0.6)" fixo (o --bg-0 ESCURO escrito à mão), que não acompanhava o tema claro
// (véu escuro sobre um minimap claro). readBgMask lê o --bg-0 ATUAL do :root via getComputedStyle
// e compõe rgba(...,0.6) — a mesma cor do fundo do canvas, translúcida. hexToRgb aceita #rgb e
// #rrggbb (formato do token nos dois temas); fallback pro escuro se o token não puder ser lido
// (ex.: jsdom/teste sem :root pintado).
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (h.length !== 6) return null
  const n = Number.parseInt(h, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function readBgMask(): string {
  if (typeof document === 'undefined') return 'rgba(11, 13, 18, 0.6)'
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--bg-0')
  const rgb = hexToRgb(raw)
  return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)` : 'rgba(11, 13, 18, 0.6)'
}

// isTypingTarget guarda os atalhos que SÃO sensíveis a texto (foco/zoom/minimap da Fase 18:
// Shift+1/2/M; foco em nó com atenção da Fase 20 Task 2: Shift+A) — Cmd/Ctrl+K (Fase 12) e
// Cmd/Ctrl+G / Cmd/Ctrl+Shift+G (Fase 18 Task 3) são comandos, não texto, e rodam ANTES deste
// guard (ver handleKeyDown abaixo), então não passam por aqui. Esta função cobre: nem num input/textarea/select/contentEditable (nome de
// terminal, nota, campo do palette) nem dentro de um terminal xterm.js (que captura teclado via
// uma <textarea> escondida — já cairia no primeiro check, mas o closest('.xterm') cobre
// qualquer outro elemento focável que a lib venha a usar dentro do terminal). Sem isso, por ex.
// Backspace apagaria o nó do terminal enquanto o usuário só queria apagar um caractere no shell.
function isTypingTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null
  if (target) {
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
      return true
    }
  }
  return Boolean(document.activeElement?.closest('.xterm'))
}

export function Canvas(): JSX.Element {
  useCanvasPersistence()
  useOrchestrationSync()
  const nodes = useCanvasStore((s) => s.nodes)
  const onNodesChange = useCanvasStore((s) => s.onNodesChange)
  const edges = useCanvasStore((s) => s.edges)
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange)
  const onConnect = useCanvasStore((s) => s.onConnect)
  const addTerminalNode = useCanvasStore((s) => s.addTerminalNode)
  const addNoteNode = useCanvasStore((s) => s.addNoteNode)
  const addPortalNode = useCanvasStore((s) => s.addPortalNode)
  const addFileTreeNode = useCanvasStore((s) => s.addFileTreeNode)
  const addFileNode = useCanvasStore((s) => s.addFileNode)
  const addDrawNode = useCanvasStore((s) => s.addDrawNode)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const removeEdgesForNode = useCanvasStore((s) => s.removeEdgesForNode)
  const activeCwd = useCanvasStore((s) => s.activeCwd)
  const sidebarCollapsed = useCanvasStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useCanvasStore((s) => s.toggleSidebar)
  const setNodePositions = useCanvasStore((s) => s.setNodePositions)
  const ungroupGroupsById = useCanvasStore((s) => s.ungroupGroupsById)
  const setAttention = useCanvasStore((s) => s.setAttention)
  const setGenerating = useCanvasStore((s) => s.setGenerating)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [newTermOpen, setNewTermOpen] = useState(false)
  // "Arrastar para criar" (Figma-like): ferramenta pendente escolhida na barra (nota/site/arquivos).
  // Enquanto != null, o CreateOverlay captura o gesto e cria o item com a posição/tamanho arrastados.
  const [pendingTool, setPendingTool] = useState<'note' | 'portal' | 'filetree' | 'draw' | null>(null)
  const [minimapOn, setMinimapOn] = useState(true)
  // Cor da máscara do MiniMap derivada do --bg-0 em runtime (ver readBgMask acima, §4.11). Um
  // MutationObserver no data-theme do <html> (o flip de tema vive em theme.ts/ThemeToggle, fora
  // deste arquivo) rederiva a cor no flip — mantém a máscara alinhada ao fundo do canvas nos dois
  // temas sem hardcodar o valor escuro.
  const [minimapMask, setMinimapMask] = useState(readBgMask)
  // R4: menu de contexto (botão direito). nodeId!==null => menu de ações do nó; senão => menu de
  // criação no ponto do cursor (flowX/flowY já em coordenadas do canvas). x/y são de tela (posição
  // do menu). null => fechado.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; flowX: number; flowY: number; nodeId: string | null } | null>(null)
  const { fitView, screenToFlowPosition } = useReactFlow()
  // Fase 20 (Task 2): índice de qual nó em `attention` o Shift+A deve focar na PRÓXIMA vez que
  // for pressionado (ciclo entre múltiplos agentes ociosos). Ref (não state) porque não precisa
  // re-renderizar nada por si só — só é lido/escrito dentro do handler de keydown.
  const attentionCycleRef = useRef(0)

  // Assina window.orkestra.onAgentAttention (Fase 20 Task 1, main/preload): dispara com o nodeId
  // de um terminal cujo agente produziu output e depois ficou ocioso. Só ACENDE o indicador aqui
  // (setAttention(nodeId, true)) — apagar é responsabilidade do próprio TerminalFlowNode/
  // TerminalNode ao focar aquele terminal específico (clearAgentAttention + setAttention false),
  // não deste efeito global. Cleanup desinscreve (a própria função retornada pelo preload).
  useEffect(() => {
    const off = window.orkestra.onAgentAttention((nodeId) => {
      // "Monitorar atividade" desligado (data.monitor === false, Fase 29) → não acende o
      // indicador para este terminal. Lê o estado atual via getState (não põe `nodes` nas deps,
      // evitando re-inscrever o listener a cada mudança do canvas).
      const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId)
      // Nó ausente = terminal de OUTRO projeto (pty vivo em segundo plano): não acumula um id
      // órfão em attention (Shift+A panaria para nó inexistente) — a notificação do SO, disparada
      // no main, continua cobrindo o aviso cross-project.
      if (!node) return
      if ((node.data as { monitor?: boolean }).monitor === false) return
      setAttention(nodeId, true)
    })
    return off
  }, [setAttention])

  // Fix border-beam preso (2026-07-15): assina window.orkestra.onAgentBusy (AgentBus no main) —
  // o sinal REAL de "generating" (border-beam), ancorado no MESMO detector de ociosidade do
  // onAgentAttention acima (idleMs de silêncio real), substituindo a heurística de 500ms fixos
  // que vivia em TerminalNode.tsx (presa ligada por repaints ociosos da TUI do Claude Code/Ink —
  // ver AgentBus.ts). Global (não por-nó) pelo mesmo motivo de onAgentAttention: um único
  // listener aqui evita recriar a assinatura IPC por terminal montado.
  useEffect(() => {
    // Guard defensivo: em dev, trocar o preload sem reiniciar o processo (um reload só do renderer,
    // ou HMR) deixa window.orkestra.onAgentBusy indefinido — chamá-lo lançaria e derrubaria o Canvas
    // inteiro (ErrorBoundary "Falha ao renderizar este item"). Aqui degradamos sem o beam em vez de
    // crashar; um restart do `npm run dev` recarrega o preload e o sinal volta.
    if (typeof window.orkestra?.onAgentBusy !== 'function') return
    const off = window.orkestra.onAgentBusy((nodeId, busy) => {
      // Mesmo guard de "nó ausente" do onAgentAttention acima: um pty de OUTRO projeto (que
      // sobrevive à troca, Fase 31) pode seguir emitindo saída em segundo plano — sem este guard,
      // `generating` acumularia um id órfão que nenhum TerminalFlowNode desta tela representa
      // (hydrate() já limpa tudo na troca de projeto, mas evitar a entrada é mais barato/seguro).
      const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId)
      if (!node) return
      setGenerating(nodeId, busy)
    })
    return off
  }, [setGenerating])

  // Rederiva a cor da máscara do MiniMap quando o tema vira (data-theme no <html> muda). Observa
  // só esse atributo — barato e desacoplado do ThemeToggle (Lote E), que não precisa saber do
  // minimap. Sincroniza uma vez na montagem também, caso o tema tenha sido aplicado após o
  // primeiro render (loadTheme roda antes, mas o :root pode não estar computado no lazy init).
  useEffect(() => {
    const root = document.documentElement
    setMinimapMask(readBgMask())
    const obs = new MutationObserver(() => setMinimapMask(readBgMask()))
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  // Barra de alinhar/distribuir/organizar em grade (Fase 18 Task 2): só aparece com 2+ nós
  // selecionados (node.selected, setado pelo próprio React Flow no clique/box-select). Cada
  // botão converte a seleção pro PosNode puro (id/position/width/height) que arrange.ts espera,
  // roda a função pura correspondente e aplica o resultado via setNodePositions — nenhuma
  // lógica de geometria vive aqui, só a ponte store<->arrange.
  const selectedNodes = nodes.filter((n) => n.selected)
  // REN-6 (auditoria 2026-07-14): passa posições ABSOLUTAS ao arrange (resolve parentId de filhos
  // de grupo) — senão alinhar/distribuir uma seleção que mistura filhos de grupo com nós de fora
  // operaria em sistemas de coordenadas diferentes. setNodePositions reconverte p/ relativo ao aplicar.
  const toPosNodes = (): PosNode[] =>
    selectedNodes.map((n) => ({ id: n.id, position: absolutePositionOf(n, nodes), width: n.width, height: n.height }))
  const runAlign = (axis: AlignAxis): void => setNodePositions(alignNodes(toPosNodes(), axis))
  const runDistribute = (axis: DistributeAxis): void => setNodePositions(distributeNodes(toPosNodes(), axis))
  const runGrid = (): void => setNodePositions(gridArrange(toPosNodes()))

  // Cria o item da ferramenta pendente na posição/tamanho arrastados (size null = tamanho padrão).
  const handleCreateNode = (
    pos: { x: number; y: number },
    size: { width: number; height: number } | null
  ): void => {
    const opts = size ? { width: size.width, height: size.height } : undefined
    if (pendingTool === 'note') addNoteNode(pos, opts)
    else if (pendingTool === 'portal') addPortalNode(pos, opts)
    else if (pendingTool === 'filetree') addFileTreeNode(pos, opts)
    else if (pendingTool === 'draw') addDrawNode(pos, opts)
    setPendingTool(null)
  }

  // Ao conectar um bloco a um terminal NÃO empurramos mais o conteúdo no prompt do agente. O antigo
  // injectContext digitava texto cru via pty.write (sem Enter) — frágil (dependia do timing do
  // agente estar pronto) e intrusivo (poluía o input do Claude Code). Agora o agente PUXA o contexto
  // sob demanda com `orq context`, que sempre reflete o estado ATUAL do canvas (conectar/desconectar/
  // editar), orientado pelo onboarding injetado no system prompt de todo `claude` (ver installOrq).
  const handleConnect = (connection: Connection): void => {
    onConnect(connection)
  }

  // R4: itens do menu de contexto. Com nodeId => ações do nó (copiar/duplicar/remover conexões/
  // excluir); sem nodeId => criar um nó no ponto do cursor ou colar o clipboard de widgets ali
  // (flowX/flowY já convertidos para o canvas).
  const ctxMenuItems = (): ContextMenuItem[] => {
    if (!ctxMenu) return []
    if (ctxMenu.nodeId) {
      const id = ctxMenu.nodeId
      const hasEdges = edges.some((e) => e.source === id || e.target === id)
      // Botão direito num nó que faz parte da seleção atual age sobre a seleção INTEIRA (copiar/
      // duplicar 3 nós de uma vez); num nó fora dela, só sobre ele.
      const selIds = nodes.filter((n) => n.selected).map((n) => n.id)
      const targetIds = selIds.includes(id) ? selIds : [id]
      const suffix = targetIds.length > 1 ? ` (${targetIds.length} nós)` : ''
      return [
        { label: `Copiar${suffix}`, onClick: () => useCanvasStore.getState().copyNodes(targetIds) },
        { label: `Duplicar${suffix}`, onClick: () => useCanvasStore.getState().duplicateNodes(targetIds) },
        { label: 'Remover todas as conexões', onClick: () => removeEdgesForNode(id), disabled: !hasEdges },
        { label: 'Excluir', onClick: () => removeNode(id), danger: true }
      ]
    }
    const pos = { x: ctxMenu.flowX, y: ctxMenu.flowY }
    return [
      { label: 'Novo terminal aqui', onClick: () => addTerminalNode(pos) },
      { label: 'Nova nota aqui', onClick: () => addNoteNode(pos) },
      { label: 'Novo portal aqui', onClick: () => addPortalNode(pos) },
      { label: 'Árvore de arquivos aqui', onClick: () => addFileTreeNode(pos) },
      // Cola o conteúdo copiado (deste projeto OU de outro — o clipboard sobrevive à troca)
      // ancorado no ponto do cursor.
      { label: 'Colar aqui', onClick: () => useCanvasStore.getState().pasteClipboard(pos), disabled: !hasWidgetClipboard() }
    ]
  }

  // Atalho global do command palette (Fase 12): Cmd+K no mac, Ctrl+K em win/linux. Compara
  // e.key em minúsculo para não perder o atalho quando o sistema reporta 'K' (ex.: Shift
  // pressionado junto ou layouts que capitalizam com Cmd/Ctrl ativo).
  // Fase 18 Task 1: o mesmo handler ganhou os atalhos de foco/zoom/minimap. Usa e.code (não
  // e.key) para os dígitos porque Shift+1/Shift+2 produz caracteres diferentes por layout de
  // teclado (ex.: "!"/"@" em US e ABNT2) — e.code é a tecla física, estável entre layouts.
  // Fase 18 Task 3: Cmd/Ctrl+G (agrupar) e Cmd/Ctrl+Shift+G (desagrupar) entraram no mesmo
  // padrão do Cmd+K — comandos, não texto, então rodam ANTES do isTypingTarget guard (ver
  // comentário na própria função, acima). Fase 20 Task 2: Shift+A (focar próximo agente com
  // atenção pendente) entrou no grupo Shift+1/2/M — sensível a texto, roda DEPOIS do guard.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Cmd/Ctrl+K (palette toggle) is a command chord, not text — always works, even while typing.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      // Cmd/Ctrl+G (agrupar) / Cmd/Ctrl+Shift+G (desagrupar) — Fase 18 Task 3: mesmo raciocínio
      // do Cmd+K acima (comando, não texto) — roda ANTES do isTypingTarget guard, então
      // funciona mesmo com um input/terminal focado (ex.: logo após renomear um terminal).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (e.shiftKey) {
          useCanvasStore.getState().ungroupSelected()
        } else {
          useCanvasStore.getState().groupSelected()
        }
        return
      }
      // Guard remaining shortcuts (Shift+1/2/M) to prevent them firing while typing.
      if (isTypingTarget(e)) return

      // Undo (Onda 4): Cmd/Ctrl+Z desfaz a última ação estrutural do canvas. Roda DEPOIS do guard
      // acima — com um input/terminal focado, o Cmd+Z pertence a ele. A captura das remoções por
      // tecla mora no próprio store (onNodesChange/onEdgesChange). Shift+Cmd+Z (redo) fica fora da v1.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        useCanvasStore.getState().undo()
        return
      }

      // Copiar/colar/duplicar widgets (auditoria 2026-07-14). DEPOIS do isTypingTarget guard: com
      // input/nota/terminal focado, Cmd+C/V pertencem ao texto, não ao canvas. O clipboard interno
      // sobrevive à troca de projeto — copiar aqui e colar em outro projeto funciona.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        // Texto selecionado no DOM (ex.: rótulo de um nó): deixa o copy nativo agir.
        const domSel = window.getSelection()
        if (domSel && !domSel.isCollapsed) return
        const ids = useCanvasStore.getState().nodes.filter((n) => n.selected).map((n) => n.id)
        if (ids.length && useCanvasStore.getState().copyNodes(ids) > 0) e.preventDefault()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        if (useCanvasStore.getState().pasteClipboard() > 0) e.preventDefault()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault() // sempre: o default do Chromium (bookmark) nunca faz sentido aqui
        const ids = useCanvasStore.getState().nodes.filter((n) => n.selected).map((n) => n.id)
        if (ids.length) useCanvasStore.getState().duplicateNodes(ids)
        return
      }

      if (e.shiftKey && e.code === 'Digit1') {
        e.preventDefault()
        fitView({ duration: 300 })
        return
      }
      if (e.shiftKey && e.code === 'Digit2') {
        e.preventDefault()
        const sel = useCanvasStore.getState().nodes.filter((n) => n.selected)
        if (sel.length) fitView({ nodes: sel.map((n) => ({ id: n.id })), duration: 300 })
        return
      }
      if (e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        setMinimapOn((o) => !o)
        return
      }
      // Shift+A (Fase 20 Task 2): foca o próximo nó em `attention` (agentes ociosos aguardando o
      // usuário) — cicla pelos ids presentes no Set a cada pressionar repetido, via
      // attentionCycleRef. Não faz nada (no-op) se `attention` estiver vazio. Só ENQUADRA
      // (fitView) e SELECIONA o nó (via onNodesChange, mesmo mecanismo do React Flow usado em
      // todo o resto do arquivo) — não limpa a atenção: limpar é obra do foco de fato no
      // terminal (TerminalFlowNode.onFocusCapture), não deste atalho de navegação.
      if (e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        const ids = Array.from(useCanvasStore.getState().attention)
        if (ids.length === 0) return
        const idx = attentionCycleRef.current % ids.length
        attentionCycleRef.current = idx + 1
        const targetId = ids[idx]
        fitView({ nodes: [{ id: targetId }], duration: 300 })
        const changes: NodeChange[] = []
        for (const n of useCanvasStore.getState().nodes) {
          if (n.id === targetId) {
            if (!n.selected) changes.push({ id: n.id, type: 'select', selected: true })
          } else if (n.selected) {
            changes.push({ id: n.id, type: 'select', selected: false })
          }
        }
        if (changes.length) onNodesChange(changes)
        return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fitView, onNodesChange])

  return (
    // width/height:100% (não 100vw/100vh, Fase 15 Task 3): este <div> agora preenche o wrapper
    // flex:1 do App.tsx, ao lado da ProjectsSidebar — 100vw/100vh tomaria a viewport inteira e
    // cobriria a sidebar.
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Topbar
        cwd={activeCwd}
        collapsed={sidebarCollapsed}
        pendingTool={pendingTool}
        onToggleSidebar={toggleSidebar}
        onNewProject={emitNewProject}
        onSelectMode={() => setPendingTool(null)}
        onNewTerminal={() => setNewTermOpen(true)}
        onNote={() => setPendingTool('note')}
        onFile={async () => {
          const path = await window.orkestra.projects.pickFile()
          if (path) addFileNode(undefined, { path })
        }}
        onFiles={() => setPendingTool('filetree')}
        onPortal={() => setPendingTool('portal')}
        onDraw={() => setPendingTool('draw')}
        onOpenIde={() => {
          // R1: abre a pasta do projeto no editor externo (o main tenta VS Code/Cursor/… e cai no
          // gerenciador de arquivos se nenhum estiver instalado). No-op sem pasta vinculada.
          if (activeCwd) void window.orkestra.ide.open(activeCwd)
        }}
      />
      {newTermOpen && <NewTerminalModal onClose={() => setNewTermOpen(false)} />}
      {pendingTool && <CreateOverlay onCreate={handleCreateNode} onCancel={() => setPendingTool(null)} />}
      {/* Wordmark removido daqui (Fase 15 Task 3): a marca agora vive no topo da ProjectsSidebar
          (App.tsx) — isso também resolve a antiga sobreposição wordmark/Controls do React Flow. */}
      {selectedNodes.length === 1 && <NodeToolbar node={selectedNodes[0]} />}
      {selectedNodes.length >= 2 && (
        <div className="ork-toolbar ork-arrange-toolbar" role="toolbar" aria-label="Alinhar e organizar seleção">
          <button
            className="ork-toolbar-btn"
            title="Alinhar à esquerda"
            aria-label="Alinhar à esquerda"
            onClick={() => runAlign('left')}
          >
            Esq
          </button>
          <button
            className="ork-toolbar-btn"
            title="Alinhar centro horizontal"
            aria-label="Alinhar centro horizontal"
            onClick={() => runAlign('hcenter')}
          >
            Centro H
          </button>
          <button
            className="ork-toolbar-btn"
            title="Alinhar à direita"
            aria-label="Alinhar à direita"
            onClick={() => runAlign('right')}
          >
            Dir
          </button>
          <button
            className="ork-toolbar-btn"
            title="Alinhar ao topo"
            aria-label="Alinhar ao topo"
            onClick={() => runAlign('top')}
          >
            Topo
          </button>
          <button
            className="ork-toolbar-btn"
            title="Alinhar centro vertical"
            aria-label="Alinhar centro vertical"
            onClick={() => runAlign('vcenter')}
          >
            Centro V
          </button>
          <button
            className="ork-toolbar-btn"
            title="Alinhar à base"
            aria-label="Alinhar à base"
            onClick={() => runAlign('bottom')}
          >
            Base
          </button>
          <span className="ork-toolbar-divider" />
          <button
            className="ork-toolbar-btn"
            title="Distribuir horizontalmente"
            aria-label="Distribuir horizontalmente"
            onClick={() => runDistribute('horizontal')}
          >
            Dist H
          </button>
          <button
            className="ork-toolbar-btn"
            title="Distribuir verticalmente"
            aria-label="Distribuir verticalmente"
            onClick={() => runDistribute('vertical')}
          >
            Dist V
          </button>
          <span className="ork-toolbar-divider" />
          <button className="ork-toolbar-btn" title="Organizar em grade" aria-label="Organizar em grade" onClick={runGrid}>
            Grade
          </button>
        </div>
      )}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      <ReactFlow
        nodes={nodes}
        onNodesChange={onNodesChange}
        edges={edges}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.2}
        maxZoom={2}
        snapToGrid
        snapGrid={[20, 20]}
        // R4: botão direito no vazio abre o menu de "criar aqui" (posição convertida pro canvas);
        // no nó, o menu de ações do nó. onMoveStart fecha o menu ao começar um pan/zoom.
        onPaneContextMenu={(e) => {
          e.preventDefault()
          const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
          setCtxMenu({ x: e.clientX, y: e.clientY, flowX: p.x, flowY: p.y, nodeId: null })
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault()
          setCtxMenu({ x: e.clientX, y: e.clientY, flowX: 0, flowY: 0, nodeId: node.id })
        }}
        onMoveStart={() => setCtxMenu(null)}
        deleteKeyCode={['Backspace', 'Delete']}
        // Fase 18 Task 3 fix (perda de dados): o React Flow trata grupo+filhos como árvore
        // parent/child e cascateia a remoção — um Backspace/Delete num grupo selecionado
        // apagaria o grupo E todo o conteúdo dentro dele (terminais/notas/portais) numa tacada
        // só, sem confirmação nem undo. onBeforeDelete roda ANTES do React Flow aplicar a
        // remoção: se algum dos nós a deletar é um group, ungroupa primeiro (filhos voltam a
        // ser top-level, mantidos vivos no store) e deixa passar pra remoção só os containers
        // (agora vazios) + qualquer nó selecionado que não seja filho de um dos grupos deletados.
        // Deletar um nó comum (terminal/nota/portal, sem group na seleção) cai no `return true`
        // — comportamento padrão do React Flow, sem tocar o store. Cmd/Ctrl+Shift+G continua
        // sendo o caminho explícito de desagrupar (handleKeyDown acima), inalterado.
        onBeforeDelete={async ({ nodes: toDelete, edges: edgesToDelete }) => {
          const groupIds = toDelete.filter((n) => n.type === 'group').map((n) => n.id)
          if (groupIds.length === 0) return true
          ungroupGroupsById(groupIds) // filhos sobrevivem, reparentados pro canvas
          const finalNodes = toDelete.filter(
            (n) => n.type === 'group' || !(n.parentId && groupIds.includes(n.parentId))
          )
          const finalIds = new Set(finalNodes.map((n) => n.id))
          return {
            nodes: finalNodes,
            edges: edgesToDelete.filter((e) => finalIds.has(e.source) || finalIds.has(e.target))
          }
        }}
        proOptions={{ hideAttribution: true }}
      >
        {/* Grid de pontos finos (reformulação Lote B, §2.3/§4): gap=22 é o token
            --space-canvas-grid (mockup orkestra-canvas.html usa background-size:22px 22px) —
            puramente visual, independente do snapGrid=[20,20] acima (o snap dos nós ao mover/
            criar não precisa coincidir com o espaçamento dos pontos). size pequeno deixa os
            pontos discretos. */}
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
        <Controls />
        {/* MiniMap ancora bottom-right por padrão (Controls fica bottom-left) — sem colisão.
            nodeColor usa --text-3 (cinza neutro de "chrome", já usado em scrollbars.css) em
            vez de --accent, que já é reservado p/ estados interativos/seleção (handles, edge
            selecionada, caixa de seleção) — reaproveitar --accent aqui competiria com esses
            usos. maskColor (área fora do viewport) é derivado do --bg-0 em runtime (minimapMask,
            ver readBgMask/effect acima) p/ acompanhar o tema claro/escuro — antes era um rgba
            escuro fixo que só lia bem no dark. */}
        {minimapOn && (
          <MiniMap
            pannable
            zoomable
            className="ork-minimap"
            maskColor={minimapMask}
            nodeColor="var(--text-3)"
          />
        )}
      </ReactFlow>
      {ctxMenu && (
        <CanvasContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenuItems()} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  )
}
