import { useEffect } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import type { CanvasMirror, OrchestrationCommand } from '../../../shared/orchestration'

// Mantém o main sincronizado com um espelho leve do canvas (id/tipo/nome/conteúdo dos nós)
// e aplica de volta no store os comandos vindos do orq (via main), ex.: updateNote.
export function useOrchestrationSync(): void {
  const nodes = useCanvasStore((s) => s.nodes)
  const updateNoteContent = useCanvasStore((s) => s.updateNoteContent)

  // Envia um espelho leve do canvas ao main sempre que os nós mudam.
  useEffect(() => {
    const mirror: CanvasMirror = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type ?? 'terminal',
        name: ((n.data?.name as string) ?? (n.data?.content as string) ?? n.type ?? 'nó').slice(0, 40),
        content: n.data?.content as string | undefined,
        role: (n.data?.role as string) ?? '',
        preset: (n.data?.preset as string) ?? 'shell'
      }))
    }
    window.orkestra.orchestration.sync(mirror)
  }, [nodes])

  // Aplica comandos vindos do orq (via main).
  useEffect(() => {
    const dispose = window.orkestra.orchestration.onCommand((cmd: OrchestrationCommand) => {
      if (cmd.type === 'updateNote') {
        const notes = useCanvasStore.getState().nodes.filter((n) => n.type === 'note')
        const target = cmd.target
          ? notes.find((n) => n.id === cmd.target || (n.data?.name as string) === cmd.target)
          : notes[0]
        if (target) updateNoteContent(target.id, cmd.content)
      }
    })
    return dispose
  }, [updateNoteContent])
}
