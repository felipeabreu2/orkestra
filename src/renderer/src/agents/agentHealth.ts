// Resiliência · T7 — agregador PURO do painel de saúde dos agentes. Nenhum estado novo em lugar
// nenhum: os dois Sets efêmeros do canvasStore já dizem tudo — `generating` (border-beam, derivado
// do conteúdo visível do xterm) e `attention` (watcher do AgentBus: falou e ficou ocioso =
// "aguardando você"). O painel só reorganiza o que o canvas já sabe numa lista de leitura rápida,
// no lugar da caça manual pelo canvas.
import type { Node } from '@xyflow/react'

export type AgentStatus = 'gerando' | 'aguardando' | 'ocioso'

export interface AgentHealthRow {
  id: string
  name: string
  status: AgentStatus
}

// gerando > aguardando: se os dois Sets marcam o mesmo nó, o agente VOLTOU a trabalhar depois de
// pedir atenção — o estado atual é o que importa.
const STATUS_ORDER: Record<AgentStatus, number> = { gerando: 0, aguardando: 1, ocioso: 2 }

export function buildAgentHealth(
  nodes: Node[],
  attention: ReadonlySet<string>,
  generating: ReadonlySet<string>
): AgentHealthRow[] {
  return nodes
    .filter((n) => n.type === 'terminal')
    .map((n) => {
      const status: AgentStatus = generating.has(n.id)
        ? 'gerando'
        : attention.has(n.id)
          ? 'aguardando'
          : 'ocioso'
      const name = ((n.data?.name as string) ?? '').trim() || 'Terminal'
      return { id: n.id, name, status }
    })
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )
}
