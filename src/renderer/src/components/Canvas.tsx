import { useEffect, useState } from 'react'
import { ReactFlow, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './Canvas.css'
import { useCanvasStore } from '../store/canvasStore'
import { TerminalFlowNode } from './TerminalFlowNode'
import { NoteNode } from './NoteNode'
import { PortalFlowNode } from './PortalFlowNode'
import { CommandPalette } from './CommandPalette'
import { useCanvasPersistence } from '../hooks/useCanvasPersistence'
import { useOrchestrationSync } from '../hooks/useOrchestrationSync'
import { PRESETS } from '../../../shared/presets'

const nodeTypes = { terminal: TerminalFlowNode, note: NoteNode, portal: PortalFlowNode }

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
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Atalho global do command palette (Fase 12): Cmd+K no mac, Ctrl+K em win/linux. Compara
  // e.key em minúsculo para não perder o atalho quando o sistema reporta 'K' (ex.: Shift
  // pressionado junto ou layouts que capitalizam com Cmd/Ctrl ativo).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
