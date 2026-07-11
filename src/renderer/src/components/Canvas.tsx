import { useEffect, useState } from 'react'
import { ReactFlow, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './Canvas.css'
import { useCanvasStore } from '../store/canvasStore'
import { TerminalFlowNode } from './TerminalFlowNode'
import { NoteNode } from './NoteNode'
import { PortalFlowNode } from './PortalFlowNode'
import { CommandPalette } from './CommandPalette'
import { Logo } from './Logo'
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
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
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
      {/* Wordmark: decorative brand lockup, bottom-left. `pointer-events: none` (see Canvas.css)
          keeps it clear of canvas panning/clicks; `aria-hidden` keeps it out of screen readers. */}
      <div className="ork-wordmark" aria-hidden="true">
        <Logo size={18} />
        <span className="ork-wordmark-text">Orkestra</span>
      </div>
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
