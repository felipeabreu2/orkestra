import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'

export function NoteNode({ id, selected, data }: NodeProps): JSX.Element {
  const updateNoteContent = useCanvasStore((s) => s.updateNoteContent)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const content = (data?.content as string) ?? ''
  return (
    <>
      <NodeResizer minWidth={160} minHeight={100} isVisible={selected ?? false} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#fef9c3',
          border: '1px solid #e6d97a',
          borderRadius: 6,
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            height: 24,
            background: '#f2e9a0',
            color: '#5b5320',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            cursor: 'grab',
            userSelect: 'none'
          }}
        >
          <span>Nota</span>
          <button
            className="nodrag"
            onClick={() => removeNode(id)}
            style={{ background: 'transparent', border: 'none', color: '#5b5320', fontSize: 15, lineHeight: 1, cursor: 'pointer', padding: '0 4px' }}
            aria-label="Fechar nota"
          >
            ×
          </button>
        </div>
        <textarea
          className="nodrag nowheel"
          value={content}
          onChange={(e) => updateNoteContent(id, e.target.value)}
          placeholder="Escreva…"
          style={{
            flex: 1,
            minHeight: 0,
            resize: 'none',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: '#3b3610',
            fontFamily: 'inherit',
            fontSize: 13,
            padding: 8
          }}
        />
      </div>
    </>
  )
}
