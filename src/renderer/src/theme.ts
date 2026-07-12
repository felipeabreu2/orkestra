export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'orkestra-theme'

export function resolveInitialTheme(stored: string | null): Theme {
  return stored === 'light' ? 'light' : 'dark'
}

export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
  }
}

export function loadTheme(): Theme {
  let stored: string | null = null
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  } catch {
    stored = null
  }
  const theme = resolveInitialTheme(stored)
  applyTheme(theme)
  return theme
}

export function saveTheme(theme: Theme): void {
  applyTheme(theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* localStorage indisponível — só aplica em memória */
  }
}
