import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { rankItems } from '../search'

// Command palette (Cmd/Ctrl+K, Fase 12): busca unificada sobre ações de criação
// (terminal/nota/portal) e os nós já presentes no canvas. `rankItems` (puro, testado em
// search.test.ts) faz o filtro/ordenação por label — este componente só monta a lista de
// itens (fechando `run` sobre o store e sobre `useReactFlow`) e cuida do teclado
// (↑/↓ navegam, Enter executa, Esc fecha). Precisa renderizar dentro do contexto do React
// Flow (ReactFlowProvider em App.tsx envolve todo o Canvas, então basta montar ao lado de
// FloorsPanel/RoutinesPanel) para que `useReactFlow()` funcione. Estilo mínimo (polish é
// Fase 13).
export interface PaletteItem {
  id: string
  label: string
  kind: 'action' | 'node'
  run: () => void
}

interface CommandPaletteProps {
  onClose: () => void
}

export function CommandPalette({ onClose }: CommandPaletteProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const nodes = useCanvasStore((s) => s.nodes)
  const addTerminalNode = useCanvasStore((s) => s.addTerminalNode)
  const addNoteNode = useCanvasStore((s) => s.addNoteNode)
  const addPortalNode = useCanvasStore((s) => s.addPortalNode)
  const { setCenter } = useReactFlow()

  // Autofocus ao montar — o palette só existe no DOM enquanto aberto (Canvas.tsx desmonta
  // via `{paletteOpen && ...}`), então isso roda toda vez que ele abre.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const items = useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      { id: 'action:terminal', label: 'Criar Terminal', kind: 'action', run: () => addTerminalNode() },
      { id: 'action:note', label: 'Criar Nota', kind: 'action', run: () => addNoteNode() },
      { id: 'action:portal', label: 'Criar Portal', kind: 'action', run: () => addPortalNode() }
    ]
    const nodeItems: PaletteItem[] = nodes.map((n) => ({
      id: `node:${n.id}`,
      label: (n.data as { name?: string })?.name ?? n.type ?? 'nó',
      kind: 'node',
      // Foca o nó centralizando o viewport na posição dele (Fase 12: setCenter, não fitView —
      // mais previsível pra um único alvo escolhido no palette).
      run: () => {
        void setCenter(n.position.x, n.position.y, { zoom: 1.2, duration: 400 })
      }
    }))
    return [...actions, ...nodeItems]
  }, [nodes, addTerminalNode, addNoteNode, addPortalNode, setCenter])

  const filtered = useMemo(() => rankItems(query, items), [query, items])
  const activeIndex = filtered.length === 0 ? -1 : Math.min(selectedIndex, filtered.length - 1)

  const runItem = (item: PaletteItem | undefined): void => {
    if (!item) return
    item.run()
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#1e1e1e',
          border: '1px solid #333',
          borderRadius: 8,
          color: '#cccccc',
          fontSize: 13,
          overflow: 'hidden',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)'
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelectedIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSelectedIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSelectedIndex((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              runItem(filtered[activeIndex])
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
          placeholder="Buscar nós ou ações..."
          aria-label="Busca do command palette"
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid #333',
            color: '#eeeeee',
            fontSize: 14,
            padding: '10px 12px',
            outline: 'none'
          }}
        />
        <div style={{ overflowY: 'auto', padding: 4 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '8px 6px', color: '#8a8a8a' }}>Nenhum resultado</div>
          )}
          {filtered.map((item, index) => (
            <div
              key={item.id}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => runItem(item)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                background: index === activeIndex ? '#2d2d2d' : 'transparent'
              }}
            >
              <span>{item.label}</span>
              <span style={{ color: '#8a8a8a', fontSize: 11 }}>
                {item.kind === 'action' ? 'ação' : 'nó'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
