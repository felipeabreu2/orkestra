import { useEffect, useState } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './Canvas.css'
import { useCanvasStore } from '../store/canvasStore'
import { TerminalFlowNode } from './TerminalFlowNode'
import { NoteNode } from './NoteNode'
import { PortalFlowNode } from './PortalFlowNode'
import { GroupNode } from './GroupNode'
import { CommandPalette } from './CommandPalette'
import { useCanvasPersistence } from '../hooks/useCanvasPersistence'
import { useOrchestrationSync } from '../hooks/useOrchestrationSync'
import { PRESETS } from '../../../shared/presets'
import { alignNodes, distributeNodes, gridArrange, type AlignAxis, type DistributeAxis, type PosNode } from '../layout/arrange'

const nodeTypes = { terminal: TerminalFlowNode, note: NoteNode, portal: PortalFlowNode, group: GroupNode }

// isTypingTarget guarda os atalhos que SÃO sensíveis a texto (foco/zoom/minimap da Fase 18:
// Shift+1/2/M) — Cmd/Ctrl+K (Fase 12) e Cmd/Ctrl+G / Cmd/Ctrl+Shift+G (Fase 18 Task 3) são
// comandos, não texto, e rodam ANTES deste guard (ver handleKeyDown abaixo), então não passam
// por aqui. Esta função cobre: nem num input/textarea/select/contentEditable (nome de
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
  const setNodePositions = useCanvasStore((s) => s.setNodePositions)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [minimapOn, setMinimapOn] = useState(true)
  const { fitView } = useReactFlow()

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

  // Atalho global do command palette (Fase 12): Cmd+K no mac, Ctrl+K em win/linux. Compara
  // e.key em minúsculo para não perder o atalho quando o sistema reporta 'K' (ex.: Shift
  // pressionado junto ou layouts que capitalizam com Cmd/Ctrl ativo).
  // Fase 18 Task 1: o mesmo handler ganhou os atalhos de foco/zoom/minimap. Usa e.code (não
  // e.key) para os dígitos porque Shift+1/Shift+2 produz caracteres diferentes por layout de
  // teclado (ex.: "!"/"@" em US e ABNT2) — e.code é a tecla física, estável entre layouts.
  // Fase 18 Task 3: Cmd/Ctrl+G (agrupar) e Cmd/Ctrl+Shift+G (desagrupar) entraram no mesmo
  // padrão do Cmd+K — comandos, não texto, então rodam ANTES do isTypingTarget guard (ver
  // comentário na própria função, acima). Só Shift+1/2/M passam pelo guard.
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
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fitView])

  return (
    // width/height:100% (não 100vw/100vh, Fase 15 Task 3): este <div> agora preenche o wrapper
    // flex:1 do App.tsx, ao lado da ProjectsSidebar — 100vw/100vh tomaria a viewport inteira e
    // cobriria a sidebar.
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div className="ork-toolbar">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className="ork-toolbar-btn"
            onClick={() => addTerminalNode(undefined, { preset: p.id })}
          >
            + {p.label}
          </button>
        ))}
        <span className="ork-toolbar-divider" />
        <button className="ork-toolbar-btn" onClick={() => addNoteNode()}>
          + Nota
        </button>
        <button className="ork-toolbar-btn" onClick={() => addPortalNode()}>
          + Portal
        </button>
      </div>
      {/* Wordmark removido daqui (Fase 15 Task 3): a marca agora vive no topo da ProjectsSidebar
          (App.tsx) — isso também resolve a antiga sobreposição wordmark/Controls do React Flow. */}
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
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        minZoom={0.2}
        maxZoom={2}
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
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
    </div>
  )
}
