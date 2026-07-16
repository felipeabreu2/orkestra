import { useSyncExternalStore } from 'react'

// Estado efêmero do modo raw ↔ formatada de cada nota (Notas · T7). Fica FORA do canvasStore de
// propósito: é UI transitória (não vai pro snapshot .json) e precisa ser compartilhado entre a
// NoteFormatBar (botão de alternar, vive no NodeToolbar) e o NoteNode (render condicional), que só
// se conhecem via registries — espelha o noteEditorRegistry.
const rawModes = new Map<string, boolean>()
const listeners = new Map<string, Set<() => void>>()

export function isNoteRaw(id: string): boolean {
  return rawModes.get(id) ?? false
}

export function setNoteRaw(id: string, raw: boolean): void {
  if (isNoteRaw(id) === raw) return
  rawModes.set(id, raw)
  listeners.get(id)?.forEach((fn) => fn())
}

export function toggleNoteRaw(id: string): void {
  setNoteRaw(id, !isNoteRaw(id))
}

function subscribe(id: string, fn: () => void): () => void {
  let set = listeners.get(id)
  if (!set) {
    set = new Set()
    listeners.set(id, set)
  }
  set.add(fn)
  return () => {
    set?.delete(fn)
  }
}

// Hook para NoteNode/NoteFormatBar re-renderizarem quando o modo raw da nota muda.
export function useNoteRaw(id: string): boolean {
  return useSyncExternalStore(
    (fn) => subscribe(id, fn),
    () => isNoteRaw(id)
  )
}
