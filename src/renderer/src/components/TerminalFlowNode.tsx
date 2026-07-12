import { useState } from 'react'
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import { TerminalNode } from './TerminalNode'
import { useCanvasStore } from '../store/canvasStore'
import { PRESET_ROLES, roleMeta } from '../../../shared/roles'
import './nodes.css'

export function TerminalFlowNode({ id, selected, data }: NodeProps): JSX.Element {
  const removeNode = useCanvasStore((s) => s.removeNode)
  const updateTerminalName = useCanvasStore((s) => s.updateTerminalName)
  const updateTerminalRole = useCanvasStore((s) => s.updateTerminalRole)
  // Fase 20 (Task 2): indicador de "atenção do agente" — true enquanto este nodeId está no Set
  // `attention` do store (o agente deste terminal produziu output e depois ficou ocioso; ver
  // AgentBus.onAttention no main + o useEffect que assina window.orkestra.onAgentAttention em
  // Canvas.tsx). Seletor lê só o booleano (s.attention.has(id)), não o Set inteiro, então este
  // componente só re-renderiza quando o resultado MUDA para o SEU PRÓPRIO id — não a cada
  // mudança de atenção de qualquer outro terminal.
  const hasAttention = useCanvasStore((s) => s.attention.has(id))
  const setAttention = useCanvasStore((s) => s.setAttention)
  const name = (data as { name?: string })?.name ?? 'Terminal'
  const role = (data as { role?: string })?.role ?? ''
  const preset = (data as { preset?: string })?.preset
  const autostart = (data as { autostart?: boolean })?.autostart
  // Fase 26 (Task 2): papel do agente — metadado visual (sem efeito no LLM). `rmeta` resolve o
  // preset (por id OU label, case-insensitive) ou cai no neutro `var(--text-2)` p/ texto livre.
  // `customRole` decide se o <select> mostra "Personalizado…" com o <input> de texto revelado;
  // derivado uma vez do `role` atual no mount (não é preset -> já começa em modo personalizado),
  // e depois só muda via interação do próprio seletor — ver nota de risco no brief da Fase 26.
  const rmeta = roleMeta(role)
  const isPresetRole = PRESET_ROLES.some((r) => r.label === role)
  const [customRole, setCustomRole] = useState(role.trim() !== '' && !isPresetRole)

  // Limpa a atenção QUANDO o usuário de fato volta a usar este terminal — dispara ao focar
  // qualquer coisa dentro do wrapper (o mais comum: a <textarea> escondida que o xterm.js usa
  // internamente para capturar teclado, focada automaticamente por ele em clique OU via Tab;
  // também cobre focar os campos de nome/papel ou o botão fechar, o que é razoável — o usuário
  // está claramente olhando para ESTE nó). onFocusCapture (não onFocus) para pegar o evento na
  // fase de captura, funcionando mesmo com elementos que o React não renderizou diretamente
  // (o DOM do xterm.js é criado imperativamente dentro do container, mas o React ainda entrega
  // eventos de foco de descendentes a um ancestral com o handler, via delegação em 'focusin').
  // Limpa SÓ a atenção deste id — nunca a de outros nós.
  const handleFocusCapture = (): void => {
    setAttention(id, false)
    window.orkestra.clearAgentAttention(id)
  }

  return (
    <>
      <NodeResizer minWidth={240} minHeight={140} isVisible={selected ?? false} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="ork-node" onFocusCapture={handleFocusCapture}>
        <div className="ork-node-header">
          <span className="ork-node-dot" aria-hidden="true" />
          {hasAttention && (
            <span
              className="ork-node-attention"
              role="status"
              aria-label="Este agente parou e pode precisar de você"
              title="Este agente parou e pode precisar de você"
            />
          )}
          <input
            className="nodrag ork-node-input"
            value={name}
            onChange={(e) => updateTerminalName(id, e.target.value)}
            aria-label="Nome do terminal"
          />
          {role.trim() !== '' && (
            <span
              className="ork-role-badge"
              style={{ color: rmeta.color, borderColor: rmeta.color }}
              title={rmeta.hint || undefined}
            >
              {rmeta.label}
            </span>
          )}
          <select
            className="nodrag ork-role-select"
            value={customRole ? '__custom__' : role}
            onChange={(e) => {
              const v = e.target.value
              if (v === '__custom__') {
                setCustomRole(true)
                return
              }
              setCustomRole(false)
              updateTerminalRole(id, v)
            }}
            aria-label="Papel do terminal"
            title="Papel do agente"
          >
            <option value="">Sem papel</option>
            {PRESET_ROLES.map((r) => (
              <option key={r.id} value={r.label}>
                {r.label}
              </option>
            ))}
            <option value="__custom__">Personalizado…</option>
          </select>
          {customRole && (
            <input
              className="nodrag ork-role-input"
              value={role}
              placeholder="Papel personalizado"
              onChange={(e) => updateTerminalRole(id, e.target.value)}
              aria-label="Papel personalizado"
            />
          )}
          <button
            className="nodrag ork-node-iconbtn"
            onClick={() => removeNode(id)}
            aria-label="Fechar terminal"
            title="Remover nó"
          >
            ×
          </button>
        </div>
        <div className="nodrag nowheel ork-node-body">
          <TerminalNode nodeId={id} preset={preset} autostart={autostart} />
        </div>
      </div>
    </>
  )
}
