import { useEffect, useState, type CSSProperties } from 'react'
import type { Routine } from '../../../shared/routines'

// Painel de rotinas (Fase 10): agenda comandos via cron que disparam num terminal existente
// (RoutineScheduler no main, tick a cada 30s — disparo pode levar até ~1min). CRUD via
// window.orkestra.routines. add() (Task 2) valida name/schedule/target/command como strings
// não-vazias e LANÇA em campo inválido — toda chamada que pode rejeitar é envolvida em
// try/catch com uma linha de erro amigável, nunca deixamos uma rejeição de IPC estourar pro
// React e derrubar o canvas (mesmo padrão do FloorsPanel). Estilo mínimo (polish é Fase 13).
const emptyForm = { name: '', schedule: '', target: '', command: '' }

const inputStyle: CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #3a3a3a',
  borderRadius: 4,
  color: '#cccccc',
  fontSize: 12,
  padding: '4px 6px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box'
}

export function RoutinesPanel(): JSX.Element {
  const [routines, setRoutines] = useState<Routine[]>([])
  const [form, setForm] = useState(emptyForm)
  const [status, setStatus] = useState<string>('')

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
      await refresh()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  const handleToggle = async (r: Routine): Promise<void> => {
    try {
      await window.orkestra.routines.toggle(r.id, !r.enabled)
      await refresh()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRemove = async (id: string): Promise<void> => {
    try {
      await window.orkestra.routines.remove(id)
      await refresh()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        zIndex: 10,
        width: 260,
        maxHeight: '55vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        border: '1px solid #333',
        borderRadius: 6,
        color: '#cccccc',
        fontSize: 12,
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          padding: '6px 8px',
          borderBottom: '1px solid #333',
          fontWeight: 600
        }}
      >
        Rotinas
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: 8,
          borderBottom: '1px solid #333'
        }}
      >
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nome"
          aria-label="Nome da rotina"
          style={inputStyle}
        />
        <input
          value={form.schedule}
          onChange={(e) => setForm({ ...form, schedule: e.target.value })}
          placeholder="Cron (ex: */5 * * * *)"
          aria-label="Agendamento cron da rotina"
          style={inputStyle}
        />
        <input
          value={form.target}
          onChange={(e) => setForm({ ...form, target: e.target.value })}
          placeholder="Alvo (nome do terminal)"
          aria-label="Terminal alvo da rotina"
          style={inputStyle}
        />
        <input
          value={form.command}
          onChange={(e) => setForm({ ...form, command: e.target.value })}
          placeholder="Comando"
          aria-label="Comando da rotina"
          style={inputStyle}
        />
        <button
          onClick={handleCreate}
          style={{
            padding: '4px 8px',
            background: '#1633f9',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          + Criar rotina
        </button>
      </div>
      {status && (
        <div style={{ padding: '4px 8px', color: '#eab308', fontSize: 11, wordBreak: 'break-word' }}>
          {status}
        </div>
      )}
      <div style={{ overflowY: 'auto', padding: 4 }}>
        {routines.length === 0 && (
          <div style={{ padding: '6px 4px', color: '#8a8a8a' }}>Nenhuma rotina</div>
        )}
        {routines.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
              padding: '4px',
              borderBottom: '1px solid #2d2d2d',
              opacity: r.enabled ? 1 : 0.5
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
              </div>
              <div
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: '#8a8a8a',
                  fontSize: 10
                }}
              >
                {r.schedule} → {r.target}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => handleToggle(r)}
                aria-label={`${r.enabled ? 'Desabilitar' : 'Habilitar'} ${r.name}`}
                style={{
                  padding: '2px 6px',
                  background: 'transparent',
                  color: r.enabled ? '#4ade80' : '#8a8a8a',
                  border: '1px solid #333',
                  borderRadius: 4,
                  fontSize: 11,
                  cursor: 'pointer'
                }}
              >
                {r.enabled ? 'On' : 'Off'}
              </button>
              <button
                onClick={() => handleRemove(r.id)}
                aria-label={`Remover ${r.name}`}
                style={{
                  padding: '2px 6px',
                  background: 'transparent',
                  color: '#f87171',
                  border: '1px solid #333',
                  borderRadius: 4,
                  fontSize: 11,
                  cursor: 'pointer'
                }}
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
