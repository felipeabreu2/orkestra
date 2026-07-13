import { useEffect, useReducer } from 'react'
import type { Editor } from '@tiptap/react'
import { getNoteEditor, subscribeNoteEditors } from './noteEditorRegistry'

// Entrega à barra de formatação (fora do nó) o editor TipTap da nota `id`, e força re-render quando
// (a) o editor registra/sai do registry — ex.: ao selecionar outra nota — e (b) o próprio editor
// emite uma transação (para os botões refletirem bold-ativo, cursor em heading, etc.).
export function useNoteEditor(id: string): Editor | null {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => subscribeNoteEditors(force), [])
  const editor = getNoteEditor(id) ?? null
  useEffect(() => {
    if (!editor) return
    editor.on('transaction', force)
    return () => {
      editor.off('transaction', force)
    }
  }, [editor])
  return editor
}
