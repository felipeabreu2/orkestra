// Estados do nó (DesignCode UI §5, Lote C): mapeia o estado semântico do agente/terminal para as
// classes CSS consumidas por nodes.css (.is-generating = border-beam; .needs-attention = glow-pulse
// + attention dot; .is-done = flash verde curto; .is-selected = anel estático, pode coexistir com
// qualquer um dos anteriores). 'idle' não tem classe própria — é o estado de repouso do .ork-node.
export type NodeState = 'idle' | 'generating' | 'needsInput' | 'done'

const STATE_CLASS: Record<NodeState, string> = {
  idle: '',
  generating: 'is-generating',
  needsInput: 'needs-attention',
  done: 'is-done'
}

// selected é um eixo INDEPENDENTE do estado (um nó gerando pode estar selecionado ao mesmo tempo —
// o beam e o anel de seleção coexistem, ver nodes.css), por isso é um segundo argumento e não mais
// um NodeState próprio.
export function nodeStateClass(state: NodeState, selected = false): string {
  return [STATE_CLASS[state], selected ? 'is-selected' : ''].filter(Boolean).join(' ')
}
