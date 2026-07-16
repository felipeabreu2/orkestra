import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { PRESETS, presetById } from '../../../shared/presets'
import { PRESET_ROLES } from '../../../shared/roles'
import type { RoleSidecar } from '../../../shared/roleSidecar'
import { useCanvasStore } from '../store/canvasStore'
import { Icon } from './Icon'
import { RoleDiscoveryModal } from './RoleDiscoveryModal'
import './NewTerminalModal.css'

/** Ícone animado de cada preset — mapeia o id para um ícone do Lucide (nada de logotipos de
 * terceiros). Preset desconhecido cai no genérico "Bot". */
function PresetIcon({ id }: { id: string }): JSX.Element {
  const name =
    id === 'shell'
      ? 'SquareTerminal'
      : id === 'claude'
        ? 'Sparkles'
        : id === 'codex'
          ? 'Code2'
          : id === 'gemini'
            ? 'Gem'
            : 'Bot'
  return <Icon name={name} size={22} animation="pop" />
}

// Papel = segmented deslizante (overlays §4.6/§6 "indicador deslizante"): mesma receita do thumb
// azul da Topbar (Topbar.tsx `toolRefs`/`thumb`) — mede o botão ATIVO via ref e reposiciona um
// pill absoluto por trás dele com `transform`+`--spring`. "Sem papel" entra como uma opção normal
// (chave ROLE_NONE_KEY); as demais usam o `id` de PRESET_ROLES.
const ROLE_NONE_KEY = 'none'

// Chave do segmented para um papel IMPORTADO (T5) — prefixada para nunca colidir com o `id` de um
// preset, e normalizada como roleMeta (trim + lowercase).
function importedRoleKey(name: string): string {
  return `imp:${name.trim().toLowerCase()}`
}

