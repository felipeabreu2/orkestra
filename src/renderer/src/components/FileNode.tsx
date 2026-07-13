import { useEffect, useState } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { NodeHandles } from './NodeHandles'
import { useCanvasStore } from '../store/canvasStore'
import { Icon } from './Icon'
import './nodes.css'

// Nó de arquivo (clip, Onda 7): anexa 1 arquivo ao canvas — mostra nome/caminho e um preview
// textual (via filetree.read, truncado). Ligável a um terminal (vira contexto na Onda 8).
export function FileNode({ id, selected, data }: NodeProps): JSX.Element {
  const removeNode = useCanvasStore((s) => s.removeNode)
  const d = data as { name?: string; path?: string }
  const [preview, setPreview] = useState<string>('')

  useEffect(() => {
    let alive = true
    if (!d.path) return
    window.orkestra.filetree
      .read(d.path)
      .then((r) => {
        if (alive) setPreview(r.binary ? '[arquivo binário]' : r.content.slice(0, 2000))
      })
      .catch(() => {
        if (alive) setPreview('[não foi possível ler o arquivo]')
      })
    return () => {
      alive = false
    }
  }, [d.path])

  return (
    <>
      <NodeResizer minWidth={160} minHeight={100} isVisible={selected ?? false} />
      <NodeHandles />
      <div className="ork-node">
        <div className="ork-node-header">
          <span className="ork-node-dot ork-node-dot--file" aria-hidden="true" />
          <span className="ork-node-title" title={d.path}>
            {d.name ?? 'Arquivo'}
          </span>
          <button
            className="nodrag ork-node-iconbtn"
            onClick={() => removeNode(id)}
            aria-label="Fechar arquivo"
            title="Remover nó"
          >
            <Icon name="X" size={14} animation="pop" />
          </button>
        </div>
        <pre className="nodrag nowheel ork-file-preview">{preview}</pre>
      </div>
    </>
  )
}
