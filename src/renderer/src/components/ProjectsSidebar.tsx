import { useEffect, useRef, useState } from 'react'
import type { Project } from '../../../shared/project'
import { useCanvasStore } from '../store/canvasStore'
import { basename } from '../ui/paths'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import './ProjectsSidebar.css'

// Menu esquerdo de projetos (Fase 15 Task 3): cada projeto tem seu próprio canvas persistido
// (ver ProjectManager no main, Fase 15 Task 2) — esta barra lista/cria/renomeia/remove projetos
// e troca o canvas montado no meio da tela. Toda chamada a window.orkestra.projects.* pode
// rejeitar (IPC/disco) e é envolvida em try/catch (nunca deixamos uma
// rejeição estourar pro React e derrubar o canvas). Estilo mínimo, consistente com os tokens.

// Janela de confirmação inline do "Remover" (Fase 13).
const REMOVE_CONFIRM_MS = 3000

// Fase 18 (Task 4): conjunto curado e pequeno de emojis comuns pro seletor de ícone — além
// destes, o input de texto livre aceita qualquer emoji colado.
const ICON_CHOICES = ['📁', '💻', '🌐', '🧪', '🚀', '📦', '🔧', '🎨', '📝', '⚙️']

// Fase 18 (Task 4): fallback visual quando o projeto não tem `icon` — 1ª letra do nome (maiúscula)
// num chip pequeno, tanto na linha expandida quanto no trilho colapsado.
function initialOf(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed[0]!.toUpperCase() : '?'
}

// Conteúdo do "chip" de ícone — emoji do projeto se houver, senão a inicial do nome. Compartilhado
// entre a linha expandida (botão clicável, abre o seletor) e o item do trilho colapsado (só
// exibição + switch, sem seletor).
function ProjectIconGlyph({ p }: { p: Project }): JSX.Element {
  return p.icon ? (
    <span aria-hidden="true">{p.icon}</span>
  ) : (
    <span className="ork-sidebar-icon-fallback" aria-hidden="true">
      {initialOf(p.name)}
    </span>
  )
}

