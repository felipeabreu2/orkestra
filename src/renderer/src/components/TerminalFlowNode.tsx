import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import { TerminalNode } from './TerminalNode'
import { useCanvasStore } from '../store/canvasStore'

export function TerminalFlowNode({ id, selected, data }: NodeProps): JSX.Element {
  const removeNode = useCanvasStore((s) => s.removeNode)
  const updateTerminalName = useCanvasStore((s) => s.updateTerminalName)
  const updateTerminalRole = useCanvasStore((s) => s.updateTerminalRole)
  const name = (data as { name?: string })?.name ?? 'Terminal'
  const role = (data as { role?: string })?.role ?? ''
  const preset = (data as { preset?: string })?.preset
  return (
    <>
      <NodeResizer minWidth={240} minHeight={140} isVisible={selected ?? false} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
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
          <input
            className="nodrag"
            value={name}
            onChange={(e) => updateTerminalName(id, e.target.value)}
            aria-label="Nome do terminal"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#cccccc',
              fontSize: 12,
              padding: 0,
              outline: 'none',
              flex: 1,
              minWidth: 0
            }}
          />
          <input
            className="nodrag"
            value={role}
            onChange={(e) => updateTerminalRole(id, e.target.value)}
            aria-label="Papel do terminal"
            placeholder="papel"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8a8a8a',
              fontSize: 12,
              padding: 0,
              outline: 'none',
              flex: 1,
              minWidth: 0,
              textAlign: 'right'
            }}
          />
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
          <TerminalNode nodeId={id} preset={preset} />
        </div>
      </div>
    </>
  )
}
