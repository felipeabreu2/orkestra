import { useEffect, useRef, useState } from 'react'
import type { Floor } from '../../../shared/floors'
import './panels.css'

// Painel de floors (Fase 8): cria/lista/aterrissa/remove worktrees isolados via
// window.orkestra.floors. Toda chamada que pode rejeitar (create quando o diretório
// escolhido não é um repo git; land/remove em erro de disco/git) é envolvida em
// try/catch — nunca deixamos uma rejeição de IPC estourar pro React e derrubar o canvas.
// Estilo mínimo (polish é Fase 13).

// Janela de confirmação inline do "Remover" (Fase 13) — ver handleRemoveClick.
const REMOVE_CONFIRM_MS = 3000

export function FloorsPanel(): JSX.Element {
  const [floors, setFloors] = useState<Floor[]>([])
  const [status, setStatus] = useState<string>('')
  const [statusKind, setStatusKind] = useState<'ok' | 'err' | ''>('')
  // Id do floor com remoção pendente de confirmação (2º clique em "Confirmar?" de fato
  // remove) — null quando nenhuma remoção está pendente (Fase 13).
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = async (): Promise<void> => {
    setFloors(await window.orkestra.floors.list())
  }

  useEffect(() => {
    refresh()
  }, [])

  const cancelConfirmTimer = (): void => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = null
    }
  }

  // Clicar fora do botão "Confirmar?" pendente cancela a confirmação — mousedown (não click)
  // dispara antes do click do alvo, então um clique em OUTRO botão (ex.: "Remover" de outro
  // floor) já vê confirmingId limpo e trata como 1º clique, não como confirmação (Fase 13).
  useEffect(() => {
    if (!confirmingId) return undefined
    const handlePointerDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      if (target?.closest(`[data-remove-id="${confirmingId}"]`)) return
      cancelConfirmTimer()
      setConfirmingId(null)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [confirmingId])

  // Limpa o timer pendente se o componente desmontar com uma confirmação em aberto.
  useEffect(() => cancelConfirmTimer, [])

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
        setStatusKind('')
        await refresh()
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
      setStatusKind('err')
    }
  }

  const handleLand = async (id: string): Promise<void> => {
    try {
      const r = await window.orkestra.floors.land(id)
      if (r.ok) {
        setStatus('aterrissado')
        setStatusKind('ok')
      } else {
        setStatus(`conflito: ${r.output}`)
        setStatusKind('err')
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
      setStatusKind('err')
    }
  }

  const handleRemove = async (id: string): Promise<void> => {
    try {
      await window.orkestra.floors.remove(id)
      await refresh()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
      setStatusKind('err')
    }
  }

  // Remover descarta o worktree com --force (FloorManager.remove) — perda real se houver
  // trabalho não-commitado. Em vez de window.confirm (bloqueia o processo), confirmação
  // inline: 1º clique só arma confirmingId e troca o label pra "Confirmar?"; um 2º clique
  // dentro de REMOVE_CONFIRM_MS remove de fato; timeout ou clique fora cancela (Fase 13).
  const handleRemoveClick = (id: string): void => {
    if (confirmingId === id) {
      cancelConfirmTimer()
      setConfirmingId(null)
      void handleRemove(id)
      return
    }
    cancelConfirmTimer()
    setConfirmingId(id)
    confirmTimerRef.current = setTimeout(() => {
      confirmTimerRef.current = null
      setConfirmingId(null)
    }, REMOVE_CONFIRM_MS)
  }

  return (
    <div className="ork-panel ork-panel--floors">
      <div className="ork-panel-header">
        <span className="ork-panel-title">Floors</span>
        <button className="ork-panel-primary-btn" onClick={handleCreate}>
          + Criar floor
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
        {floors.length === 0 && (
          <div className="ork-panel-empty">
            <div className="ork-panel-empty-title">Nenhum floor ainda</div>
            <div className="ork-panel-empty-hint">Crie um a partir de um repositório git</div>
          </div>
        )}
        {floors.map((f) => (
          <div key={f.id} className="ork-panel-row">
            <div className="ork-panel-row-main">
              <div className="ork-panel-row-title">{f.name}</div>
              <div className="ork-panel-row-sub">{f.branch}</div>
            </div>
            <div className="ork-panel-row-actions">
              <button
                className="ork-panel-action ork-panel-action--ok"
                onClick={() => handleLand(f.id)}
                aria-label={`Aterrissar ${f.name}`}
                title="Aterrissar (merge) de volta"
              >
                Land
              </button>
              <button
                className={`ork-panel-action ork-panel-action--danger${confirmingId === f.id ? ' ork-panel-action--armed' : ''}`}
                onClick={() => handleRemoveClick(f.id)}
                data-remove-id={f.id}
                aria-label={confirmingId === f.id ? `Confirmar remoção de ${f.name}` : `Remover ${f.name}`}
                title={confirmingId === f.id ? 'Clique novamente para confirmar' : 'Remover (descarta o worktree)'}
              >
                {confirmingId === f.id ? 'Confirmar?' : 'Remover'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
