import { useEffect, useRef, useState, type JSX } from 'react'
import { PRESETS, presetById } from '../../../shared/presets'
import { PRESET_ROLES, roleMeta } from '../../../shared/roles'
import { useCanvasStore } from '../store/canvasStore'
import { Icon } from './Icon'
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
                <Icon name="Info" size={13} animation="none" />
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
