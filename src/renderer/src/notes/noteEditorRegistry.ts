import type { Editor } from '@tiptap/react'

// Expõe o editor TipTap de cada nota (por nodeId) à barra de formatação, que vive FORA do nó
// (NodeToolbar, abaixo da topbar). Molde do terminalRegistry. `subscribe` avisa a barra quando um
// editor registra/sai (ex.: ao selecionar outra nota), para ela repegar o editor certo.
const editors = new Map<string, Editor>()
const listeners = new Set<() => void>()

export function registerNoteEditor(id: string, editor: Editor): void {
  editors.set(id, editor)
  listeners.forEach((l) => l())
}

export function unregisterNoteEditor(id: string): void {
  if (editors.delete(id)) listeners.forEach((l) => l())
}

export function getNoteEditor(id: string): Editor | undefined {
  return editors.get(id)
}

export function subscribeNoteEditors(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
