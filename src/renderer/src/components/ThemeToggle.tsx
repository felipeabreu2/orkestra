import { useState, type JSX } from 'react'
import { loadTheme, saveTheme, nextTheme, type Theme } from '../theme'

function SunIcon(): JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon(): JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

export function ThemeToggle({ collapsed }: { collapsed?: boolean }): JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const toggle = (): void => {
    const t = nextTheme(theme)
    setTheme(t)
    saveTheme(t)
  }
  // No escuro, oferecemos ir para o claro (ícone sol); no claro, ir para o escuro (ícone lua).
  const label = theme === 'dark' ? 'Tema claro' : 'Tema escuro'
  return (
    <button className="ork-theme-toggle" onClick={toggle} title={label} aria-label={label}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      {!collapsed && <span className="ork-theme-toggle-label">{label}</span>}
    </button>
  )
}
