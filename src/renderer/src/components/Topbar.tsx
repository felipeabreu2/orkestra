import type { JSX } from 'react'
import { basename } from '../ui/paths'
import { Icon } from './Icon'
import './Topbar.css'

// Barra superior (Onda 1 / F01): copia o layout da imagem 1 em 3 grupos. Ícones animados
// (motion-icons-react via wrapper Icon) — animam sutilmente no hover. Botões cujas ações já existem
// no app ficam funcionais; os de funções ainda não implementadas (arquivo, texto, desenho, snippet,
// compartilhar) renderizam DESABILITADOS ("em breve") até suas próprias ondas. O cursor é só um
// indicador de modo por ora.
export function Topbar({
  cwd,
  collapsed,
  onToggleSidebar,
  onNewProject,
  onSelectMode,
  onNewTerminal,
  onNote,
  onFiles,
  onPortal,
  onOpenIde
}: {
  cwd: string | null
  collapsed: boolean
  onToggleSidebar: () => void
  onNewProject: () => void
  onSelectMode: () => void
  onNewTerminal: () => void
  onNote: () => void
  onFiles: () => void
  onPortal: () => void
  onOpenIde: () => void
}): JSX.Element {
  const workspace = cwd ? basename(cwd) : 'My Workspace'
  return (
    <div className="ork-topbar">
      <div className="ork-topbar-left">
        <button className="ork-topbar-tool" title="Novo projeto" aria-label="Novo projeto" onClick={onNewProject}>
          <Icon name="Plus" animation="pop" />
        </button>
        <button
          className="ork-topbar-tool"
          title={collapsed ? 'Exibir menu lateral' : 'Ocultar menu lateral'}
          aria-label={collapsed ? 'Exibir menu lateral' : 'Ocultar menu lateral'}
          onClick={onToggleSidebar}
        >
          <Icon name="PanelLeft" animation="nudge" />
        </button>
        <span className="ork-topbar-workspace" title={cwd ?? 'Nenhuma pasta vinculada'}>
          {workspace}
        </span>
      </div>

      <div className="ork-topbar-center">
        <button
          className="ork-topbar-tool ork-topbar-tool--active"
          title="Selecionar / navegar"
          aria-label="Selecionar / navegar"
          onClick={onSelectMode}
        >
          <Icon name="MousePointer2" animation="nudge" />
        </button>
        <button className="ork-topbar-tool" title="Novo terminal" aria-label="Novo terminal" onClick={onNewTerminal}>
          <Icon name="Terminal" animation="wiggle" />
        </button>
        <button className="ork-topbar-tool" title="Nova nota" aria-label="Nova nota" onClick={onNote}>
          <Icon name="StickyNote" animation="swing" />
        </button>
        <button className="ork-topbar-tool" title="Anexar arquivo (em breve)" aria-label="Anexar arquivo" disabled>
          <Icon name="Paperclip" animation="swing" />
        </button>
        <button className="ork-topbar-tool" title="Árvore de arquivos" aria-label="Árvore de arquivos" onClick={onFiles}>
          <Icon name="Folder" animation="bounce" />
        </button>
        <button className="ork-topbar-tool" title="Anexar site" aria-label="Anexar site" onClick={onPortal}>
          <Icon name="Globe" animation="spin" />
        </button>
        <button className="ork-topbar-tool" title="Texto (em breve)" aria-label="Texto" disabled>
          <Icon name="ALargeSmall" animation="pop" />
        </button>
        <button className="ork-topbar-tool" title="Desenhar (em breve)" aria-label="Desenhar" disabled>
          <Icon name="PenTool" animation="wiggle" />
        </button>
      </div>

      <div className="ork-topbar-right">
        <button className="ork-topbar-tool" title="Em breve" aria-label="Snippet" disabled>
          <Icon name="Braces" animation="pop" />
        </button>
        <button
          className="ork-topbar-tool"
          title={cwd ? 'Abrir no editor de código' : 'Vincule uma pasta ao projeto para abrir no editor'}
          aria-label="Abrir no editor de código"
          onClick={onOpenIde}
          disabled={!cwd}
        >
          <Icon name="Code2" animation="wiggle" />
        </button>
        <button className="ork-topbar-tool" title="Compartilhar (em breve)" aria-label="Compartilhar" disabled>
          <Icon name="Upload" animation="bounce" />
        </button>
      </div>
    </div>
  )
}