export function ProjectsSidebar(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [error, setError] = useState<string>('')
  // Id do projeto com rename inline em edição (null = nenhum) — duplo-clique numa linha arma.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState<string>('')
  // Id do projeto com remoção pendente de confirmação (2º clique em "Confirmar?" remove de
  // fato) — null quando nenhuma remoção está pendente.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  // Evita disparar duas trocas de projeto concorrentes (ex.: duplo-clique numa linha ainda não
  // ativa dispara dois onClick antes do onDoubleClick) — sem isso, dois switchTo() em voo
  // fariam flush/hydrate fora de ordem.
  const switchingRef = useRef(false)
  // Onda 1 (F01): o colapso da sidebar agora é fonte única no canvasStore (persistido em
  // ui/sidebarCollapsed), compartilhado com a Topbar (botão de painel). `collapsed` é reativo;
  // `toggleCollapsed` é a ação do store — o botão «/» daqui e o botão de painel da Topbar chamam
  // a mesma. Mantém o mesmo comportamento/persistência de antes, só troca a origem do estado.
  const collapsed = useCanvasStore((s) => s.sidebarCollapsed)
  const toggleCollapsed = useCanvasStore((s) => s.toggleSidebar)
  // Id do projeto com o seletor de ícone aberto (null = nenhum) — só existe na sidebar expandida;
  // colapsar fecha implicitamente (o trilho não renderiza o seletor).
  const [iconPickerId, setIconPickerId] = useState<string | null>(null)
  const [customIcon, setCustomIcon] = useState<string>('')

  const refresh = async (): Promise<void> => {
    try {
      const idx = await window.orkestra.projects.list()
      setProjects(idx.projects)
      setActiveId(idx.activeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  // Fase 30: mantém o cwd do projeto ativo no store para a barra superior do canvas exibir
  // (reage a carregar/criar/trocar/renomear — tudo passa por activeId/projects).
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

  // Clicar fora do botão "Confirmar?" pendente cancela a confirmação — mousedown (não click)
  // dispara antes do click do alvo, então um clique em OUTRO botão/linha já vê confirmingId
  // limpo e trata como 1º clique, não como confirmação (Fase 13).
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

  // Mesmo padrão do confirmingId acima: clicar fora do seletor de ícone aberto (fora do
  // ork-sidebar-icon-wrap daquele projeto) fecha o popover sem trocar o ícone.
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

  // Limpa o timer pendente se o componente desmontar com uma confirmação em aberto.
  useEffect(() => cancelConfirmTimer, [])

  // Autofoca o input de rename assim que ele monta.
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  // Núcleo compartilhado por clique-na-linha e por "+ Novo projeto": salva (flush) o canvas do
  // projeto que está SAINDO (o antigo) por id EXPLÍCITO e aguarda essa gravação terminar, só
  // então troca o ativo no main e hidrata o canvas do projeto recém-ativado. saveCanvas(activeId,
  // …) grava sempre no arquivo do projeto `activeId` (o que está sendo deixado), então isso não
  // depende de ordem entre o flush e o switch — ao contrário do antigo persistence.save
  // fire-and-forget, que só gravava no projeto certo porque o handler roda ANTES do switch mudar
  // o ativo no main (verdade hoje pq IPC é FIFO e o fs do ProjectManager é síncrono, mas um futuro
  // refactor pra fs.promises poderia inverter essa ordem e gravar o canvas antigo por cima do
  // projeto novo — corrupção silenciosa entre projetos). hydrate() desmonta os nós antigos (PTYs
  // morrem) e monta os novos — intencional (ver notas de risco do brief).
  const switchTo = async (id: string): Promise<void> => {
    if (switchingRef.current) return
    switchingRef.current = true
    // Suspende o autosave debounced de useCanvasPersistence pra toda a janela flush→switch→
    // hydrate: sem isso, um timer de 500ms armado com o conteúdo do projeto ANTIGO poderia
    // disparar depois que o main já trocou o ativo pro projeto NOVO mas antes do hydrate() abaixo
    // rodar, gravando o conteúdo errado por cima do arquivo do projeto novo (Fase 15 Task 3,
    // fix complementar ao flush explícito por id já existente).
    useCanvasStore.getState().setSwitching(true)
    try {
      await window.orkestra.projects.saveCanvas(activeId, useCanvasStore.getState().serialize())
      const snap = await window.orkestra.projects.switch(id)
      if (snap === null) {
        // id inválido (não deveria acontecer em uso normal, ver review Fase 15 Task 3, Minor #2):
        // não hidrata canvas vazio nem seta um activeId local bogus — early-return preserva o
        // canvas e o projeto ativo atuais intactos.
        setError('Não foi possível trocar de projeto (id inválido).')
        return
      }
      useCanvasStore.getState().hydrate(snap)
      setActiveId(id)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      switchingRef.current = false
      useCanvasStore.getState().setSwitching(false)
    }
  }

  const handleRowClick = (id: string): void => {
    // Clicar na linha já ativa re-hidrataria o mesmo canvas à toa, matando terminais vivos por
    // nada — no-op.
    if (id === activeId) return
    void switchTo(id)
  }

  const handleCreate = async (): Promise<void> => {
    try {
      // Abre o seletor de pasta nativo do SO PRIMEIRO — criar um projeto é escolher a pasta
      // de trabalho dele (os terminais abrem nela). O nome do projeto vira o nome da pasta;
      // dá pra renomear depois pelo botão de renomear da linha. (Electron não suporta
      // window.prompt, então a seleção de pasta é o próprio fluxo de criação.)
      const cwd = await window.orkestra.projects.pickDirectory()
      if (!cwd) return // usuário cancelou o diálogo → não cria nada
      const name = basename(cwd)
      const project = await window.orkestra.projects.create(name, cwd)
      await refresh()
      await switchTo(project.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Fase 17 (Task 2): troca a pasta de um projeto já existente via o botão "pasta" da linha.
  // Cancelar o diálogo (null) é no-op — não mexe na pasta atual do projeto.
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

  // Abre/fecha o seletor de ícone de um projeto; abrir o de outro fecha o anterior (um só
  // iconPickerId). Reabrir sempre limpa o rascunho do input de texto livre.
  const toggleIconPicker = (id: string): void => {
    setIconPickerId((cur) => (cur === id ? null : id))
    setCustomIcon('')
  }

  // Núcleo do seletor: usado tanto pelos botões da lista curada (ICON_CHOICES) quanto pelo
  // input de texto livre — troca o ícone e re-lista; erro de IPC/disco vira mensagem amigável
  // (mesmo padrão try/catch de todo handler desta sidebar) em vez de propagar.
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
    // Mesma suspensão do autosave debounced usada em switchTo (Fase 15 Task 3): remove() também
    // pode trocar o projeto ativo no main (quando o removido era o ativo), então a mesma janela
    // de corrida entre um timer de autosave pendente do projeto antigo e o hydrate abaixo existe
    // aqui também.
    useCanvasStore.getState().setSwitching(true)
    try {
      // remove() já decide/troca o ativo no main quando o removido era o ativo, devolvendo
      // {activeId, snapshot} do projeto que ficou ativo — só refletimos isso no renderer.
      // Só hidrata se o ativo de fato mudou: se o projeto removido NÃO era o ativo, o canvas em
      // memória continua sendo o do projeto ainda ativo (não persistido nos últimos <500ms do
      // autosave) — hidratar de novo aqui o substituiria pela versão em disco, perdendo essa
      // borda de edição não salva à toa.
      const { activeId: newActiveId, snapshot } = await window.orkestra.projects.remove(id)
      if (newActiveId !== activeId) {
        useCanvasStore.getState().hydrate(snapshot ?? { version: 2, nodes: [], edges: [] })
      }
      setActiveId(newActiveId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      useCanvasStore.getState().setSwitching(false)
    }
  }

  // Descarta o canvas do projeto (sem confirmação nativa, que bloqueia o processo): 1º clique só
  // arma confirmingId e troca o label pra "Confirmar?"; um 2º clique dentro de REMOVE_CONFIRM_MS
  // remove de fato; timeout ou clique fora cancela (Fase 13).
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
    <div className={`ork-sidebar${collapsed ? ' ork-sidebar--collapsed' : ''}`}>
      <div className="ork-sidebar-brand">
        {!collapsed && (
          <>
            <Logo size={18} />
            <span className="ork-sidebar-brand-text">Orkestra</span>
          </>
        )}
        {/* Fase 18 (Task 4): toggle sempre visível (expandido ou colapsado) — o estado persiste
            em localStorage (SIDEBAR_COLLAPSED_KEY), sobrevive a reload/restart do app. */}
        <button
          className="ork-sidebar-collapse-btn"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      {!collapsed && error && <div className="ork-sidebar-error">{error}</div>}
      {collapsed ? (
        // Fase 18 (Task 4): trilho estreito (~52px) — só ícone por projeto (nome no title/hover),
        // ativo destacado, e um "+" compacto. Clicar reusa handleRowClick (mesmo switchTo() da
        // sidebar expandida); rename/pasta/remover exigem o modo expandido.
        <div className="ork-sidebar-rail">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`ork-sidebar-rail-item${p.id === activeId ? ' ork-sidebar-rail-item--active' : ''}`}
              onClick={() => handleRowClick(p.id)}
              title={p.name}
              aria-label={p.name}
            >
              <ProjectIconGlyph p={p} />
            </button>
          ))}
          <button
            type="button"
            className="ork-sidebar-rail-add"
            onClick={() => void handleCreate()}
            title="Novo projeto"
            aria-label="Novo projeto"
          >
            +
          </button>
          <div className="ork-sidebar-rail-spacer" />
          <ThemeToggle collapsed />
        </div>
      ) : (
        <>
          <div className="ork-sidebar-list">
            {projects.length === 0 && !error && <div className="ork-sidebar-empty">Carregando projetos…</div>}
            {projects.map((p) => (
              <div
                key={p.id}
                className={`ork-sidebar-project${p.id === activeId ? ' ork-sidebar-project--active' : ''}`}
                onClick={() => handleRowClick(p.id)}
                onDoubleClick={() => startRename(p)}
                title={p.cwd}
              >
                {/* Fase 18 (Task 4): ícone do projeto — clicar abre o seletor inline (lista curada
                    + input livre); nunca dispara handleRowClick/startRename da linha (stopPropagation
                    nos handlers, como o botão de pasta/remover já fazem). */}
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
                          ✓
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
                    <>
                      <span className="ork-sidebar-project-name" title={p.name}>
                        {p.name}
                      </span>
                      {/* Fase 17 (Task 2): basename discreto da pasta vinculada — path completo já
                          está no title da linha (acima). Sem cwd: rótulo fraco convidando a usar o
                          botão "pasta" ao lado. */}
                      {p.cwd ? (
                        <span className="ork-sidebar-project-cwd">{basename(p.cwd)}</span>
                      ) : (
                        <span className="ork-sidebar-project-cwd ork-sidebar-project-cwd--empty">sem pasta</span>
                      )}
                    </>
                  )}
                </div>
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
                    📁
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
                    {confirmingId === p.id ? 'Confirmar?' : '✕'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="ork-sidebar-footer">
            <button className="ork-sidebar-new-btn" onClick={() => void handleCreate()}>
              + Novo projeto
            </button>
            <ThemeToggle />
          </div>
        </>
      )}
    </div>
  )
}
