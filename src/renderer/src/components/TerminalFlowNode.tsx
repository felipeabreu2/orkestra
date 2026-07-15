import { type CSSProperties } from 'react'
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react'
import { NodeHandles } from './NodeHandles'
import { useNodeVisibility } from '../nodeVisibility'
import { TerminalNode } from './TerminalNode'
import { ErrorBoundary } from './ErrorBoundary'
import { Icon } from './Icon'
import { useCanvasStore } from '../store/canvasStore'
import { roleMeta } from '../../../shared/roles'
import { nodeStateClass, type NodeState } from './nodeState'
import './nodes.css'

export function TerminalFlowNode({ id, selected, data }: NodeProps): JSX.Element {
  const removeNode = useCanvasStore((s) => s.removeNode)
  const updateTerminalName = useCanvasStore((s) => s.updateTerminalName)
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
  // Fase 27 (Task 3): host remoto (ex.: "user@host") quando este terminal nasceu em modo SSH
  // (addTerminalNode({sshHost}), ver canvasStore). Puro prop-read de data, igual preset
  // acima — NÃO é um seletor do store, então não corre risco do loop de render do zustand v5.
  const sshHost = (data as { sshHost?: string })?.sshHost
  // Papel do agente — metadado visual (sem efeito no LLM). `resolved` casa o preset (por id OU
  // label, case-insensitive) ou cai no neutro `var(--text-2)` p/ texto livre. O SELETOR inline de
  // papel foi REMOVIDO do header (2026-07-15, a pedido) — o papel agora é definido pela Command
  // Palette ("Definir papel de X") e só aparece como badge quando está setado (ver JSX abaixo).
  const resolved = roleMeta(role)

  // Reformulação 2026-07-14 (Lote C, §5 estados do nó): 'needsInput' reaproveita o sinal REAL que
  // já existe (hasAttention, acima) — o AgentBus (main) detecta "produziu saída e depois ficou
  // `idleMs` sem nada novo", exatamente a semântica de "agente terminou e espera você" da spec.
  //
  // 'generating' (Lote D; fix border-beam preso, 2026-07-15): agora é o MESMO tipo de sinal real
  // de `hasAttention` acima — só que a metade "ligada" em vez da "desligada". O AgentBus (main)
  // expõe busy=true no primeiro chunk de uma rajada de output e busy=false só depois de `idleMs`
  // de silêncio REAL (mesmo detector de ociosidade do watcher de atenção, timer próprio — ver
  // AgentBus.ts), chegando aqui via window.orkestra.onAgentBusy (assinado uma vez em Canvas.tsx,
  // que grava no `generating` Set do canvasStore). Substituiu a heurística antiga (timer fixo de
  // 500ms em TerminalNode.tsx), que ficava PRESA ligada porque a TUI do Claude Code/Ink emite
  // saída mesmo ociosa (repaints, barra "auto mode on", cursor) em intervalos > 500ms. Lido aqui
  // via seletor (só re-renderiza quando o resultado MUDA para ESTE id, igual hasAttention).
  // Trade-off aceito e documentado (herdado da heurística anterior, ainda vale): por ser sinal de
  // atividade do PTY (não do CONTEÚDO), um terminal tagarela sem agente nenhum (`tail -f`,
  // `watch`) também acende o beam — distinguir "agente respondendo" de "processo qualquer
  // imprimindo" exigiria parsear o conteúdo (spinner do wrapper claude), o que este fix
  // deliberadamente evita (frágil a mudanças de UI do Claude Code).
  const generating = useCanvasStore((s) => s.generating.has(id))
  const nodeState: NodeState = generating ? 'generating' : hasAttention ? 'needsInput' : 'idle'

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
      <div
        className={['ork-node', nodeStateClass(nodeState, selected ?? false)].filter(Boolean).join(' ')}
        ref={ref}
        onFocusCapture={handleFocusCapture}
        // §4.3: alimenta --role-color SÓ quando há papel, para a barra de accent do header e a
        // receita "papel a 7%" do badge (ambas em nodes.css) pegarem a cor do papel — inclusive o
        // caveat de tema claro (o CSS escurece o texto no [data-theme='light']). Sem papel, a var
        // fica indefinida e o fallback `transparent`/--text-2 do CSS mantém tudo neutro/inerte.
        style={role.trim() !== '' ? ({ ['--role-color']: resolved.color } as CSSProperties) : undefined}
      >
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
            <span className="ork-role-badge" title={resolved.hint || undefined}>
              {resolved.label}
            </span>
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
            <ErrorBoundary>
              <TerminalNode nodeId={id} preset={preset} sshHost={sshHost} />
            </ErrorBoundary>
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
