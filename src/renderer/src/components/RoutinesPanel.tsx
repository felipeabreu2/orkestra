import { useEffect, useState } from 'react'
import type { Routine } from '../../../shared/routines'
import './panels.css'

// Painel de rotinas (Fase 10): agenda comandos via cron que disparam num terminal existente
// (RoutineScheduler no main, tick a cada 30s — disparo pode levar até ~1min). CRUD via
// window.orkestra.routines. add() (Task 2) valida name/schedule/target/command como strings
// não-vazias e LANÇA em campo inválido — toda chamada que pode rejeitar é envolvida em
// try/catch com uma linha de erro amigável, nunca deixamos uma rejeição de IPC estourar pro
// React e derrubar o canvas (mesmo padrão do FloorsPanel). Estilo aplicado na Fase 13 (ver
// panels.css, classe .ork-field para os campos do formulário abaixo).
const emptyForm = { name: '', schedule: '', target: '', command: '' }

export function RoutinesPanel(): JSX.Element {
  const [routines, setRoutines] = useState<Routine[]>([])
  const [form, setForm] = useState(emptyForm)
  const [status, setStatus] = useState<string>('')
  const [statusKind, setStatusKind] = useState<'ok' | 'err' | ''>('')

  const refresh = async (): Promise<void> => {
    setRoutines(await window.orkestra.routines.list())
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleCreate = async (): Promise<void> => {
    try {
      // Deixa a validação de fato para add() (RoutineScheduler): se algum campo estiver
      // vazio/ausente, a promise rejeita e caímos no catch abaixo em vez de criar uma rotina
      // quebrada — nunca dispara silenciosamente com um schedule/target/command inválido.
      await window.orkestra.routines.add({ ...form, enabled: true })
      setForm(emptyForm)
      setStatus('')
      setStatusKind('')
      await refresh()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
      setStatusKind('err')
    }
  }

  const handleToggle = async (r: Routine): Promise<void> => {
    try {
      await window.orkestra.routines.toggle(r.id, !r.enabled)
      await refresh()
      setStatus('')
      setStatusKind('')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
      setStatusKind('err')
    }
  }

  const handleRemove = async (id: string): Promise<void> => {
    try {
      await window.orkestra.routines.remove(id)
      await refresh()
      setStatus('')
      setStatusKind('')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
      setStatusKind('err')
    }
  }

  return (
    <div className="ork-panel ork-panel--routines">
      <div className="ork-panel-header">
        <span className="ork-panel-title">Rotinas</span>
      </div>
      <div className="ork-panel-form">
        <input
          className="ork-field"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nome"
          aria-label="Nome da rotina"
        />
        <input
          className="ork-field"
          value={form.schedule}
          onChange={(e) => setForm({ ...form, schedule: e.target.value })}
          placeholder="Cron (ex: */5 * * * *)"
          aria-label="Agendamento cron da rotina"
        />
        <input
          className="ork-field"
          value={form.target}
          onChange={(e) => setForm({ ...form, target: e.target.value })}
          placeholder="Alvo (nome do terminal)"
          aria-label="Terminal alvo da rotina"
        />
        <input
          className="ork-field"
          value={form.command}
          onChange={(e) => setForm({ ...form, command: e.target.value })}
          placeholder="Comando"
          aria-label="Comando da rotina"
        />
        <button className="ork-panel-primary-btn" onClick={handleCreate}>
          + Criar rotina
        </button>
      </div>
      {status && (
        <div
          className="ork-panel-status"
          style={{ color: statusKind === 'ok' ? 'var(--ok)' : statusKind === 'err' ? 'var(--err)' : 'var(--warn)' }}
        >
          {status}
        </div>
      )}
      <div className="ork-panel-body">
        {routines.length === 0 && <div className="ork-panel-empty">Nenhuma rotina</div>}
        {routines.map((r) => (
          <div key={r.id} className="ork-panel-row" style={{ opacity: r.enabled ? 1 : 0.5 }}>
            <div className="ork-panel-row-main">
              <div className="ork-panel-row-title">{r.name}</div>
              <div className="ork-panel-row-sub">
                {r.schedule} → {r.target}
              </div>
            </div>
            <div className="ork-panel-row-actions">
              <button
                className={`ork-panel-action ${r.enabled ? 'ork-panel-action--ok' : 'ork-panel-action--muted'}`}
                onClick={() => handleToggle(r)}
                aria-label={`${r.enabled ? 'Desabilitar' : 'Habilitar'} ${r.name}`}
              >
                {r.enabled ? 'On' : 'Off'}
              </button>
              <button
                className="ork-panel-action ork-panel-action--danger"
                onClick={() => handleRemove(r.id)}
                aria-label={`Remover ${r.name}`}
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
