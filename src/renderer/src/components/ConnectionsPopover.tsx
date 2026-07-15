import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useReactFlow, type NodeChange } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { describeNodeConnections } from '../edges/describeConnections'
import { EDGE_KIND_META } from '../edges/edgeKind'
import { Icon } from './Icon'
import './ConnectionsPopover.css'

// T3 (plano de Conexões): evolui o CONTADOR do NodeToolbar (só diz "quantas") para um popover de
// INSPEÇÃO — lista cada conexão, o que há do outro lado (nome + tipo), com × por linha (remove só
// aquela aresta, sem fechar) e clique na linha = navegar+selecionar o alvo. A regra de "quais
// conexões" mora no helper PURO `describeNodeConnections` (testado); aqui é só a UI + a navegação.
export function ConnectionsPopover({ nodeId }: { nodeId: string }): JSX.Element {
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const removeEdge = useCanvasStore((s) => s.removeEdge)
  const onNodesChange = useCanvasStore((s) => s.onNodesChange)
  const { setCenter, getZoom, getInternalNode } = useReactFlow()

  const rows = useMemo(() => describeNodeConnections(nodes, edges, nodeId), [nodes, edges, nodeId])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora ou apertar Esc (o × e o clique-na-linha decidem por conta própria).
  useEffect(() => {
    if (!open) return
    const onDown = (ev: MouseEvent): void => {
      if (ref.current && !ref.current.contains(ev.target as globalThis.Node)) setOpen(false)
    }
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return (): void => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Clique na linha: seleciona só o alvo (deseleciona os demais) e centraliza o canvas nele.
  // Usa a posição ABSOLUTA do React Flow (getInternalNode) para acertar nós dentro de grupos.
  const goTo = (otherId: string): void => {
    const changes: NodeChange[] = nodes
      .filter((n) => n.selected || n.id === otherId)
      .map((n): NodeChange => ({ id: n.id, type: 'select', selected: n.id === otherId }))
    if (changes.length > 0) onNodesChange(changes)

    const internal = getInternalNode(otherId)
    if (internal) {
      const { x, y } = internal.internals.positionAbsolute
      const w = internal.measured?.width ?? 0
      const h = internal.measured?.height ?? 0
      void setCenter(x + w / 2, y + h / 2, { zoom: getZoom(), duration: 400 })
    }
    setOpen(false)
  }

  return (
    <div className="ork-conn-wrap" ref={ref}>
      <button
        type="button"
        className="ork-node-toolbar-links ork-conn-toggle"
        onClick={() => setOpen((o) => !o)}
        title={`${rows.length} conexão(ões) neste nó`}
        aria-label={`${rows.length} conexões`}
        aria-expanded={open}
      >
        <Icon name="GitBranch" size={16} animation="none" />
        <span className="ork-node-toolbar-badge">{rows.length}</span>
      </button>
      {open && (
        <div className="ork-conn-pop" role="menu" aria-label="Conexões deste nó">
          {rows.length === 0 ? (
            <div className="ork-conn-empty">Sem conexões</div>
          ) : (
            rows.map((row) => (
              <div key={row.edgeId} className="ork-conn-row" role="menuitem">
                <button
                  type="button"
                  className="ork-conn-row-main"
                  onClick={() => goTo(row.otherId)}
                  title={`Ir para "${row.otherName}"`}
                >
                  <span className={`ork-conn-kind ork-conn-kind--${row.kind}`}>
                    {EDGE_KIND_META[row.kind].label}
                  </span>
                  <span className="ork-conn-name">{row.otherName}</span>
                </button>
                <button
                  type="button"
                  className="ork-conn-remove"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    removeEdge(row.edgeId)
                  }}
                  title="Remover esta conexão"
                  aria-label={`Remover conexão com "${row.otherName}"`}
                >
                  <Icon name="X" size={13} animation="none" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
