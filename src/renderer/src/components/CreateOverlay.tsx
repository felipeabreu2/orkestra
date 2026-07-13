import { useEffect, useRef, useState, type JSX } from 'react'
import { useReactFlow } from '@xyflow/react'

// Overlay de "arrastar para criar" (Figma-like): quando o usuário escolhe uma ferramenta na barra
// (nota/site/arquivos), este overlay cobre o canvas e captura o gesto — arrastar desenha o
// retângulo do novo item (posição + tamanho); um clique simples cria com tamanho padrão. Esc
// cancela. Converte os cantos para coordenadas do canvas (screenToFlowPosition) p/ respeitar
// zoom/pan.
const MIN_DRAG = 12 // px de tela: abaixo disso trata como clique (tamanho padrão)

type Draft = { cx0: number; cy0: number; cx1: number; cy1: number }

export function CreateOverlay({
  onCreate,
  onCancel
}: {
  onCreate: (pos: { x: number; y: number }, size: { width: number; height: number } | null) => void
  onCancel: () => void
}): JSX.Element {
  const { screenToFlowPosition } = useReactFlow()
  const ref = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const onDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    dragging.current = true
    setDraft({ cx0: e.clientX, cy0: e.clientY, cx1: e.clientX, cy1: e.clientY })
  }
  const onMove = (e: React.MouseEvent): void => {
    if (!dragging.current) return
    setDraft((d) => (d ? { ...d, cx1: e.clientX, cy1: e.clientY } : d))
  }
  const onUp = (): void => {
    if (!dragging.current || !draft) {
      dragging.current = false
      return
    }
    dragging.current = false
    const a = screenToFlowPosition({ x: draft.cx0, y: draft.cy0 })
    const b = screenToFlowPosition({ x: draft.cx1, y: draft.cy1 })
    const bigEnough = Math.abs(draft.cx1 - draft.cx0) > MIN_DRAG && Math.abs(draft.cy1 - draft.cy0) > MIN_DRAG
    const pos = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }
    const size = bigEnough ? { width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) } : null
    onCreate(pos, size)
  }

  // Preview do retângulo, em coordenadas de tela relativas ao overlay.
  let preview: JSX.Element | null = null
  if (draft && ref.current) {
    const r = ref.current.getBoundingClientRect()
    preview = (
      <div
        className="ork-create-rect"
        style={{
          left: Math.min(draft.cx0, draft.cx1) - r.left,
          top: Math.min(draft.cy0, draft.cy1) - r.top,
          width: Math.abs(draft.cx1 - draft.cx0),
          height: Math.abs(draft.cy1 - draft.cy0)
        }}
      />
    )
  }

  return (
    <div ref={ref} className="ork-create-overlay" onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}>
      {preview}
    </div>
  )
}
