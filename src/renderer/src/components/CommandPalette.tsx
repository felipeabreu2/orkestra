import { useEffect, useMemo, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { rankItems } from '../search'
import './CommandPalette.css'

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
    const nodeItems: PaletteItem[] = nodes.map((n): PaletteItem => {
      const data = n.data as { name?: string; content?: string }
      // Notas não têm data.name (só data.content) — sem isso todo nó-nota aparecia com o
      // literal "note" no palette. Usa o início do conteúdo como label (ou "Nota" se vazia).
      // Terminais/portais mantêm data.name (Fase 13).
      const label =
        n.type === 'note'
          ? String(data?.content ?? '').trim().slice(0, 24) || 'Nota'
          : data?.name ?? n.type ?? 'nó'
      return {
        id: `node:${n.id}`,
        label,
        kind: 'node',
        // Foca o nó centralizando o viewport no centro visual dele — soma metade da
        // largura/altura à posição (que é o canto superior-esquerdo), não fitView (mais
        // previsível pra um único alvo escolhido no palette) (Fase 12, corrigido Fase 13).
        run: () => {
          void setCenter(n.position.x + (n.width ?? 0) / 2, n.position.y + (n.height ?? 0) / 2, {
            zoom: 1.2,
            duration: 400
          })
        }
      }
    })
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
    // Backdrop: clique fora do card fecha o palette (onClose aqui); o card abaixo para a
    // propagação e carrega role/aria-modal — é ele que representa o diálogo em si (Fase 13).
    <div className="ork-palette-backdrop" onClick={onClose}>
      <div className="ork-palette-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <input
          ref={inputRef}
          className="ork-palette-input"
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
            } else if (e.key === 'Tab') {
              // Focus-trap simples (Fase 13): o input é o único elemento focável do palette (a
              // lista é navegada por seta, não por Tab), então basta bloquear o Tab pra ele não
              // vazar foco pro canvas por trás do overlay.
              e.preventDefault()
            }
          }}
          placeholder="Buscar nós ou ações..."
          aria-label="Busca do command palette"
        />
        <div className="ork-palette-list">
          {filtered.length === 0 && <div className="ork-palette-empty">Nenhum resultado</div>}
          {filtered.map((item, index) => (
            <div
              key={item.id}
              className={`ork-palette-item${index === activeIndex ? ' ork-palette-item--active' : ''}`}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => runItem(item)}
            >
              <span className="ork-palette-item-label">{item.label}</span>
              <span className="ork-palette-item-kind">{item.kind === 'action' ? 'ação' : 'nó'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
