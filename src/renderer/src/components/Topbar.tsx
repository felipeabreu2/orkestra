import { useLayoutEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { basename } from '../ui/paths'
import { Icon } from './Icon'
import './Topbar.css'

// Barra superior (Onda 1 / F01): copia o layout da imagem 1 em 3 grupos. Ícones animados
// (motion-icons-react via wrapper Icon) — animam sutilmente no hover. Botões cujas ações já existem
// no app ficam funcionais; os de funções ainda não implementadas (arquivo, texto, desenho, snippet,
// compartilhar) renderizam DESABILITADOS ("em breve") até suas próprias ondas. O cursor é só um
// indicador de modo por ora.

// Espelha o `pendingTool` do Canvas (a "ferramenta armada": null = selecionar/navegar, senão o
// tipo de nó que um clique no canvas vai criar — ver Canvas.tsx). A Topbar só CONSOME esse estado
// (não o possui) pra desenhar o thumb azul deslizante (§4/§6, DesignCode UI) sob o botão da
// ferramenta ativa — sem essa prop a barra não tem como saber qual botão realçar.
type PendingTool = 'note' | 'portal' | 'filetree' | 'draw' | null
type ModeKey = 'select' | 'note' | 'files' | 'portal' | 'draw'

function modeKeyFor(pendingTool: PendingTool): ModeKey {
  if (pendingTool === null) return 'select'
  if (pendingTool === 'filetree') return 'files'
  return pendingTool
}

export function Topbar({
  cwd,
  collapsed,
  pendingTool,
  onToggleSidebar,
  onNewProject,
  onSelectMode,
  onNewTerminal,
  onNote,
  onFile,
  onFiles,
  onPortal,
  onDraw,
  onOpenIde
}: {
  cwd: string | null
  collapsed: boolean
  pendingTool: PendingTool
  onToggleSidebar: () => void
  onNewProject: () => void
  onSelectMode: () => void
  onNewTerminal: () => void
  onNote: () => void
  onFile: () => void
  onFiles: () => void
  onPortal: () => void
  onDraw: () => void
  onOpenIde: () => void
}): JSX.Element {
  const workspace = cwd ? basename(cwd) : 'My Workspace'

  // Thumb deslizante (§6 "Indicador deslizante"): mede o botão da ferramenta ATIVA via ref e
  // reposiciona um pill absoluto por trás dele com `transform`+`--spring` — mesma receita do
  // `.tbthumb` do mockup, mas dinâmica (o mockup é HTML estático com posição fixa; aqui as
  // ferramentas não-modo (Terminal/Arquivo/Texto) ficam intercaladas, então a posição real só se
  // sabe medindo o DOM). `useLayoutEffect` evita o flash de uma frame com o thumb no lugar antigo.
  const activeKey = modeKeyFor(pendingTool)
  const toolRefs = useRef<Record<ModeKey, HTMLButtonElement | null>>({
    select: null,
    note: null,
    files: null,
    portal: null,
    draw: null
  })
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const el = toolRefs.current[activeKey]
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth })
  }, [activeKey])

  return (
    <div className="ork-topbar">
      <div className="ork-topbar-left">
        {/* +/ocultar só aparecem quando a sidebar está OCULTA (2026-07-14): com a sidebar aberta,
            o header dela já tem esses botões — mostrá-los aqui também duplicaria os ícones. Oculta,
            este é o único caminho para criar projeto e REABRIR a sidebar (PanelLeft). */}
        {collapsed && (
          <div className="ork-topbar-pill">
            <button className="ork-topbar-tool" title="Novo projeto" aria-label="Novo projeto" onClick={onNewProject}>
              <Icon name="Plus" animation="none" className="ork-icon--rotate" />
            </button>
            <span className="ork-topbar-pill-sep" aria-hidden="true" />
            <button
              className="ork-topbar-tool"
              title="Exibir menu lateral"
              aria-label="Exibir menu lateral"
              onClick={onToggleSidebar}
            >
              <Icon name="PanelLeft" animation="none" className="ork-icon--slide" />
            </button>
          </div>
        )}
        <span className="ork-topbar-workspace" title={cwd ?? 'Nenhuma pasta vinculada'}>
          <Icon name="Folder" size={13} animation="none" />
          <span className="ork-topbar-workspace-name">{workspace}</span>
        </span>
      </div>

      <div className="ork-topbar-center">
        {/* Thumb azul deslizante (§6): só a ferramenta ATIVA (select/note/files/portal/draw) tem
            botão elegível — Terminal (CTA) e Arquivo/Texto são ações de disparo único, não "modos"
            armados, então ficam fora da medição/thumb. */}
        {thumb && (
          <span
            className="ork-topbar-thumb"
            aria-hidden="true"
            style={{ transform: `translateX(${thumb.left}px)`, width: `${thumb.width}px` }}
          />
        )}
        <button
          ref={(el) => {
            toolRefs.current.select = el
          }}
          className={`ork-topbar-tool${activeKey === 'select' ? ' ork-topbar-tool--active' : ''}`}
          title="Selecionar / navegar"
          aria-label="Selecionar / navegar"
          onClick={onSelectMode}
        >
          <Icon name="MousePointer2" animation="nudge" />
        </button>
        <button
          ref={(el) => {
            toolRefs.current.note = el
          }}
          className={`ork-topbar-tool${activeKey === 'note' ? ' ork-topbar-tool--active' : ''}`}
          title="Nova nota"
          aria-label="Nova nota"
          onClick={onNote}
        >
          <Icon name="StickyNote" animation="swing" />
        </button>
        <button className="ork-topbar-tool" title="Anexar arquivo" aria-label="Anexar arquivo" onClick={onFile}>
          <Icon name="Paperclip" animation="swing" />
        </button>
        <button
          ref={(el) => {
            toolRefs.current.files = el
          }}
          className={`ork-topbar-tool${activeKey === 'files' ? ' ork-topbar-tool--active' : ''}`}
          title="Árvore de arquivos"
          aria-label="Árvore de arquivos"
          onClick={onFiles}
        >
          <Icon name="Folder" animation="bounce" />
        </button>
        <button
          ref={(el) => {
            toolRefs.current.portal = el
          }}
          className={`ork-topbar-tool${activeKey === 'portal' ? ' ork-topbar-tool--active' : ''}`}
          title="Anexar site"
          aria-label="Anexar site"
          onClick={onPortal}
        >
          <Icon name="Globe" animation="none" className="ork-icon--spin-hover" />
        </button>
        <button className="ork-topbar-tool" title="Texto (em breve)" aria-label="Texto" disabled>
          <Icon name="ALargeSmall" animation="pop" />
        </button>
        <button
          ref={(el) => {
            toolRefs.current.draw = el
          }}
          className={`ork-topbar-tool${activeKey === 'draw' ? ' ork-topbar-tool--active' : ''}`}
          title="Desenhar"
          aria-label="Desenhar"
          onClick={onDraw}
        >
          <Icon name="PenTool" animation="wiggle" />
        </button>
        <span className="ork-topbar-pill-sep" aria-hidden="true" />
        {/* CTA "Novo terminal" (§4.9/§6): botão primário — gloss + glow + shimmer contínuo (::before,
            ork-shimmer de motion.css) + press-scale. É a única ação de criação com destaque de marca
            na barra (parcimônia do accent, §1). */}
        <button className="ork-topbar-tool ork-topbar-cta" title="Novo terminal" aria-label="Novo terminal" onClick={onNewTerminal}>
          <Icon name="Terminal" size={15} animation="none" />
          <span className="ork-topbar-cta-label">Novo terminal</span>
        </button>
      </div>

      <div className="ork-topbar-right">
        <button className="ork-topbar-tool" title="Em breve" aria-label="Snippet" disabled>
          <Icon name="Braces" animation="pop" />
        </button>
        <span className="ork-topbar-pill-sep" aria-hidden="true" />
        <button
          className="ork-topbar-tool"
          title={cwd ? 'Abrir no editor de código' : 'Vincule uma pasta ao projeto para abrir no editor'}
          aria-label="Abrir no editor de código"
          onClick={onOpenIde}
          disabled={!cwd}
        >
          <Icon name="Code2" animation="none" className="ork-icon--slide" />
        </button>
        <span className="ork-topbar-pill-sep" aria-hidden="true" />
        <button className="ork-topbar-tool" title="Compartilhar (em breve)" aria-label="Compartilhar" disabled>
          <Icon name="Upload" animation="bounce" />
        </button>
      </div>
    </div>
  )
}
