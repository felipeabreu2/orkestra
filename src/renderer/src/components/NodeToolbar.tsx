import type { JSX } from 'react'
import type { Node } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { Icon } from './Icon'
import { NoteFormatBar } from './NoteFormatBar'

// Barra de ações que abre abaixo da barra superior quando UM nó está selecionado (F04/F05,
// imagem 4/5). Reusa o visual .ork-toolbar (fundo/borda/sombra/fade-in) com a âncora top-center
// da .ork-arrange-toolbar. Terminal ganha "renomear"; todos os tipos têm ligações/reverter/apagar.
export function NodeToolbar({ node }: { node: Node }): JSX.Element {
  const edges = useCanvasStore((s) => s.edges)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const undo = useCanvasStore((s) => s.undo)
  const canUndo = useCanvasStore((s) => s.past.length > 0)

  const linkCount = edges.filter((e) => e.source === node.id || e.target === node.id).length
  const isTerminal = node.type === 'terminal'
  const isNote = node.type === 'note'

  // Renomear: foca o input de nome DENTRO do nó selecionado (o React Flow marca o nó com a classe
  // `selected`; o input do terminal tem a classe `ork-node-input`). Sem novo estado — o campo de
  // edição já existe no header do nó.
  const rename = (): void => {
    const el = document.querySelector<HTMLInputElement>('.react-flow__node.selected .ork-node-input')
    el?.focus()
    el?.select()
  }

  return (
    <div className="ork-toolbar ork-node-toolbar" role="toolbar" aria-label="Ações do nó">
      {isNote && (
        <>
          <NoteFormatBar nodeId={node.id} />
          <span className="ork-toolbar-divider" />
        </>
      )}
      {isTerminal && (
        <button className="ork-toolbar-btn ork-node-toolbar-icon" onClick={rename} title="Renomear" aria-label="Renomear">
          <Icon name="Pencil" size={16} animation="wiggle" />
        </button>
      )}
      <span
        className="ork-node-toolbar-links"
        title={`${linkCount} conexão(ões) neste nó`}
        aria-label={`${linkCount} conexões`}
      >
        <Icon name="GitBranch" size={16} animation="none" />
        <span className="ork-node-toolbar-badge">{linkCount}</span>
      </span>
      <button
        className="ork-toolbar-btn ork-node-toolbar-icon"
        onClick={() => undo()}
        disabled={!canUndo}
        title="Reverter a última ação"
        aria-label="Reverter"
      >
        <Icon name="Undo2" size={16} animation="nudge" />
      </button>
      <button
        className="ork-toolbar-btn ork-node-toolbar-icon ork-node-toolbar-danger"
        onClick={() => removeNode(node.id)}
        title="Apagar"
        aria-label="Apagar"
      >
        <Icon name="Trash2" size={16} animation="bounce" />
      </button>
    </div>
  )
}
