export interface Role {
  id: string
  label: string
  color: string
  hint: string
}

export const PRESET_ROLES: readonly Role[] = [
  { id: 'lider', label: 'Líder', color: 'var(--accent)', hint: 'Coordena os demais agentes e decide a estratégia.' },
  { id: 'dev', label: 'Dev', color: 'var(--ok)', hint: 'Implementa o código conforme o plano.' },
  { id: 'revisor', label: 'Revisor', color: 'var(--warn)', hint: 'Revisa o código em busca de bugs e melhorias.' },
  { id: 'testador', label: 'Testador', color: 'var(--err)', hint: 'Escreve e executa os testes.' }
]

export function roleMeta(role: string): { label: string; color: string; hint: string } {
  const norm = role.trim().toLowerCase()
  const p = PRESET_ROLES.find((r) => r.id === norm || r.label.toLowerCase() === norm)
  if (p) return { label: p.label, color: p.color, hint: p.hint }
  return { label: role.trim(), color: 'var(--text-2)', hint: '' }
}
