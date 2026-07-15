import type { NodeChange } from '@xyflow/react'

/**
 * Dado o conjunto de nós do canvas e o id de um alvo, devolve as `NodeChange` de seleção que
 * SELECIONAM só o alvo e DESMARCAM os demais que estavam selecionados. Função pura extraída do
 * atalho `Shift+A` (Canvas.tsx) para ser reusada pelo click da notificação do Ombro sem duplicar
 * a lógica. Se o alvo já for o único selecionado (ou não existir), devolve `[]` (no-op seguro).
 */
export function selectionChangesToFocus(
  nodes: { id: string; selected?: boolean }[],
  targetId: string
): NodeChange[] {
  const changes: NodeChange[] = []
  for (const n of nodes) {
    if (n.id === targetId) {
      if (!n.selected) changes.push({ id: n.id, type: 'select', selected: true })
    } else if (n.selected) {
      changes.push({ id: n.id, type: 'select', selected: false })
    }
  }
  return changes
}
