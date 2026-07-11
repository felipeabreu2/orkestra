import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/canvasStore'

export function useCanvasPersistence(): void {
  const hydrate = useCanvasStore((s) => s.hydrate)
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const loaded = useRef(false)

  // Carrega o layout salvo uma vez, no mount.
  useEffect(() => {
    let cancelled = false
    window.orkestra.persistence.load().then((snap) => {
      if (cancelled) return
      if (snap) hydrate(snap)
      loaded.current = true
    }).catch(() => {
      if (!cancelled) loaded.current = true
    })
    return () => {
      cancelled = true
    }
  }, [hydrate])

  // Autosave debounced quando os nós mudam (só depois do load inicial).
  useEffect(() => {
    if (!loaded.current) return
    const t = setTimeout(() => {
      // Guarda contra a corrida de troca de projeto (Fase 15 Task 3): switchTo/handleRemove em
      // ProjectsSidebar já fazem seu próprio flush explícito por id, awaited, do projeto ANTIGO
      // antes de trocar o ativo no main. Esse autosave aqui é fire-and-forget e sempre grava no
      // projeto que estiver ATIVO no momento em que o timer dispara — se um timer de 500ms
      // armado com o conteúdo do projeto ANTIGO disparar depois que o main já setou o projeto
      // NOVO como ativo mas antes do renderer ter rodado hydrate(novo), gravaria o conteúdo do
      // antigo por cima do arquivo do novo (corrupção cross-project). switching:true cobre
      // exatamente essa janela, então pulamos o save aqui e deixamos o fluxo de switch cuidar
      // de tudo; o autosave normal volta a valer ~500ms depois do hydrate, quando switching já
      // está de volta a false.
      if (useCanvasStore.getState().switching) return
      window.orkestra.persistence.save(useCanvasStore.getState().serialize())
    }, 500)
    return () => clearTimeout(t)
  }, [nodes, edges])

  // Flush síncrono do último layout ao fechar o app (evita perder mudança <500ms antes do quit).
  useEffect(() => {
    const flush = (): void => {
      if (loaded.current) {
        window.orkestra.persistence.save(useCanvasStore.getState().serialize())
      }
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])
}
