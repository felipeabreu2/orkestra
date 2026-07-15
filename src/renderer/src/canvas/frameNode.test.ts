import { describe, it, expect } from 'vitest'
import { selectionChangesToFocus } from './frameNode'

// Helper puro extraído do Shift+A (Canvas.tsx): dado o conjunto de nós e o alvo, devolve as
// NodeChange de seleção que SELECIONAM só o alvo e DESMARCAM os demais. Reusado pelo Shift+A e
// pelo click da notificação (Ombro T2). Ver docs/planejamento/ombro.md T1.
describe('selectionChangesToFocus', () => {
  it('seleciona o alvo e desmarca os demais selecionados', () => {
    const nodes = [
      { id: 'a', selected: false },
      { id: 'b', selected: true }
    ]
    expect(selectionChangesToFocus(nodes, 'a')).toEqual([
      { id: 'a', type: 'select', selected: true },
      { id: 'b', type: 'select', selected: false }
    ])
  })

  it('não gera mudança quando o alvo já é o único selecionado', () => {
    const nodes = [
      { id: 'a', selected: true },
      { id: 'b', selected: false }
    ]
    expect(selectionChangesToFocus(nodes, 'a')).toEqual([])
  })

  it('é no-op seguro quando o alvo não existe na lista', () => {
    const nodes = [
      { id: 'a', selected: false },
      { id: 'b', selected: false }
    ]
    expect(selectionChangesToFocus(nodes, 'zzz')).toEqual([])
  })
})
