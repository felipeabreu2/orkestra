import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import './nodes.css'

export function NoteNode({ id, selected, data }: NodeProps): JSX.Element {
  const updateNoteContent = useCanvasStore((s) => s.updateNoteContent)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const content = (data?.content as string) ?? ''
  return (
    <>
      <NodeResizer minWidth={160} minHeight={100} isVisible={selected ?? false} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="ork-node">
        <div className="ork-node-header">
          <span className="ork-node-dot ork-node-dot--note" aria-hidden="true" />
          <span className="ork-node-title">Nota</span>
          <button className="nodrag ork-node-iconbtn" onClick={() => removeNode(id)} aria-label="Fechar nota">
            ×
          </button>
        </div>
        <textarea
          className="nodrag nowheel ork-note-textarea"
          value={content}
          onChange={(e) => updateNoteContent(id, e.target.value)}
          placeholder="Escreva…"
        />
      </div>
    </>
  )
}
