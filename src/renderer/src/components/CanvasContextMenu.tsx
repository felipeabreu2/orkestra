import { useEffect, type JSX } from 'react'
import './CanvasContextMenu.css'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

// R4: menu de contexto do canvas (botão direito). Um overlay transparente em tela cheia captura o
// clique/context-menu fora do menu para fechá-lo; Esc também fecha. O menu em si para a propagação
// e fica posicionado no ponto do cursor (coordenadas de tela). Puramente apresentacional — quem
// monta os itens (criar nó no cursor, ações do nó) é o Canvas.
export function CanvasContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="ork-ctxmenu-overlay"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        className="ork-ctxmenu"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
        role="menu"
        aria-label="Menu de contexto do canvas"
      >
        {items.map((it, i) => (
          <button
            key={i}
            className={`ork-ctxmenu-item${it.danger ? ' ork-ctxmenu-item--danger' : ''}`}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              it.onClick()
              onClose()
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  )
}
