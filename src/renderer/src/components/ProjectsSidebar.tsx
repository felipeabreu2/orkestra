import { useEffect, useRef, useState } from 'react'
import type { Project } from '../../../shared/project'
import { useCanvasStore } from '../store/canvasStore'
import { basename } from '../ui/paths'
import { NEW_PROJECT_EVENT } from '../ui/appEvents'
import { ThemeToggle } from './ThemeToggle'
import { Icon } from './Icon'
import './ProjectsSidebar.css'

// Menu esquerdo de projetos (Fase 15 Task 3): cada projeto tem seu próprio canvas persistido
// (ver ProjectManager no main, Fase 15 Task 2) — esta barra lista/cria/renomeia/remove projetos
// e troca o canvas montado no meio da tela. Toda chamada a window.orkestra.projects.* pode
// rejeitar (IPC/disco) e é envolvida em try/catch (nunca deixamos uma
// rejeição estourar pro React e derrubar o canvas). Estilo mínimo, consistente com os tokens.
//
// Redesenho (2026-07-14, pedido do usuário via mockup): header com + / ocultar, campo de filtro,
// grupo colapsável (um grupo visual por ora — grupos reais são um passo seguinte), linhas com
// badge de nº de terminais, rodapé com "Grupo" (em breve) + tema. Minimizada = OCULTA por completo.

// Janela de confirmação inline do "Remover" (Fase 13).
const REMOVE_CONFIRM_MS = 3000

// Fase 18 (Task 4): conjunto curado e pequeno de emojis comuns pro seletor de ícone — além
// destes, o input de texto livre aceita qualquer emoji colado.
const ICON_CHOICES = ['📁', '💻', '🌐', '🧪', '🚀', '📦', '🔧', '🎨', '📝', '⚙️']

// Fase 18 (Task 4): fallback visual quando o projeto não tem `icon` — 1ª letra do nome (maiúscula)
// num chip pequeno.
function initialOf(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed[0]!.toUpperCase() : '?'
}

// Conteúdo do "chip" de ícone — emoji do projeto se houver, senão a inicial do nome.
function ProjectIconGlyph({ p }: { p: Project }): JSX.Element {
  return p.icon ? (
    <span aria-hidden="true">{p.icon}</span>
  ) : (
    <span className="ork-sidebar-icon-fallback" aria-hidden="true">
      {initialOf(p.name)}
    </span>
  )
}

