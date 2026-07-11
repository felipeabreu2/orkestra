import type { NodeProps } from '@xyflow/react'
import './GroupNode.css'

// Nó "group" (Fase 18 Task 3): um contêiner puro para os nós agrupados por
// canvasStore.groupSelected() (React Flow v12 parent/child via node.parentId + extent:'parent'
// nos filhos — não é um sistema de arrastar/redimensionar próprio deste componente). Ver
// GroupNode.css para o porquê do pointer-events no corpo vs. no cabeçalho.
export function GroupNode({ data }: NodeProps): JSX.Element {
  const name = (data?.name as string) ?? 'Grupo'
  return (
    <div className="ork-group">
      <div className="ork-group-header">{name}</div>
    </div>
  )
}
