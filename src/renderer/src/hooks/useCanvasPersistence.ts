import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/canvasStore'

export function useCanvasPersistence(): void {
  const hydrate = useCanvasStore((s) => s.hydrate)
  const nodes = useCanvasStore((s) => s.nodes)
  const loaded = useRef(false)

  // Carrega o layout salvo uma vez, no mount.
  useEffect(() => {
    let cancelled = false
    window.orkestra.persistence.load().then((snap) => {
      if (cancelled) return
      if (snap) hydrate(snap)
      loaded.current = true
    })
    return () => {
      cancelled = true
    }
  }, [hydrate])

  // Autosave debounced quando os nós mudam (só depois do load inicial).
  useEffect(() => {
    if (!loaded.current) return
    const t = setTimeout(() => {
      window.orkestra.persistence.save(useCanvasStore.getState().serialize())
    }, 500)
    return () => clearTimeout(t)
  }, [nodes])
}
