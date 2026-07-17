import type { JSX } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { buildAgentHealth, type AgentStatus } from '../agents/agentHealth'
import { Icon } from './Icon'
import './AgentHealthPanel.css'

// Resiliência · T7 — painel de saúde dos agentes: a visão agregada "quem está gerando / aguardando
// você / ocioso", derivada 100% do estado que o canvas JÁ calcula (Sets efêmeros `generating` e
// `attention` do canvasStore — nenhum estado novo, nenhum IPC). Substitui a caça manual pelo
// canvas: clicar numa linha enquadra o nó (mesmo gesto do Shift+A). Toggle por Shift+H (Canvas).
const STATUS_LABEL: Record<AgentStatus, string> = {
  gerando: 'gerando',
  aguardando: 'aguardando você',
  ocioso: 'ocioso'
}

export function AgentHealthPanel({
  onFocusNode,
  onClose
}: {
  onFocusNode: (nodeId: string) => void
  onClose: () => void
}): JSX.Element {
  const nodes = useCanvasStore((s) => s.nodes)
  const attention = useCanvasStore((s) => s.attention)
  const generating = useCanvasStore((s) => s.generating)
  const rows = buildAgentHealth(nodes, attention, generating)

  return (
    <div className="ork-health" role="dialog" aria-label="Saúde dos agentes">
      <div className="ork-health-header">
        <Icon name="Activity" size={13} animation="none" />
        <span className="ork-health-title">Agentes</span>
        <button className="ork-health-close" onClick={onClose} aria-label="Fechar painel" title="Fechar (⇧H)">
          <Icon name="X" size={12} animation="pop" />
        </button>
      </div>
      {rows.length === 0 && <div className="ork-health-empty">Nenhum terminal neste projeto.</div>}
      {rows.map((r) => (
        <button
          key={r.id}
          className="ork-health-row"
          onClick={() => onFocusNode(r.id)}
          title={`Enquadrar ${r.name}`}
        >
          <span className={`ork-health-dot ork-health-dot--${r.status}`} aria-hidden="true" />
          <span className="ork-health-name">{r.name}</span>
          <span className={`ork-health-status ork-health-status--${r.status}`}>{STATUS_LABEL[r.status]}</span>
        </button>
      ))}
    </div>
  )
}
