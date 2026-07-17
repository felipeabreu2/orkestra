import { useEffect, useState, type JSX } from 'react'
import type { RoleSidecar } from '../../../shared/roleSidecar'
import type { DiscoveredRole } from '../../../shared/discoverRoles'
import { Icon } from './Icon'
import './NewTerminalModal.css'
import './RoleDiscoveryModal.css'

// T5 — "Descobrir Responsabilidades". Lista os papéis achados nos sidecars dos agentes
// (~/.orkestra/agents/*/role.json — a varredura vive no main, o renderer não toca em `fs`), mostra a
// PRÉVIA do prompt de cada um e importa os SELECIONADOS para o registro do usuário.
//
// O que aparece aqui: só o que é importável de verdade — papel que ainda não é preset (o main já
// marca `status:'preset'` e recusa importar) e que ainda não está importado. Papel LIVRE (sidecar com
// prompt vazio) nem chega: a descoberta é sobre trazer CONFIGURAÇÃO, e "importar" um nome sem prompt
// seria indistinguível de digitá-lo na paleta.
//
// Fonte prática destes papéis: um agente que refinou o próprio papel (`orq role write`, T4) ou um
// sidecar vindo de outra máquina/checkout.
export function RoleDiscoveryModal({
  onClose,
  onImported
}: {
  onClose: () => void
  onImported: (imported: RoleSidecar[]) => void
}): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [discovered, setDiscovered] = useState<DiscoveredRole[]>([])
  const [imported, setImported] = useState<RoleSidecar[]>([])
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let alive = true
    void window.orkestra.roles.discover().then((res) => {
      if (!alive) return
      setDiscovered(res.discovered)
      setImported(res.imported)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  const key = (name: string): string => name.trim().toLowerCase()
  const importedKeys = new Set(imported.map((r) => key(r.name)))
  // Importáveis = novos (não-preset) que ainda não estão no registro. Os demais descobertos são
  // ruído para esta tela (já existem no app) — viram só a contagem do rodapé.
  const importable = discovered.filter((d) => d.status === 'new' && !importedKeys.has(key(d.sidecar.name)))
  const already = discovered.length - importable.length
  const selected = importable.filter((d) => checked[key(d.sidecar.name)]).map((d) => d.sidecar)

  const doImport = (): void => {
    if (selected.length === 0) return
    void window.orkestra.roles.import(selected).then((next) => {
      onImported(next)
      onClose()
    })
  }

  return (
    // stopPropagation no backdrop e no Esc: esta tela abre POR CIMA do modal "Novo Terminal" e é
    // filha do backdrop dele — sem barrar a propagação, fechar a descoberta fecharia os dois.
    <div
      className="ork-modal-backdrop"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div
        className="ork-modal-card ork-newterm ork-rolediscover"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Descobrir Responsabilidades"
      >
        <div className="ork-newterm-head">
          <span className="ork-newterm-head-icon" aria-hidden="true">
            <Icon name="Search" size={14} animation="none" />
          </span>
          <h2 className="ork-newterm-head-title">Descobrir Responsabilidades</h2>
          <button type="button" className="ork-newterm-close" onClick={onClose} aria-label="Fechar">
            <Icon name="X" size={16} animation="none" />
          </button>
        </div>

        <div className="ork-newterm-content">
          {loading ? (
            <p className="ork-rolediscover-empty">Procurando papéis…</p>
          ) : importable.length === 0 ? (
            <p className="ork-rolediscover-empty">
              Nenhum papel novo para importar. Papéis aparecem aqui quando um agente refina o próprio papel
              (<code>orq role write</code>) ou quando um <code>role.json</code> de outra máquina chega em{' '}
              <code>~/.orkestra/agents/</code>.
            </p>
          ) : (
            <ul className="ork-rolediscover-list">
              {importable.map((d) => {
                const k = key(d.sidecar.name)
                return (
                  <li key={k} className="ork-rolediscover-item">
                    <label className="ork-rolediscover-row">
                      <input
                        type="checkbox"
                        checked={!!checked[k]}
                        onChange={(e) => setChecked((c) => ({ ...c, [k]: e.target.checked }))}
                      />
                      <span
                        className="ork-newterm-seg-dot"
                        style={{ background: d.sidecar.color }}
                        aria-hidden="true"
                      />
                      <span className="ork-rolediscover-name">{d.sidecar.name}</span>
                    </label>
                    {/* Prévia do prompt — é o que o agente vai receber (ORKESTRA_ROLE). */}
                    <p className="ork-rolediscover-preview">{d.sidecar.prompt}</p>
                  </li>
                )
              })}
            </ul>
          )}
          {already > 0 && (
            <p className="ork-rolediscover-note">
              {already} papel(is) encontrado(s) já disponível(is) no app — não serão duplicados.
            </p>
          )}
        </div>

        <div className="ork-newterm-actions">
          <button type="button" className="ork-btn ork-btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="ork-btn ork-btn--primary"
            onClick={doImport}
            disabled={selected.length === 0}
          >
            <Icon name="Download" size={15} animation="none" />
            Importar{selected.length > 0 ? ` (${selected.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
