import { useState } from 'react'
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react'
import { NodeHandles } from './NodeHandles'
import { useNodeVisibility } from '../nodeVisibility'
import { TerminalNode } from './TerminalNode'
import { Icon } from './Icon'
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
  // Onda 6 (F03): rota da pasta no rodapé + maximizar/restaurar (guarda em data._restore).
  const activeCwd = useCanvasStore((s) => s.activeCwd)
  const toggleMaximizeNode = useCanvasStore((s) => s.toggleMaximizeNode)
  const { fitView } = useReactFlow()
  const maximized = Boolean((data as { _restore?: unknown })._restore)
  // Otimização (Bloco 4): suspende o corpo (xterm) quando o nó sai da viewport — o pty segue vivo no
  // main (Fase 31) e o re-attach restaura o scrollback ao voltar. Notas/portais não suspendem.
  const { ref, visible } = useNodeVisibility<HTMLDivElement>()
  const name = (data as { name?: string })?.name ?? 'Terminal'
  const role = (data as { role?: string })?.role ?? ''
  const preset = (data as { preset?: string })?.preset
  const autostart = (data as { autostart?: boolean })?.autostart
  // Fase 27 (Task 3): host remoto (ex.: "user@host") quando este terminal nasceu em modo SSH
  // (addTerminalNode({sshHost}), ver canvasStore). Puro prop-read de data, igual preset/autostart
  // acima — NÃO é um seletor do store, então não corre risco do loop de render do zustand v5.
  const sshHost = (data as { sshHost?: string })?.sshHost
  // Fase 26 (Task 2): papel do agente — metadado visual (sem efeito no LLM). `resolved` casa o
  // preset (por id OU label, case-insensitive) ou cai no neutro `var(--text-2)` p/ texto livre;
  // `isPresetRole` reaproveita essa cor (neutra == não é preset) em vez de comparar `role` contra
  // os labels de novo — assim um preset gravado com casing não-canônico (ex.: "dev" via orq)
  // ainda é reconhecido. `showCustom`/`selectValue` são DERIVADOS de `role` a cada render — não
  // um estado travado no mount — porque o papel pode mudar por FORA do seletor (Command Palette
  // "Definir papel de X" chama updateTerminalRole no node já montado; um estado latched uma vez
  // deixaria o <select> em branco quando o novo valor não bate com nenhuma <option>).
  // `customToggle` só cobre o caso "Personalizado…" com role ainda vazio, onde não há valor
  // algum para derivar o modo custom.
  const resolved = roleMeta(role)
  const isPresetRole = resolved.color !== 'var(--text-2)'
  const [customToggle, setCustomToggle] = useState(false)
  const showCustom = customToggle || (role.trim() !== '' && !isPresetRole)
  const selectValue = showCustom ? '__custom__' : isPresetRole ? resolved.label : role

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
      <NodeHandles />
      <div className="ork-node" ref={ref} onFocusCapture={handleFocusCapture}>
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
          {sshHost && (
            <span className="ork-ssh-badge" title={`Remoto: ${sshHost}`}>
              SSH
            </span>
          )}
          {role.trim() !== '' && (
            <span
              className="ork-role-badge"
              style={{ color: resolved.color, borderColor: resolved.color }}
              title={resolved.hint || undefined}
            >
              {resolved.label}
            </span>
          )}
          <select
            className="nodrag ork-role-select"
            value={selectValue}
            onChange={(e) => {
              const v = e.target.value
              if (v === '__custom__') {
                setCustomToggle(true)
                return
              }
              setCustomToggle(false)
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
          {showCustom && (
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
            onClick={() => {
              toggleMaximizeNode(id)
              // enquadra o nó após o resize (próximo frame, já com o novo tamanho aplicado)
              requestAnimationFrame(() => fitView({ nodes: [{ id }], duration: 200, padding: 0.12 }))
            }}
            aria-label={maximized ? 'Restaurar tamanho' : 'Maximizar'}
            title={maximized ? 'Restaurar' : 'Maximizar'}
          >
            <Icon name={maximized ? 'Minimize2' : 'Maximize2'} size={13} animation="none" />
          </button>
          <button
            className="nodrag ork-node-iconbtn"
            onClick={() => removeNode(id)}
            aria-label="Fechar terminal"
            title="Remover nó"
          >
            <Icon name="X" size={14} animation="pop" />
          </button>
        </div>
        {visible ? (
          <div className="nodrag nowheel ork-node-body">
            <TerminalNode nodeId={id} preset={preset} autostart={autostart} sshHost={sshHost} />
          </div>
        ) : (
          <div className="ork-node-body ork-node-suspended" aria-hidden="true">
            terminal suspenso
          </div>
        )}
        <div className="ork-node-footer" title={activeCwd ?? 'Nenhuma pasta vinculada'}>
          <Icon name="Folder" size={12} animation="none" />
          <span className="ork-node-footer-path">{activeCwd ?? 'sem pasta'}</span>
        </div>
      </div>
    </>
  )
}
