import { useEffect, useState, type JSX } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { attentionAgents } from '../canvas/attentionList'
import { selectionChangesToFocus } from '../canvas/frameNode'
import { Icon } from './Icon'
import './AttentionHud.css'

// Ombro T5 (docs/planejamento/ombro.md): HUD dentro do app que consolida os agentes que "pararam e
// podem precisar de você" (o Set `attention` do canvasStore). É a versão VISÍVEL/CLICÁVEL do mesmo
// sinal que o atalho Shift+A cicla — não duplica a lógica de enquadrar: reusa `selectionChangesToFocus`
// (helper puro do Shift+A, T1) + `fitView`. Respeita `monitor === false` implicitamente, já que o Set
// `attention` só contém nós monitorados (filtrado em Canvas.tsx). Estado efêmero (nada persistido),
// como o próprio Set. Renderiza só quando há ≥1 agente aguardando; some ao esvaziar.
export function AttentionHud(): JSX.Element | null {
  const nodes = useCanvasStore((s) => s.nodes)
  const attention = useCanvasStore((s) => s.attention)
  const onNodesChange = useCanvasStore((s) => s.onNodesChange)
  const { fitView } = useReactFlow()
  const [expanded, setExpanded] = useState(false)

  const agents = attentionAgents(nodes, attention)

  // Colapsa a lista quando o HUD esvazia (evita reabrir "aberto e vazio" quando um novo agente entra).
  useEffect(() => {
    if (agents.length === 0 && expanded) setExpanded(false)
  }, [agents.length, expanded])

  if (agents.length === 0) return null

  // Enquadra + seleciona o nó, mesmíssimo comportamento do Shift+A e do click da notificação (T2).
  // Lê o estado VIVO (getState) na hora do clique, não o `nodes` capturado no render.
  const focusNode = (id: string): void => {
    fitView({ nodes: [{ id }], duration: 300 })
    const changes = selectionChangesToFocus(useCanvasStore.getState().nodes, id)
    if (changes.length) onNodesChange(changes)
  }

  const count = agents.length
  const label = `${count} ${count === 1 ? 'agente aguardando' : 'agentes aguardando'} você`

  return (
    // `nodrag`: o HUD é um overlay fora do pane do React Flow, mas a classe deixa explícito que
    // gestos sobre ele nunca panam o canvas. role="status" + aria-label seguem o padrão do badge
    // `.ork-node-attention`.
    <div className="ork-attention-hud nodrag" role="status" aria-label={label}>
      <button
        className="ork-attention-hud-chip"
        aria-expanded={expanded}
        aria-label={expanded ? `Recolher lista — ${label}` : `Expandir lista — ${label}`}
        title={label}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="ork-attention-hud-dot" aria-hidden="true" />
        <Icon name="Bell" size={14} animation="none" />
        <span className="ork-attention-hud-count">{count}</span>
        <span className="ork-attention-hud-text">aguardando</span>
      </button>
      {expanded && (
        <ul className="ork-attention-hud-list">
          {agents.map((a) => (
            <li key={a.id}>
              <button
                className="ork-attention-hud-item"
                onClick={() => focusNode(a.id)}
                title={`Enquadrar ${a.name}`}
                aria-label={`Enquadrar ${a.name}`}
              >
                <span className="ork-attention-hud-dot" aria-hidden="true" />
                <span className="ork-attention-hud-item-name">{a.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
