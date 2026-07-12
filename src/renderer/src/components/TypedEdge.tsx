import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { EDGE_KIND_META, type EdgeKind } from '../edges/edgeKind'
import './nodes.css'

export function TypedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd
}: EdgeProps): JSX.Element {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition
  })
  const kind = (data?.kind as EdgeKind) ?? 'link'
  const meta = EDGE_KIND_META[kind]
  const [open, setOpen] = useState(false)
  const removeEdge = useCanvasStore((s) => s.removeEdge)
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className={`nodrag nopan ork-edge-badge ork-edge-badge--${kind}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={() => setOpen((o) => !o)}
          title={meta.title}
          role="button"
          aria-label={`Conexão: ${meta.label}`}
        >
          <span>{meta.label}</span>
          {open && (
            <div className="ork-edge-pop">
              <button
                className="ork-edge-pop-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  removeEdge(id)
                }}
              >
                Desconectar
              </button>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
