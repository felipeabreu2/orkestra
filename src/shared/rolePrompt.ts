import { roleMeta } from './roles'

// Builder PURO da instrução de arranque de um agente a partir do seu papel. Vive em src/shared
// porque é consumido tanto pelo MAIN (injeção no spawn — T2) quanto pelo RENDERER (preview do
// papel). Sem I/O, sem process/fs: determinística e testável em isolamento.
//
// Resolução de papel é a MESMA de roleMeta (id ou label, case-insensitive, trim). Papel vazio ou
// papel livre sem prompt → string vazia (idempotência: "sem papel" não injeta nada). O framing é
// uma única linha (sem quebras) para permanecer digitável no PTY como fallback da estratégia (B).
export function buildRolePrompt(role: string): string {
  const { label, prompt, hint } = roleMeta(role)
  if (!prompt) return ''
  const tail = hint ? ` ${hint}` : ''
  return `Você atua como o agente ${label} em um workspace multi-agente do Orkestra. ${prompt}${tail}`
}
