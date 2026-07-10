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

  // Aplica comandos vindos do orq (via main). Sempre lê o estado fresco via getState() (em vez
  // de depender de `nodes` no dep array) para evitar closures obsoletas entre re-renders.
  useEffect(() => {
    const dispose = window.orkestra.orchestration.onCommand((cmd: OrchestrationCommand) => {
      const store = useCanvasStore.getState()
      if (cmd.type === 'updateNote') {
        const notes = store.nodes.filter((n) => n.type === 'note')
        const target = cmd.target
          ? notes.find((n) => n.id === cmd.target || (n.data?.name as string) === cmd.target)
          : notes[0]
        if (target) updateNoteContent(target.id, cmd.content)
      } else if (cmd.type === 'recruit') {
        store.addTerminalNode(undefined, { name: cmd.name, preset: cmd.preset, role: cmd.role })
      } else if (cmd.type === 'dismiss') {
        const terminals = store.nodes.filter((n) => n.type === 'terminal')
        const target = terminals.find((n) => (n.data?.name as string) === cmd.target)
        if (target) store.removeNode(target.id)
      } else if (cmd.type === 'connect') {
        const terminals = store.nodes.filter((n) => n.type === 'terminal')
        const source = terminals.find((n) => (n.data?.name as string) === cmd.source)
        const target = terminals.find((n) => (n.data?.name as string) === cmd.target)
        if (source && target) {
          store.onConnect({ source: source.id, target: target.id, sourceHandle: null, targetHandle: null })
        }
      }
    })
    return dispose
  }, [updateNoteContent])
}
