import { useEffect, useReducer, useRef, useState, type JSX } from 'react'
import type { Editor } from '@tiptap/react'
import { Icon } from './Icon'
import { collectMatches } from '../notes/searchReplaceExtension'

// Barra de localizar/substituir DENTRO de uma nota (2026-07-14). O COMPONENTE é a fonte da verdade:
// calcula os matches direto do doc do editor a cada render (contador imediato e correto), navega,
// e substitui via transações. A extensão só desenha o destaque (recebe termo + índice atual).
export function NoteFindBar({ editor, onClose }: { editor: Editor; onClose: () => void }): JSX.Element {
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [index, setIndex] = useState(0)
  const findRef = useRef<HTMLInputElement>(null)
  // Re-render a cada transação do editor — necessário para recomputar os matches depois de uma
  // substituição (o doc mudou). A digitação no campo `find` já re-renderiza por si (setFind).
  const [, bump] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    findRef.current?.focus()
    findRef.current?.select()
  }, [])

  useEffect(() => {
    const on = (): void => bump()
    editor.on('transaction', on)
    return () => {
      editor.off('transaction', on)
    }
  }, [editor])

  // Matches calculados AQUI, direto do doc atual + termo — não dependem de re-ler o estado do plugin.
  const results = collectMatches(editor.state.doc, find)
  const total = results.length
  const clampedIndex = total ? ((index % total) + total) % total : 0
  const currentMatch = total ? results[clampedIndex] : null

  // Informa a extensão o termo + índice atual para ela desenhar os destaques.
  useEffect(() => {
    editor.commands.setSearchHighlight(find, clampedIndex)
  }, [editor, find, clampedIndex])

  // Ao fechar (desmontar), limpa o destaque.
  useEffect(
    () => () => {
      editor.commands.setSearchHighlight('', 0)
    },
    [editor]
  )

  const scrollToCurrent = (): void => {
    requestAnimationFrame(() => {
      editor.view.dom.querySelector('.ork-find-current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
  }
  const go = (delta: number): void => {
    if (!total) return
    setIndex(clampedIndex + delta)
    scrollToCurrent()
  }
  const doReplace = (): void => {
    if (!currentMatch) return
    const { from, to } = currentMatch
    editor
      .chain()
      .command(({ tr }) => {
        if (replace) tr.insertText(replace, from, to)
        else tr.delete(from, to)
        return true
      })
      .run()
    scrollToCurrent()
  }
  const doReplaceAll = (): void => {
    if (!total) return
    editor
      .chain()
      .command(({ tr }) => {
        // Do último match para o primeiro: editar um range à frente não desloca as posições dos
        // anteriores, então elas seguem válidas na mesma transação.
        for (const r of [...results].sort((a, b) => b.from - a.from)) {
          if (replace) tr.insertText(replace, r.from, r.to)
          else tr.delete(r.from, r.to)
        }
        return true
      })
      .run()
  }

  return (
    <div
      className="ork-find-bar nodrag nowheel"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ork-find-row">
        <input
          ref={findRef}
          className="ork-find-input"
          value={find}
          onChange={(e) => {
            setFind(e.target.value)
            setIndex(0)
          }}
          placeholder="Localizar"
          aria-label="Localizar na nota"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              go(e.shiftKey ? -1 : 1)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <span className="ork-find-count" aria-live="polite">
          {total ? `${clampedIndex + 1}/${total}` : '0/0'}
        </span>
        <button
          type="button"
          className="ork-find-btn"
          onClick={() => go(-1)}
          disabled={!total}
          title="Anterior (Shift+Enter)"
          aria-label="Anterior"
        >
          <Icon name="ChevronUp" size={14} animation="none" />
        </button>
        <button
          type="button"
          className="ork-find-btn"
          onClick={() => go(1)}
          disabled={!total}
          title="Próximo (Enter)"
          aria-label="Próximo"
        >
          <Icon name="ChevronDown" size={14} animation="none" />
        </button>
        <button type="button" className="ork-find-btn" onClick={onClose} title="Fechar (Esc)" aria-label="Fechar">
          <Icon name="X" size={14} animation="pop" />
        </button>
      </div>
      <div className="ork-find-row">
        <input
          className="ork-find-input"
          value={replace}
          onChange={(e) => setReplace(e.target.value)}
          placeholder="Substituir por"
          aria-label="Substituir por"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <button
          type="button"
          className="ork-find-btn ork-find-btn--text"
          onClick={doReplace}
          disabled={!total}
          title="Substituir a ocorrência atual"
        >
          Substituir
        </button>
        <button
          type="button"
          className="ork-find-btn ork-find-btn--text"
          onClick={doReplaceAll}
          disabled={!total}
          title="Substituir todas"
        >
          Tudo
        </button>
      </div>
    </div>
  )
}
