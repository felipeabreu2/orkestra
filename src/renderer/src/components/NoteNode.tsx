import { useState } from 'react'
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { MarkdownView } from './MarkdownView'
import './nodes.css'

export function NoteNode({ id, selected, data }: NodeProps): JSX.Element {
  const updateNoteContent = useCanvasStore((s) => s.updateNoteContent)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const content = (data?.content as string) ?? ''
  const [mode, setMode] = useState<'edit' | 'preview'>(content.trim() ? 'preview' : 'edit')
  return (
    <>
      <NodeResizer minWidth={160} minHeight={100} isVisible={selected ?? false} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="ork-node">
        <div className="ork-node-header">
          <span className="ork-node-dot ork-node-dot--note" aria-hidden="true" />
          <span className="ork-node-title">Nota</span>
          <button
            className="nodrag ork-node-toggle"
            onClick={() => setMode((m) => (m === 'edit' ? 'preview' : 'edit'))}
            aria-label={mode === 'edit' ? 'Ver formatado' : 'Editar'}
            title={mode === 'edit' ? 'Ver formatado' : 'Editar'}
          >
            {mode === 'edit' ? 'Ver' : 'Editar'}
          </button>
          <button
            className="nodrag ork-node-iconbtn"
            onClick={() => removeNode(id)}
            aria-label="Fechar nota"
            title="Remover nó"
          >
            ×
          </button>
        </div>
        {mode === 'edit' ? (
          <textarea
            className="nodrag nowheel ork-note-textarea"
            value={content}
            onChange={(e) => updateNoteContent(id, e.target.value)}
            placeholder="Escreva… (Markdown)"
            autoFocus
          />
        ) : (
          <div
            className="nodrag nowheel ork-note-preview"
            onDoubleClick={() => setMode('edit')}
            title="Duplo-clique para editar"
          >
            {content.trim() ? (
              <MarkdownView text={content} />
            ) : (
              <span className="ork-note-empty">Nota vazia — duplo-clique para editar.</span>
            )}
          </div>
        )}
      </div>
    </>
  )
}
