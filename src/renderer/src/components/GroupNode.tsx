import { useState, type CSSProperties } from 'react'
import type { NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import './GroupNode.css'

// Nó "group" (Fase 18 Task 3): um contêiner puro para os nós agrupados por
// canvasStore.groupSelected() (React Flow v12 parent/child via node.parentId + extent:'parent'
// nos filhos — não é um sistema de arrastar/redimensionar próprio deste componente). Ver
// GroupNode.css para o porquê do pointer-events no corpo vs. no cabeçalho.
export function GroupNode({ id, data }: NodeProps): JSX.Element {
  const name = (data?.name as string) ?? 'Grupo'
  // Cor opcional do grupo (§4.13): quando presente, tinja frame/borda/header pela receita de papel
  // (GroupNode.css). Ausente (padrão hoje) → renderiza exatamente como antes, neutro. `--group-color`
  // é uma custom property lida pelo CSS (aceita `var(--paper-*)` ou qualquer cor color-mix consome).
  const color = (data?.color as string | undefined) ?? undefined

  // Canvas #12 (T2): renomear o grupo por duplo-clique no cabeçalho. Espelha o rename inline da
  // sidebar/terminal: input com autoFocus, Enter/blur confirma, Esc cancela. Vazio não sobrescreve.
  const updateGroupName = useCanvasStore((s) => s.updateGroupName)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  const commit = (): void => {
    setEditing(false)
    const next = draft.trim().replace(/\s+/g, ' ').slice(0, 40)
    if (next && next !== name) updateGroupName(id, next)
  }

  return (
    <div
      className={`ork-group${color ? ' ork-group--colored' : ''}`}
      style={color ? ({ '--group-color': color } as CSSProperties) : undefined}
    >
      {editing ? (
        <input
          className="ork-group-header ork-group-rename nodrag"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <div
          className="ork-group-header"
          title="Duplo-clique para renomear o grupo"
          onDoubleClick={() => {
            setDraft(name === 'Grupo' ? '' : name)
            setEditing(true)
          }}
        >
          {name}
        </div>
      )}
    </div>
  )
}
