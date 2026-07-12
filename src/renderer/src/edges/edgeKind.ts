export type EdgeKind = 'agent' | 'chain' | 'note' | 'portal' | 'link'

export function deriveEdgeKind(a?: string, b?: string): EdgeKind {
  if (a === 'terminal' && b === 'terminal') return 'agent'
  if (a === 'note' && b === 'note') return 'chain'
  const pair = new Set([a, b])
  if (pair.has('terminal') && pair.has('note')) return 'note'
  if (pair.has('portal')) return 'portal'
  return 'link'
}

export const EDGE_KIND_META: Record<EdgeKind, { label: string; title: string }> = {
  agent: { label: 'Agentes', title: 'Conexão entre terminais-agente' },
  chain: { label: 'Cadeia', title: 'Cadeia de notas' },
  note: { label: 'Contexto', title: 'Nota ligada a um terminal' },
  portal: { label: 'Portal', title: 'Conexão com um portal' },
  link: { label: 'Link', title: 'Conexão' }
}
