import { useState, type JSX } from 'react'
import { loadTheme, saveTheme, nextTheme, type Theme } from '../theme'
import { Icon } from './Icon'

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
      {theme === 'dark' ? (
        <Icon name="Sun" size={15} animation="spin" />
      ) : (
        <Icon name="Moon" size={15} animation="swing" />
      )}
      {!collapsed && <span className="ork-theme-toggle-label">{label}</span>}
    </button>
  )
}
