import { useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type NodeChange,
  type Connection
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './Canvas.css'
import { useCanvasStore } from '../store/canvasStore'
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
import { buildContextBlock, htmlToText } from '../context/contextBlock'
import { getTerminalPty } from '../terminal/terminalRegistry'
import { CanvasContextMenu, type ContextMenuItem } from './CanvasContextMenu'
import { useCanvasPersistence } from '../hooks/useCanvasPersistence'
import { useOrchestrationSync } from '../hooks/useOrchestrationSync'
import { alignNodes, distributeNodes, gridArrange, type AlignAxis, type DistributeAxis, type PosNode } from '../layout/arrange'

const nodeTypes = {
  terminal: TerminalFlowNode,
  note: NoteNode,
  portal: PortalFlowNode,
  filetree: FileTreeNode,
  file: FileNode,
  draw: DrawNode,
  group: GroupNode
}

// Fase 22 (Task 2): registro de edge customizada, mesmo padrão do nodeTypes acima — constante
// de módulo (não recriada a cada render) para o React Flow não thrashear/avisar sobre uma nova
// referência de objeto em toda renderização. onConnect/hydrate (Task 1, canvasStore) já marcam
// toda edge com type:'typed', então este é o único entry necessário no registro.
const edgeTypes = {
  typed: TypedEdge
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
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [newTermOpen, setNewTermOpen] = useState(false)
  // "Arrastar para criar" (Figma-like): ferramenta pendente escolhida na barra (nota/site/arquivos).
  // Enquanto != null, o CreateOverlay captura o gesto e cria o item com a posição/tamanho arrastados.
  const [pendingTool, setPendingTool] = useState<'note' | 'portal' | 'filetree' | 'draw' | null>(null)
  const [minimapOn, setMinimapOn] = useState(true)
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
      if (node && (node.data as { monitor?: boolean }).monitor === false) return
      setAttention(nodeId, true)
    })
    return off
  }, [setAttention])

  // Barra de alinhar/distribuir/organizar em grade (Fase 18 Task 2): só aparece com 2+ nós
  // selecionados (node.selected, setado pelo próprio React Flow no clique/box-select). Cada
  // botão converte a seleção pro PosNode puro (id/position/width/height) que arrange.ts espera,
  // roda a função pura correspondente e aplica o resultado via setNodePositions — nenhuma
  // lógica de geometria vive aqui, só a ponte store<->arrange.
  const selectedNodes = nodes.filter((n) => n.selected)
  const toPosNodes = (): PosNode[] =>
    selectedNodes.map((n) => ({ id: n.id, position: n.position, width: n.width, height: n.height }))
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

  // Onda 8 (F03): ao ligar nota/arquivo/site → terminal, injeta o conteúdo do nó-fonte no prompt do
  // agente (sem Enter). Só quando o terminal é o ALVO (recebe contexto). Roda uma vez por ligação
  // (onConnect); a hidratação não passa por aqui, então não repete ao recarregar.
  const injectContext = async (connection: Connection): Promise<void> => {
    const nodes = useCanvasStore.getState().nodes
    const a = nodes.find((n) => n.id === connection.source)
    const b = nodes.find((n) => n.id === connection.target)
    if (!a || !b) return
    // Identifica o terminal e o recurso (nota/site/arquivo) em QUALQUER ponta — tudo ligado ao
    // terminal vira contexto de leitura, independente da direção.
    const terminal = a.type === 'terminal' ? a : b.type === 'terminal' ? b : null
    if (!terminal) return
    const resource = terminal === a ? b : a
    const ptyId = getTerminalPty(terminal.id)
    if (!ptyId) return
    // A nota está na SAÍDA do terminal quando o terminal é a FONTE da conexão — nesse caso ela é
    // editável pelo agente.
    const noteOnOutput = terminal.id === connection.source && resource.type === 'note'
    let block = ''
    if (resource.type === 'note') {
      block = buildContextBlock('nota', htmlToText((resource.data as { html?: string }).html ?? ''))
    } else if (resource.type === 'portal') {
      const d = resource.data as { name?: string; url?: string }
      block = buildContextBlock(d.name ?? 'site', d.url ? `URL: ${d.url}` : '')
    } else if (resource.type === 'file') {
      const d = resource.data as { name?: string; path?: string }
      if (d.path) {
        try {
          const r = await window.orkestra.filetree.read(d.path)
          const content = r.binary ? '[arquivo binário]' : r.content.slice(0, 4000)
          block = buildContextBlock(d.name ?? 'arquivo', `${d.path}\n${content}`)
        } catch {
          block = buildContextBlock(d.name ?? 'arquivo', d.path)
        }
      }
    } else {
      return
    }
    // Nota na saída = editável: instrui o LLM a escrever nela via orq.
    if (noteOnOutput) {
      block += 'Para atualizar esta nota, rode no terminal: orq note write "<texto em markdown>"\n'
    }
    if (block) window.orkestra.pty.write(ptyId, block)
  }

  const handleConnect = (connection: Connection): void => {
    onConnect(connection)
    void injectContext(connection)
  }

  // R4: itens do menu de contexto. Com nodeId => ações do nó (remover conexões / excluir); sem
  // nodeId => criar um nó no ponto do cursor (flowX/flowY já convertidos para o canvas).
  const ctxMenuItems = (): ContextMenuItem[] => {
    if (!ctxMenu) return []
    if (ctxMenu.nodeId) {
      const id = ctxMenu.nodeId
      const hasEdges = edges.some((e) => e.source === id || e.target === id)
      return [
        { label: 'Remover todas as conexões', onClick: () => removeEdgesForNode(id), disabled: !hasEdges },
        { label: 'Excluir', onClick: () => removeNode(id), danger: true }
      ]
    }
    const pos = { x: ctxMenu.flowX, y: ctxMenu.flowY }
    return [
      { label: 'Novo terminal aqui', onClick: () => addTerminalNode(pos) },
      { label: 'Nova nota aqui', onClick: () => addNoteNode(pos) },
      { label: 'Novo portal aqui', onClick: () => addPortalNode(pos) },
      { label: 'Árvore de arquivos aqui', onClick: () => addFileTreeNode(pos) }
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
        {/* Grid de pontos finos (F02/ajuste): gap 20 = snapGrid, então os nós alinham aos pontos
            ao criar/mover; size pequeno deixa os pontos discretos. */}
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        {/* MiniMap ancora bottom-right por padrão (Controls fica bottom-left) — sem colisão.
            nodeColor usa --text-3 (cinza neutro de "chrome", já usado em scrollbars.css) em
            vez de --accent, que já é reservado p/ estados interativos/seleção (handles, edge
            selecionada, caixa de seleção) — reaproveitar --accent aqui competiria com esses
            usos. maskColor é --bg-0 traduzido p/ rgba (a mesma cor do fundo do canvas, só
            translúcida) p/ a área fora do viewport ler bem no dark. */}
        {minimapOn && (
          <MiniMap
            pannable
            zoomable
            className="ork-minimap"
            maskColor="rgba(11, 13, 18, 0.6)"
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