export function ProjectsSidebar(): JSX.Element | null {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [error, setError] = useState<string>('')
  // Id do projeto com rename inline em edição (null = nenhum) — duplo-clique numa linha arma.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState<string>('')
  // Id do projeto com remoção pendente de confirmação (2º clique em "Confirmar?" remove de fato).
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  // Evita disparar duas trocas de projeto concorrentes (duplo-clique numa linha ainda não ativa).
  const switchingRef = useRef(false)
  // Onda 1 (F01): colapso da sidebar é fonte única no canvasStore (persistido em ui/sidebarCollapsed),
  // compartilhado com a Topbar (botão de painel). Colapsar agora = OCULTAR por completo (ver o
  // `if (collapsed) return null` abaixo); reabrir é pelo botão "Exibir menu lateral" da Topbar.
  const collapsed = useCanvasStore((s) => s.sidebarCollapsed)
  const toggleCollapsed = useCanvasStore((s) => s.toggleSidebar)
  // Badge de terminais do projeto ATIVO ao vivo (o store reflete o canvas montado). Primitivo
  // (number) — zustand compara por Object.is, então não re-renderiza quando a contagem não muda.
  const liveActiveTerminals = useCanvasStore((s) => s.nodes.filter((n) => n.type === 'terminal').length)
  // Id do projeto com o seletor de ícone aberto (null = nenhum).
  const [iconPickerId, setIconPickerId] = useState<string | null>(null)
  const [customIcon, setCustomIcon] = useState<string>('')
  // Redesenho: filtro de projetos por nome; colapso (cosmético) do grupo; contagem de terminais
  // por projeto lida do disco (o ativo é sobreposto pela contagem ao vivo acima).
  const [filter, setFilter] = useState<string>('')
  const [groupOpen, setGroupOpen] = useState<boolean>(true)
  const [counts, setCounts] = useState<Record<string, number>>({})

  const refreshCounts = async (): Promise<void> => {
    try {
      setCounts(await window.orkestra.projects.terminalCounts())
    } catch {
      /* badge é cosmético — falha de contagem não vira erro visível */
    }
  }

  const refresh = async (): Promise<void> => {
    try {
      const idx = await window.orkestra.projects.list()
      setProjects(idx.projects)
      setActiveId(idx.activeId)
      await refreshCounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  // Fase 30: mantém o cwd do projeto ativo no store para a barra superior do canvas exibir.
  useEffect(() => {
    const active = projects.find((p) => p.id === activeId)
    useCanvasStore.getState().setActiveCwd(active?.cwd ?? null)
  }, [activeId, projects])

  const cancelConfirmTimer = (): void => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = null
    }
  }

  // Clicar fora do botão "Confirmar?" pendente cancela a confirmação (mousedown antes do click).
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

  // Clicar fora do seletor de ícone aberto fecha o popover sem trocar o ícone.
  useEffect(() => {
    if (!iconPickerId) return undefined
    const handlePointerDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      if (target?.closest(`[data-icon-picker-id="${iconPickerId}"]`)) return
      setIconPickerId(null)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [iconPickerId])

  useEffect(() => cancelConfirmTimer, [])

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  // Núcleo compartilhado por clique-na-linha e por "+ Novo projeto": salva (flush) o canvas do
  // projeto que está SAINDO por id EXPLÍCITO (do store: activeProjectId), aguarda, e só então
  // troca o ativo no main e hidrata o canvas do projeto recém-ativado. Ver notas de risco do brief.
  const switchTo = async (id: string): Promise<void> => {
    if (switchingRef.current) return
    switchingRef.current = true
    useCanvasStore.getState().setSwitching(true)
    try {
      const fromId = useCanvasStore.getState().activeProjectId
      if (fromId) {
        await window.orkestra.projects.saveCanvas(fromId, useCanvasStore.getState().serialize())
      }
      const snap = await window.orkestra.projects.switch(id)
      if (snap === null) {
        setError('Projeto não existe mais — lista atualizada.')
        await refresh()
        return
      }
      useCanvasStore.getState().hydrate(snap, id)
      setActiveId(id)
      setError('')
      await refreshCounts() // reflete a contagem do projeto que acabou de sair (já flushado) e do novo
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      switchingRef.current = false
      useCanvasStore.getState().setSwitching(false)
    }
  }

  const handleRowClick = (id: string): void => {
    if (id === activeId) return // no-op: re-hidratar o mesmo canvas mataria terminais vivos por nada
    void switchTo(id)
  }

  const handleCreate = async (): Promise<void> => {
    try {
      const cwd = await window.orkestra.projects.pickDirectory()
      if (!cwd) return
      const name = basename(cwd)
      const project = await window.orkestra.projects.create(name, cwd)
      await refresh()
      await switchTo(project.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Onda 1 (F01): o "+" da Topbar reusa exatamente o fluxo de handleCreate.
  useEffect(() => {
    const onNew = (): void => void handleCreate()
    window.addEventListener(NEW_PROJECT_EVENT, onNew)
    return () => window.removeEventListener(NEW_PROJECT_EVENT, onNew)
  })

  const handleSetCwd = async (id: string): Promise<void> => {
    try {
      const cwd = await window.orkestra.projects.pickDirectory()
      if (!cwd) return
      await window.orkestra.projects.setCwd(id, cwd)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const toggleIconPicker = (id: string): void => {
    setIconPickerId((cur) => (cur === id ? null : id))
    setCustomIcon('')
  }

  const handlePickIcon = async (id: string, icon: string): Promise<void> => {
    const trimmed = icon.trim()
    if (!trimmed) return
    try {
      await window.orkestra.projects.setIcon(id, trimmed)
      setIconPickerId(null)
      setCustomIcon('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const startRename = (p: Project): void => {
    cancelConfirmTimer()
    setConfirmingId(null)
    setRenamingId(p.id)
    setRenameValue(p.name)
  }

  const commitRename = async (): Promise<void> => {
    const id = renamingId
    if (!id) return
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name) return
    try {
      await window.orkestra.projects.rename(id, name)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRemove = async (id: string): Promise<void> => {
    useCanvasStore.getState().setSwitching(true)
    try {
      const { activeId: newActiveId, snapshot } = await window.orkestra.projects.remove(id)
      if (newActiveId !== activeId) {
        useCanvasStore.getState().hydrate(snapshot ?? { version: 2, nodes: [], edges: [] }, newActiveId)
      }
      setActiveId(newActiveId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      useCanvasStore.getState().setSwitching(false)
    }
  }

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

  // Minimizada = OCULTA por completo (2026-07-14). O componente segue montado (os hooks acima
  // rodam) — só não pinta nada; reabrir é pelo botão "Exibir menu lateral" (PanelLeft) da Topbar.
  if (collapsed) return null

  const q = filter.trim().toLowerCase()
  const filtered = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects
  const countFor = (p: Project): number => (p.id === activeId ? liveActiveTerminals : counts[p.id] ?? 0)

  return (
    <div className="ork-sidebar">
      {/* Header: área de arraste da janela (traffic lights à esquerda no macOS) + controles à
          direita (novo projeto / ocultar), espelhando o mockup. */}
      <div className="ork-sidebar-header">
        <span className="ork-sidebar-header-drag" aria-hidden="true" />
        <div className="ork-sidebar-header-actions">
          <button
            type="button"
            className="ork-sidebar-hbtn"
            onClick={() => void handleCreate()}
            title="Novo projeto"
            aria-label="Novo projeto"
          >
            <Icon name="Plus" size={16} animation="none" className="ork-icon--rotate" />
          </button>
          <button
            type="button"
            className="ork-sidebar-hbtn"
            onClick={toggleCollapsed}
            title="Ocultar menu lateral"
            aria-label="Ocultar menu lateral"
          >
            <Icon name="PanelLeft" size={15} animation="none" className="ork-icon--slide" />
          </button>
        </div>
      </div>

      {/* Filtro por nome */}
      <div className="ork-sidebar-filter">
        <Icon name="Search" size={13} animation="none" className="ork-sidebar-filter-icon" />
        <input
          className="ork-sidebar-filter-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar"
          aria-label="Filtrar projetos"
        />
        {filter && (
          <button
            type="button"
            className="ork-sidebar-filter-clear"
            onClick={() => setFilter('')}
            aria-label="Limpar filtro"
            title="Limpar"
          >
            <Icon name="X" size={12} animation="pop" />
          </button>
        )}
      </div>

      {error && <div className="ork-sidebar-error">{error}</div>}

      <div className="ork-sidebar-scroll">
        {/* Grupo padrão (visual por ora — grupos reais são um passo seguinte). Cabeçalho colapsável
            com chevron animado; as linhas ficam sob ele. */}
        <div className="ork-sidebar-group">
          <button
            type="button"
            className="ork-sidebar-group-header"
            onClick={() => setGroupOpen((o) => !o)}
            aria-expanded={groupOpen}
          >
            <Icon
              name="ChevronRight"
              size={13}
              animation="none"
              className={`ork-sidebar-group-chevron${groupOpen ? ' ork-sidebar-group-chevron--open' : ''}`}
            />
            <span className="ork-sidebar-group-name">Projetos</span>
          </button>

          {groupOpen && (
            <div className="ork-sidebar-group-items">
              {projects.length === 0 && !error && <div className="ork-sidebar-empty">Carregando projetos…</div>}
              {projects.length > 0 && filtered.length === 0 && (
                <div className="ork-sidebar-empty">Nenhum projeto encontrado</div>
              )}
              {filtered.map((p) => (
                <div
                  key={p.id}
                  className={`ork-sidebar-project${p.id === activeId ? ' ork-sidebar-project--active' : ''}`}
                  onClick={() => handleRowClick(p.id)}
                  onDoubleClick={() => startRename(p)}
                  title={p.cwd ?? p.name}
                >
                  {/* Ícone do projeto — clicar abre o seletor inline; não dispara switch/rename. */}
                  <div className="ork-sidebar-icon-wrap" data-icon-picker-id={p.id}>
                    <button
                      type="button"
                      className="ork-sidebar-icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleIconPicker(p.id)
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      aria-label={`Escolher ícone de ${p.name}`}
                      title="Escolher ícone"
                    >
                      <ProjectIconGlyph p={p} />
                    </button>
                    {iconPickerId === p.id && (
                      <div
                        className="ork-sidebar-icon-picker"
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <div className="ork-sidebar-icon-picker-row">
                          {ICON_CHOICES.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className="ork-sidebar-icon-choice"
                              onClick={() => void handlePickIcon(p.id, emoji)}
                              aria-label={`Usar ${emoji} como ícone`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        <form
                          className="ork-sidebar-icon-picker-form"
                          onSubmit={(e) => {
                            e.preventDefault()
                            void handlePickIcon(p.id, customIcon)
                          }}
                        >
                          <input
                            className="ork-sidebar-icon-picker-input"
                            value={customIcon}
                            onChange={(e) => setCustomIcon(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault()
                                setIconPickerId(null)
                              }
                            }}
                            placeholder="Colar emoji…"
                            maxLength={8}
                            aria-label="Emoji personalizado"
                          />
                          <button type="submit" className="ork-sidebar-icon-picker-confirm" aria-label="Confirmar ícone">
                            <Icon name="Check" size={14} animation="pop" />
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                  <div className="ork-sidebar-project-main">
                    {renamingId === p.id ? (
                      <input
                        ref={renameInputRef}
                        className="ork-sidebar-rename-input"
                        value={renameValue}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => void commitRename()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void commitRename()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            setRenamingId(null)
                          }
                        }}
                      />
                    ) : (
                      <span className="ork-sidebar-project-name" title={p.name}>
                        {p.name}
                      </span>
                    )}
                  </div>

                  {/* Lado direito: badge de nº de terminais por padrão; ações (pasta/remover)
                      aparecem no hover da linha (ver CSS). */}
                  <div className="ork-sidebar-project-right">
                    <span className="ork-sidebar-badge" title={`${countFor(p)} terminal(is)`} aria-hidden="true">
                      <Icon name="Terminal" size={11} animation="none" />
                      <span className="ork-sidebar-badge-n">{countFor(p)}</span>
                    </span>
                    <div className="ork-sidebar-project-actions">
                      <button
                        className="ork-sidebar-folder"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleSetCwd(p.id)
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        aria-label={`Definir pasta de ${p.name}`}
                        title="Definir pasta do projeto"
                      >
                        <Icon name="Folder" size={14} animation="bounce" />
                      </button>
                      <button
                        className={`ork-sidebar-remove${confirmingId === p.id ? ' ork-sidebar-remove--armed' : ''}`}
                        data-remove-id={p.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveClick(p.id)
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        aria-label={confirmingId === p.id ? `Confirmar remoção de ${p.name}` : `Remover ${p.name}`}
                        title={confirmingId === p.id ? 'Clique novamente para confirmar' : 'Remover projeto'}
                      >
                        {confirmingId === p.id ? 'Confirmar?' : <Icon name="X" size={14} animation="pop" />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rodapé: "Grupo" (agrupar projetos — em breve) + alternar tema. */}
      <div className="ork-sidebar-footer">
        <button
          type="button"
          className="ork-sidebar-group-btn"
          disabled
          title="Agrupar projetos — em breve"
          aria-label="Agrupar projetos (em breve)"
        >
          <Icon name="Layers" size={14} animation="none" />
          <span>Grupo</span>
        </button>
        <ThemeToggle collapsed />
      </div>
    </div>
  )
}
