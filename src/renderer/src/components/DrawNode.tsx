import { useRef } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { NodeHandles } from './NodeHandles'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useCanvasStore } from '../store/canvasStore'
import './nodes.css'

// Tipos do componente Excalidraw derivados dele mesmo (evita depender de subpaths de tipo internos).
type ExcalProps = Parameters<typeof Excalidraw>[0]

// Nó de desenho (Onda 7): Excalidraw embutido. A cena (elements + appState mínimo) é persistida em
// data.scene com debounce. `nodrag nowheel` no wrapper para o React Flow não roubar os gestos.
export function DrawNode({ id, selected, data }: NodeProps): JSX.Element {
  const updateDrawScene = useCanvasStore((s) => s.updateDrawScene)
  const scene = (data as { scene?: unknown }).scene
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <>
      <NodeResizer minWidth={220} minHeight={160} isVisible={selected ?? false} />
      <NodeHandles />
      <div className="ork-node ork-draw">
        <div className="nodrag nowheel ork-draw-canvas">
          <Excalidraw
            initialData={(scene ?? undefined) as ExcalProps['initialData']}
            onChange={(elements, appState) => {
              if (timer.current) clearTimeout(timer.current)
              // Guarda só o essencial (elements + cor de fundo) — o appState completo tem estado
              // volátil de UI que não precisa persistir. Debounced para não gravar a cada traço.
              const snap = { elements, appState: { viewBackgroundColor: appState.viewBackgroundColor } }
              timer.current = setTimeout(() => updateDrawScene(id, snap), 500)
            }}
          />
        </div>
      </div>
    </>
  )
}
