import { useEffect, useState } from 'react'
import type { Floor } from '../../../shared/floors'

// Painel de floors (Fase 8): cria/lista/aterrissa/remove worktrees isolados via
// window.orkestra.floors. Toda chamada que pode rejeitar (create quando o diretório
// escolhido não é um repo git; land/remove em erro de disco/git) é envolvida em
// try/catch — nunca deixamos uma rejeição de IPC estourar pro React e derrubar o canvas.
// Estilo mínimo (polish é Fase 13).
export function FloorsPanel(): JSX.Element {
  const [floors, setFloors] = useState<Floor[]>([])
  const [status, setStatus] = useState<string>('')

  const refresh = async (): Promise<void> => {
    setFloors(await window.orkestra.floors.list())
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleCreate = async (): Promise<void> => {
    const name = window.prompt('Nome do floor:')
    if (!name || !name.trim()) return
    try {
      // create() resolve null se o usuário cancelar o diálogo de diretório nativo — não é
      // erro, apenas nada a fazer. Se o diretório escolhido não for um repo git, a promise
      // rejeita (FloorManager.create) e cai no catch abaixo.
      const floor = await window.orkestra.floors.create(name.trim())
      if (floor) {
        setStatus('')
        await refresh()
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  const handleLand = async (id: string): Promise<void> => {
    try {
      const r = await window.orkestra.floors.land(id)
      setStatus(r.ok ? 'aterrissado' : `conflito: ${r.output}`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRemove = async (id: string): Promise<void> => {
    try {
      await window.orkestra.floors.remove(id)
      await refresh()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        width: 220,
        maxHeight: '60vh',
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          borderBottom: '1px solid #333'
        }}
      >
        <span style={{ fontWeight: 600 }}>Floors</span>
        <button
          onClick={handleCreate}
          style={{
            padding: '3px 8px',
            background: '#1633f9',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          + Criar floor
        </button>
      </div>
      {status && (
        <div style={{ padding: '4px 8px', color: '#eab308', fontSize: 11, wordBreak: 'break-word' }}>
          {status}
        </div>
      )}
      <div style={{ overflowY: 'auto', padding: 4 }}>
        {floors.length === 0 && (
          <div style={{ padding: '6px 4px', color: '#8a8a8a' }}>Nenhum floor</div>
        )}
        {floors.map((f) => (
          <div
            key={f.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
              padding: '4px',
              borderBottom: '1px solid #2d2d2d'
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name}
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
                {f.branch}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => handleLand(f.id)}
                aria-label={`Aterrissar ${f.name}`}
                style={{
                  padding: '2px 6px',
                  background: 'transparent',
                  color: '#4ade80',
                  border: '1px solid #333',
                  borderRadius: 4,
                  fontSize: 11,
                  cursor: 'pointer'
                }}
              >
                Land
              </button>
              <button
                onClick={() => handleRemove(f.id)}
                aria-label={`Remover ${f.name}`}
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
