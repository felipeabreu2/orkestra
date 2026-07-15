// Ombro T5 (docs/planejamento/ombro.md): seletor PURO que deriva a lista do HUD de "agentes
// aguardando" a partir dos nós do canvas + o Set `attention` do canvasStore. Puro (sem React/store)
// e testável — o componente AttentionHud só liga o store a esta função. O Set `attention` já só
// contém nós MONITORADOS (data.monitor !== false, filtrado em Canvas.tsx onAgentAttention), então o
// HUD herda o respeito ao `monitor` de graça. Tipo dos nós minimal (o mesmo shape de frameNode.ts):
// aceita os `Node[]` do React Flow sem depender do tipo completo.

export interface AttentionAgent {
  id: string
  name: string
}

// Default alinhado ao TerminalFlowNode (`data.name ?? 'Terminal'`) para o HUD mostrar o mesmo rótulo
// que o header do nó.
const DEFAULT_NAME = 'Terminal'

export function attentionAgents(
  nodes: { id: string; data?: Record<string, unknown> }[],
  attention: Set<string>
): AttentionAgent[] {
  const out: AttentionAgent[] = []
  // Itera pelos NÓS (não pelo Set) para: (1) preservar a ordem do canvas; (2) descartar ids órfãos
  // (presentes no Set mas sem nó — ex.: terminal de outro projeto) sem quebrar.
  for (const n of nodes) {
    if (!attention.has(n.id)) continue
    const raw = n.data?.name
    const name = typeof raw === 'string' && raw.trim() !== '' ? raw : DEFAULT_NAME
    out.push({ id: n.id, name })
  }
  return out
}
