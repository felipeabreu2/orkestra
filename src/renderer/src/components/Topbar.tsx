import type { JSX } from 'react'
import './Topbar.css'

const svg = {
  width: 17,
  height: 17,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
}

function FolderIcon(): JSX.Element {
  return (
    <svg {...svg} width={15} height={15}>
      <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}
function TerminalIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <path d="M6 16l4-4-4-4" />
      <line x1="12" y1="17" x2="18" y2="17" />
    </svg>
  )
}
function NoteIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M9 10h6M9 14h6M9 18h3" />
    </svg>
  )
}
function PortalIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16" />
      <path d="M12 4c2.5 2 2.5 14 0 16M12 4c-2.5 2-2.5 14 0 16" />
    </svg>
  )
}
function FilesIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <path d="M5 4h5l2 2h7v3H5z" />
      <path d="M5 9h14v11H5z" />
    </svg>
  )
}
function SearchIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  )
}
function CodeIcon(): JSX.Element {
  return (
    <svg {...svg}>
      <path d="M9 8l-4 4 4 4" />
      <path d="M15 8l4 4-4 4" />
    </svg>
  )
}

export function Topbar({
  cwd,
  onNewTerminal,
  onNote,
  onPortal,
  onFiles,
  onSearch,
  onOpenIde
}: {
  cwd: string | null
  onNewTerminal: () => void
  onNote: () => void
  onPortal: () => void
  onFiles: () => void
  onSearch: () => void
  onOpenIde: () => void
}): JSX.Element {
  return (
    <div className="ork-topbar">
      <div className="ork-topbar-left" title={cwd ?? 'Nenhuma pasta vinculada a este projeto'}>
        <FolderIcon />
        <span className="ork-topbar-path">{cwd ?? 'Sem pasta'}</span>
        {/* R1: abrir a pasta do projeto no editor de código externo. Desabilitado sem pasta. */}
        <button
          className="ork-topbar-ide"
          title={cwd ? 'Abrir no editor de código' : 'Vincule uma pasta ao projeto para abrir no editor'}
          aria-label="Abrir no editor de código"
          onClick={onOpenIde}
          disabled={!cwd}
        >
          <CodeIcon />
        </button>
      </div>
      <div className="ork-topbar-tools">
        <button className="ork-topbar-tool" title="Novo terminal" aria-label="Novo terminal" onClick={onNewTerminal}>
          <TerminalIcon />
        </button>
        <button className="ork-topbar-tool" title="Nova nota" aria-label="Nova nota" onClick={onNote}>
          <NoteIcon />
        </button>
        <button className="ork-topbar-tool" title="Novo portal" aria-label="Novo portal" onClick={onPortal}>
          <PortalIcon />
        </button>
        <button className="ork-topbar-tool" title="Árvore de arquivos" aria-label="Árvore de arquivos" onClick={onFiles}>
          <FilesIcon />
        </button>
        <span className="ork-topbar-sep" />
        <button className="ork-topbar-tool" title="Buscar (⌘K)" aria-label="Buscar" onClick={onSearch}>
          <SearchIcon />
        </button>
      </div>
    </div>
  )
}
