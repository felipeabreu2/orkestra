import { useEffect, useRef, useState, type JSX } from 'react'
import { PRESETS, presetById } from '../../../shared/presets'
import { PRESET_ROLES, roleMeta } from '../../../shared/roles'
import { useCanvasStore } from '../store/canvasStore'
import './NewTerminalModal.css'

/** Ícones próprios (geométricos) para cada preset — nada de logotipos de terceiros. */
function PresetIcon({ id }: { id: string }): JSX.Element {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  }
  switch (id) {
    case 'shell':
      return (
        <svg {...common}>
          <path d="M5 16l4-4-4-4" />
          <line x1="12" y1="17" x2="19" y2="17" />
        </svg>
      )
    case 'claude':
      return (
        <svg {...common}>
          <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" />
        </svg>
      )
    case 'codex':
      return (
        <svg {...common}>
          <path d="M9 7l-4 5 4 5" />
          <path d="M15 7l4 5-4 5" />
        </svg>
      )
    case 'gemini':
      return (
        <svg {...common}>
          <path d="M12 3l7 9-7 9-7-9z" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      )
  }
}

export function NewTerminalModal({ onClose }: { onClose: () => void }): JSX.Element {
  const addTerminalNode = useCanvasStore((s) => s.addTerminalNode)
  const [preset, setPreset] = useState('shell')
  const [name, setName] = useState(presetById('shell')?.label ?? 'Terminal')
  const [nameEdited, setNameEdited] = useState(false)
  const [tab, setTab] = useState<'details' | 'appearance'>('details')
  const [monitor, setMonitor] = useState(true)
  const [role, setRole] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
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
      role: role || undefined
    })
    onClose()
  }

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
        <h2 className="ork-newterm-title">Novo Terminal</h2>

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
                ⓘ
              </span>
            </label>
          </div>
        ) : (
          <div className="ork-newterm-body">
            <div className="ork-newterm-field-label">Papel (opcional)</div>
            <div className="ork-newterm-roles">
              <button
                type="button"
                className={`ork-newterm-role${role === '' ? ' ork-newterm-role--active' : ''}`}
                onClick={() => setRole('')}
              >
                Sem papel
              </button>
              {PRESET_ROLES.map((r) => {
                const active = role === r.label
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`ork-newterm-role${active ? ' ork-newterm-role--active' : ''}`}
                    style={active ? { color: roleMeta(r.label).color, borderColor: roleMeta(r.label).color } : undefined}
                    onClick={() => setRole(r.label)}
                    title={r.hint}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="ork-newterm-actions">
          <button type="button" className="ork-btn ork-btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="ork-btn ork-btn--primary" onClick={create}>
            Criar
          </button>
        </div>
      </div>
    </div>
  )
}
