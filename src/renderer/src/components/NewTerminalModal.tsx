import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react'
import { PRESETS, presetById } from '../../../shared/presets'
import { PRESET_ROLES } from '../../../shared/roles'
import type { RoleSidecar } from '../../../shared/roleSidecar'
import { useCanvasStore } from '../store/canvasStore'
import { Icon } from './Icon'
import { RoleDiscoveryModal } from './RoleDiscoveryModal'
import './NewTerminalModal.css'

/** Ícone de cada preset — mapeia o id para um ícone do Lucide (nada de logotipos de terceiros).
 * Preset desconhecido cai no genérico "Bot". */
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

// Opção de papel normalizada para a grade de chips (Aparência). `value` é o que grava em data.role
// ('' = sem papel); `color` alimenta o dot e o tint do chip selecionado (via --role-color); `hint` é
// a explicação de uma linha mostrada abaixo da grade. Papéis IMPORTADOS (T5) entram como chips iguais
// aos presets — o `prompt` deles vive no registro do usuário e é resolvido no spawn (main), não aqui.
type RoleChoice = { key: string; label: string; value: string; color: string; hint: string }

const NONE_ROLE: RoleChoice = {
  key: 'none',
  label: 'Sem papel',
  value: '',
  color: 'var(--accent)',
  hint: 'O terminal começa sem um papel definido.'
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
  // T5: papéis IMPORTADOS (registro ~/.orkestra/roles.json) entram na grade ao lado dos presets.
  const [imported, setImported] = useState<RoleSidecar[]>([])
  const [discovering, setDiscovering] = useState(false)

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])

  // Carrega o registro ao abrir (best-effort no main; falhar só significa grade sem importados).
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

  // Grade de papéis (Aparência): "Sem papel" + presets + importados, todos VISÍVEIS (quebram linha),
  // no lugar do antigo segmented de largura fixa que cortava opções com 6+ papéis.
  const roleChoices: RoleChoice[] = [
    NONE_ROLE,
    ...PRESET_ROLES.map((r) => ({ key: r.id, label: r.label, value: r.label, color: r.color, hint: r.hint })),
    ...imported.map((r) => ({
      key: `imp:${r.name.trim().toLowerCase()}`,
      label: r.name,
      value: r.name,
      color: r.color,
      hint: r.prompt
    }))
  ]
  const selectedRole = roleChoices.find((c) => c.value === role) ?? NONE_ROLE

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
                aria-pressed={preset === p.id}
                className={`ork-newterm-preset${preset === p.id ? ' ork-newterm-preset--active' : ''}`}
                onClick={() => selectPreset(p.id)}
              >
                <PresetIcon id={p.id} />
                <span className="ork-newterm-preset-label">{p.label}</span>
              </button>
            ))}
          </div>

          <div className="ork-newterm-divider" />

          <div className="ork-newterm-tabs" role="tablist" aria-label="Configuração do terminal">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'details'}
              className={`ork-newterm-tab${tab === 'details' ? ' ork-newterm-tab--active' : ''}`}
              onClick={() => setTab('details')}
            >
              Detalhes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'appearance'}
              className={`ork-newterm-tab${tab === 'appearance' ? ' ork-newterm-tab--active' : ''}`}
              onClick={() => setTab('appearance')}
            >
              Aparência
            </button>
          </div>

          {tab === 'details' ? (
            <div className="ork-newterm-body" key="details">
              <span className="ork-newterm-field-label">Nome</span>
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

              <div className="ork-newterm-divider ork-newterm-divider--tight" />

              <div className="ork-newterm-options">
                <label className="ork-newterm-option">
                  <input
                    type="checkbox"
                    checked={monitor}
                    onChange={(e) => setMonitor(e.target.checked)}
                    aria-describedby="opt-monitor-desc"
                  />
                  <span className="ork-newterm-option-text">
                    <span className="ork-newterm-option-title">Monitorar atividade</span>
                    <span className="ork-newterm-option-desc" id="opt-monitor-desc">
                      Sinaliza quando o agente fica ocioso e notifica se a janela não estiver em foco.
                    </span>
                  </span>
                </label>
                <label className="ork-newterm-option">
                  <input
                    type="checkbox"
                    checked={maestro}
                    onChange={(e) => setMaestro(e.target.checked)}
                    aria-describedby="opt-maestro-desc"
                  />
                  <span className="ork-newterm-option-text">
                    <span className="ork-newterm-option-title">Maestro</span>
                    <span className="ork-newterm-option-desc" id="opt-maestro-desc">
                      Concede os verbos de gerência — recrutar, conectar, reatribuir e dispensar terminais.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          ) : (
            <div className="ork-newterm-body" key="appearance">
              <span className="ork-newterm-field-label" id="role-grid-label">
                Papel (opcional)
              </span>
              {/* Grade de chips que QUEBRA LINHA — todos os papéis visíveis (sem scroll horizontal). */}
              <div className="ork-newterm-roles" role="radiogroup" aria-labelledby="role-grid-label">
                {roleChoices.map((c) => {
                  const active = c.value === role
                  return (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`ork-newterm-role${active ? ' ork-newterm-role--active' : ''}`}
                      style={{ '--role-color': c.color } as CSSProperties}
                      onClick={() => setRole(c.value)}
                    >
                      <span
                        className="ork-newterm-role-dot"
                        style={{ background: c.value === '' && !active ? 'var(--text-3)' : c.color }}
                        aria-hidden="true"
                      />
                      {c.label}
                    </button>
                  )
                })}
              </div>
              {/* Dica do papel selecionado, inline (substitui o tooltip nativo lento do segmented). */}
              <p className="ork-newterm-role-hint">{selectedRole.hint}</p>
              {/* T5 — porta de entrada da descoberta: varre os sidecars e importa papéis escolhidos,
                  que voltam já na grade acima. */}
              <button
                type="button"
                className="ork-btn ork-btn--ghost ork-newterm-discover"
                onClick={() => setDiscovering(true)}
              >
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
      {/* T5 — IRMÃO do card, não filho: o card tem backdrop-filter (bloco de contenção p/ position:fixed).
          Fica dentro do backdrop e depois do card no DOM, então empilha por cima. */}
      {discovering && (
        <RoleDiscoveryModal onClose={() => setDiscovering(false)} onImported={(next) => setImported(next)} />
      )}
    </div>
  )
}
