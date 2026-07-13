// Preferência de UI: sidebar de projetos colapsada. Fonte única lida pelo canvasStore (a
// ProjectsSidebar e a Topbar reagem a s.sidebarCollapsed). Molde de edges/edgeStyle.ts: a
// reatividade vem do store; aqui só resolvemos/persistimos o valor. Chave mantida do estado
// local anterior da sidebar (Fase 18 Task 4) para preservar a preferência já gravada.
const STORAGE_KEY = 'orkestra.sidebar.collapsed'

export function resolveSidebarCollapsed(stored: string | null): boolean {
  return stored === 'true'
}

export function loadSidebarCollapsed(): boolean {
  let stored: string | null = null
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  } catch {
    stored = null
  }
  return resolveSidebarCollapsed(stored)
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed))
  } catch {
    /* localStorage indisponível — o valor segue em memória no store */
  }
}
