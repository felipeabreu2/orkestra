import { useEffect, useState } from 'react'
import { ReactFlow, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCanvasStore } from '../store/canvasStore'
import { TerminalFlowNode } from './TerminalFlowNode'
import { NoteNode } from './NoteNode'
import { PortalFlowNode } from './PortalFlowNode'
import { FloorsPanel } from './FloorsPanel'
import { RoutinesPanel } from './RoutinesPanel'
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
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          display: 'flex',
          gap: 6
        }}
      >
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => addTerminalNode(undefined, { preset: p.id })}
            style={{
              padding: '6px 12px',
              background: '#1633f9',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            + {p.label}
          </button>
        ))}
        <button
          onClick={() => addNoteNode()}
          style={{
            padding: '6px 12px',
            background: '#eab308',
            color: '#3b3610',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          + Nota
        </button>
        <button
          onClick={() => addPortalNode()}
          style={{
            padding: '6px 12px',
            background: '#0ea5e9',
            color: '#082f49',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          + Portal
        </button>
      </div>
      <FloorsPanel />
      <RoutinesPanel />
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
