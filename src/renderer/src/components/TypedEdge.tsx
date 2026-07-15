import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { EDGE_KIND_META, type EdgeKind } from '../edges/edgeKind'
import { ropePath } from '../edges/ropePath'
import { useRopeSwing } from '../edges/useRopeSwing'
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
  // R5: 'circuito' desenha trilhos ortogonais (getSmoothStepPath, cantos de 90° arredondados);
  // 'curva' mantém o bezier de sempre. Ambas retornam [path, labelX, labelY] na mesma ordem.
  const edgeStyle = useCanvasStore((s) => s.edgeStyle)
  // Balanço da corda: injeta energia quando os extremos se movem e decai a zero (só custa algo
  // durante/após um arraste; em repouso retorna 0). Chamado sempre (regra dos hooks), inócuo
  // quando o estilo não é corda.
  const swingX = useRopeSwing(sourceX, sourceY, targetX, targetY)
  const geom = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }
  const [edgePath, labelX, labelY] =
    edgeStyle === 'corda'
      ? ropePath(sourceX, sourceY, targetX, targetY, swingX)
      : edgeStyle === 'circuito'
        ? getSmoothStepPath({ ...geom, borderRadius: 8 })
        : getBezierPath(geom)
  const kind = (data?.kind as EdgeKind) ?? 'link'
  const meta = EDGE_KIND_META[kind]
  const [open, setOpen] = useState(false)
  const removeEdge = useCanvasStore((s) => s.removeEdge)
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} className={edgeStyle === 'corda' ? 'ork-rope' : undefined} />
      {/* Ponto viajante (DesignCode UI §6): só na conexão AGENTE — reusa o MESMO path (via
          <mpath href="#<edge-id>">, o id que BaseEdge acabou de gravar no <path> acima) em vez de
          recalcular geometria própria, então acompanha qualquer edgeStyle (curva/circuito/corda)
          sem lógica extra aqui. SMIL <animateMotion>, não CSS — @xyflow/react já entrega este
          componente dentro de um <svg><g> por edge (EdgeWrapper), então um <circle> é um filho SVG
          válido igual ao <path> do BaseEdge. */}
      {kind === 'agent' && (
        <circle r={4.5} className="ork-edge-dot">
          <animateMotion dur="2.2s" repeatCount="indefinite" rotate="auto">
            <mpath href={`#${id}`} />
          </animateMotion>
        </circle>
      )}
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
