import { ReactFlow, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCanvasStore } from '../store/canvasStore'
import { TerminalFlowNode } from './TerminalFlowNode'
import { NoteNode } from './NoteNode'
import { useCanvasPersistence } from '../hooks/useCanvasPersistence'

const nodeTypes = { terminal: TerminalFlowNode, note: NoteNode }

export function Canvas(): JSX.Element {
  useCanvasPersistence()
  const nodes = useCanvasStore((s) => s.nodes)
  const onNodesChange = useCanvasStore((s) => s.onNodesChange)
  const edges = useCanvasStore((s) => s.edges)
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange)
  const onConnect = useCanvasStore((s) => s.onConnect)
  const addTerminalNode = useCanvasStore((s) => s.addTerminalNode)
  const addNoteNode = useCanvasStore((s) => s.addNoteNode)

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <button
        onClick={() => addTerminalNode()}
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          padding: '6px 12px',
          background: '#1633f9',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: 13,
          cursor: 'pointer'
        }}
      >
        + Terminal
      </button>
      <button
        onClick={() => addNoteNode()}
        style={{ position: 'absolute', top: 12, left: 110, zIndex: 10, padding: '6px 12px', background: '#eab308', color: '#3b3610', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
      >
        + Nota
      </button>
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