export function NewTerminalModal({ onClose }: { onClose: () => void }): JSX.Element {
  const addTerminalNode = useCanvasStore((s) => s.addTerminalNode)
  const [preset, setPreset] = useState('shell')
  const [name, setName] = useState(presetById('shell')?.label ?? 'Terminal')
  const [nameEdited, setNameEdited] = useState(false)
  const [tab, setTab] = useState<'details' | 'appearance'>('details')
  const [monitor, setMonitor] = useState(true)
  const [maestro, setMaestro] = useState(false)
  const [role, setRole] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  // T5: papéis IMPORTADOS (registro ~/.orkestra/roles.json) entram no segmented ao lado dos presets
  // — é o que faz a importação valer aqui: escolher um deles grava `data.role`, e o spawn resolve o
  // prompt no registro (registerPtyIpc → importedPromptFor) e o injeta em ORKESTRA_ROLE.
  const [imported, setImported] = useState<RoleSidecar[]>([])
  const [discovering, setDiscovering] = useState(false)

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])

  // Carrega o registro ao abrir o modal (o discover já devolve os importados junto — a varredura é
  // limitada e best-effort no main; falhar aqui só significa segmented sem papéis importados).
  useEffect(() => {
    let alive = true
    void window.orkestra.roles.discover().then((res) => {
      if (alive) setImported(res.imported)
    })
    return () => {
      alive = false
    }
  }, [])

  const selectPreset = (id: string): void => {
    setPreset(id)
    if (!nameEdited) setName(presetById(id)?.label ?? 'Terminal')
  }

  const command = presetById(preset)?.command ?? null

  const create = (): void => {
    addTerminalNode(undefined, {
      preset,
      name: name.trim() || (presetById(preset)?.label ?? 'Terminal'),
      monitor,
      maestro,
      role: role || undefined
    })
    onClose()
  }

  // Thumb deslizante do segmented "Papel" — mesma mecânica do .ork-topbar-thumb (Topbar.tsx):
  // mede offsetLeft/offsetWidth do botão ativo via ref e anima com transform+width (GPU, --spring).
  // Remedida sempre que o papel ativo muda OU a aba "Aparência" (que monta os botões) reabre, já
  // que a árvore desmonta enquanto a aba "Detalhes" está em foco.
  const roleRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [roleThumb, setRoleThumb] = useState<{ left: number; width: number } | null>(null)
  const activeRoleKey =
    role === ''
      ? ROLE_NONE_KEY
      : (PRESET_ROLES.find((r) => r.label === role)?.id ??
        (imported.find((r) => r.name === role) ? importedRoleKey(role) : ROLE_NONE_KEY))

  // `imported` nas deps: a lista de botões cresce quando uma importação volta do modal de
  // descoberta, e o thumb precisa remedir sobre o layout novo.
  useLayoutEffect(() => {
    if (tab !== 'appearance') return
    const el = roleRefs.current[activeRoleKey]
    if (el) setRoleThumb({ left: el.offsetLeft, width: el.offsetWidth })
  }, [activeRoleKey, tab, imported])

  return (
    <div className="ork-modal-backdrop" onClick={onClose}>
      <div
        className="ork-modal-card ork-newterm"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Novo Terminal"
      >
        {/* Header (overlays §4.6): ícone-marca (--gradient-brand) + título + fechar, hairline
            própria encostada nas bordas do card — mesma estrutura do .mod-h do mockup
            (docs/design-system/mockups/orkestra-overlays.html). */}
        <div className="ork-newterm-head">
          <span className="ork-newterm-head-icon" aria-hidden="true">
            <Icon name="SquareTerminal" size={14} animation="none" />
          </span>
          <h2 className="ork-newterm-head-title">Novo Terminal</h2>
          <button type="button" className="ork-newterm-close" onClick={onClose} aria-label="Fechar">
            <Icon name="X" size={16} animation="none" />
          </button>
        </div>

        <div className="ork-newterm-content">
          <div className="ork-newterm-quickstart-label">Início rápido</div>
          <div className="ork-newterm-presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`ork-newterm-preset${preset === p.id ? ' ork-newterm-preset--active' : ''}`}
                onClick={() => selectPreset(p.id)}
              >
                <PresetIcon id={p.id} />
                <span className="ork-newterm-preset-label">{p.label}</span>
              </button>
            ))}
          </div>

          <div className="ork-newterm-divider" />

          <div className="ork-newterm-tabs">
            <button
              type="button"
              className={`ork-newterm-tab${tab === 'details' ? ' ork-newterm-tab--active' : ''}`}
              onClick={() => setTab('details')}
            >
              Detalhes
            </button>
            <button
              type="button"
              className={`ork-newterm-tab${tab === 'appearance' ? ' ork-newterm-tab--active' : ''}`}
              onClick={() => setTab('appearance')}
            >
              Aparência
            </button>
          </div>

          {tab === 'details' ? (
            <div className="ork-newterm-body">
              <span className="ork-newterm-field-label">Nome</span>
              {/* Anel de foco (overlays §4.6/§6): :focus troca a borda pro accent e acrescenta
                  --ring-focus (halo), com --spring na transição do box-shadow. */}
              <input
                ref={nameRef}
                className="ork-newterm-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setNameEdited(true)
                }}
                placeholder="Nome do terminal"
                aria-label="Nome do terminal"
              />
              <div className="ork-newterm-field">
                <span className="ork-newterm-field-label">Comando</span>
                <span className="ork-newterm-field-value">{command ?? 'shell (sem comando)'}</span>
              </div>
              <label className="ork-newterm-check">
                <input type="checkbox" checked={monitor} onChange={(e) => setMonitor(e.target.checked)} />
                <span>Monitorar atividade</span>
                <span
                  className="ork-newterm-info"
                  title="Mostra um indicador quando o agente fica ocioso e envia uma notificação do sistema se a janela não estiver em foco."
                  aria-hidden="true"
                >
                  <Icon name="Info" size={13} animation="none" />
                </span>
              </label>
              <label className="ork-newterm-check">
                <input type="checkbox" checked={maestro} onChange={(e) => setMaestro(e.target.checked)} />
                <span>Maestro</span>
                <span
                  className="ork-newterm-info"
                  title="Concede a este agente os verbos de gerência: recrutar, conectar, reatribuir e dispensar outros terminais. Sem o Modo Maestro, o Orkestra recusa esses comandos."
                  aria-hidden="true"
                >
                  <Icon name="Info" size={13} animation="none" />
                </span>
              </label>
            </div>
          ) : (
            <div className="ork-newterm-body">
              <div className="ork-newterm-field-label">Papel (opcional)</div>
              {/* Segmented deslizante (overlays §4.6/§6): thumb medido via ref, mesma receita do
                  .ork-topbar-thumb (Topbar.tsx). */}
              <div className="ork-newterm-seg">
                {roleThumb && (
                  <span
                    className="ork-newterm-seg-thumb"
                    aria-hidden="true"
                    style={{ transform: `translateX(${roleThumb.left}px)`, width: `${roleThumb.width}px` }}
                  />
                )}
                <button
                  type="button"
                  ref={(el) => {
                    roleRefs.current[ROLE_NONE_KEY] = el
                  }}
                  className={`ork-newterm-seg-item${role === '' ? ' ork-newterm-seg-item--active' : ''}`}
                  onClick={() => setRole('')}
                >
                  <span className="ork-newterm-seg-dot" style={{ background: 'var(--text-3)' }} aria-hidden="true" />
                  Sem papel
                </button>
                {PRESET_ROLES.map((r) => {
                  const active = role === r.label
                  return (
                    <button
                      key={r.id}
                      type="button"
                      ref={(el) => {
                        roleRefs.current[r.id] = el
                      }}
                      className={`ork-newterm-seg-item${active ? ' ork-newterm-seg-item--active' : ''}`}
                      style={active ? { color: r.color } : undefined}
                      onClick={() => setRole(r.label)}
                      title={r.hint}
                    >
                      <span className="ork-newterm-seg-dot" style={{ background: r.color }} aria-hidden="true" />
                      {r.label}
                    </button>
                  )
                })}
                {/* T5: papéis IMPORTADOS dos sidecars — mesma mecânica dos presets. O `prompt` deles
                    vive no registro do usuário e é resolvido no spawn (main), não aqui. */}
                {imported.map((r) => {
                  const active = role === r.name
                  const k = importedRoleKey(r.name)
                  return (
                    <button
                      key={k}
                      type="button"
                      ref={(el) => {
                        roleRefs.current[k] = el
                      }}
                      className={`ork-newterm-seg-item${active ? ' ork-newterm-seg-item--active' : ''}`}
                      style={active ? { color: r.color } : undefined}
                      onClick={() => setRole(r.name)}
                      title={r.prompt}
                    >
                      <span className="ork-newterm-seg-dot" style={{ background: r.color }} aria-hidden="true" />
                      {r.name}
                    </button>
                  )
                })}
              </div>
              {/* T5 — porta de entrada da descoberta: varre os sidecars dos agentes e importa os
                  papéis escolhidos, que voltam já no segmented acima. */}
              <button type="button" className="ork-btn ork-btn--ghost" onClick={() => setDiscovering(true)}>
                <Icon name="Search" size={14} animation="none" />
                Descobrir Responsabilidades
              </button>
            </div>
          )}
        </div>

        <div className="ork-newterm-actions">
          <button type="button" className="ork-btn ork-btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="ork-btn ork-btn--primary" onClick={create}>
            <Icon name="Plus" size={15} animation="none" />
            Criar terminal
          </button>
        </div>
      </div>
      {/* T5 — IRMÃO do card, não filho: o card tem backdrop-filter, que vira bloco de contenção para
          descendentes `position: fixed`; lá dentro o overlay da descoberta deixaria de cobrir a
          janela. Fica dentro do backdrop (que não filtra nada) e depois do card na ordem do DOM, então
          empilha por cima. O próprio RoleDiscoveryModal barra a propagação de click/Esc para não
          fechar este modal junto. */}
      {discovering && (
        <RoleDiscoveryModal onClose={() => setDiscovering(false)} onImported={(next) => setImported(next)} />
      )}
    </div>
  )
}
