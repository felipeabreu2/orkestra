import type { CSSProperties } from 'react'
import type { NodeProps } from '@xyflow/react'
import './GroupNode.css'

// Nó "group" (Fase 18 Task 3): um contêiner puro para os nós agrupados por
// canvasStore.groupSelected() (React Flow v12 parent/child via node.parentId + extent:'parent'
// nos filhos — não é um sistema de arrastar/redimensionar próprio deste componente). Ver
// GroupNode.css para o porquê do pointer-events no corpo vs. no cabeçalho.
export function GroupNode({ data }: NodeProps): JSX.Element {
  const name = (data?.name as string) ?? 'Grupo'
  // Cor opcional do grupo (§4.13): quando presente, tinja frame/borda/header pela receita de papel
  // (GroupNode.css). Ausente (padrão hoje) → renderiza exatamente como antes, neutro. `--group-color`
  // é uma custom property lida pelo CSS (aceita `var(--paper-*)` ou qualquer cor color-mix consome).
  const color = (data?.color as string | undefined) ?? undefined
  return (
    <div
      className={`ork-group${color ? ' ork-group--colored' : ''}`}
      style={color ? ({ '--group-color': color } as CSSProperties) : undefined}
    >
      <div className="ork-group-header">{name}</div>
    </div>
  )
}
