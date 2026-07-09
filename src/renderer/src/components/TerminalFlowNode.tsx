import { NodeResizer, type NodeProps } from '@xyflow/react'
import { TerminalNode } from './TerminalNode'
import { useCanvasStore } from '../store/canvasStore'

export function TerminalFlowNode({ id, selected }: NodeProps): JSX.Element {
  const removeNode = useCanvasStore((s) => s.removeNode)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        border: '1px solid #333',
        borderRadius: 6,
        overflow: 'hidden'
      }}
    >
      <NodeResizer minWidth={240} minHeight={140} isVisible={selected ?? false} />
      <div
        style={{
          height: 26,
          background: '#2d2d2d',
          color: '#cccccc',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          cursor: 'grab',
          userSelect: 'none'
        }}
      >
        <span>Terminal</span>
        <button
          className="nodrag"
          onClick={() => removeNode(id)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#cccccc',
            fontSize: 15,
            lineHeight: 1,
            cursor: 'pointer',
            padding: '0 4px'
          }}
          aria-label="Fechar terminal"
        >
          ×
        </button>
      </div>
      <div className="nodrag nowheel" style={{ flex: 1, minHeight: 0 }}>
        <TerminalNode />
      </div>
    </div>
  )
}
