// T4 (`orq role`) — parser PURO dos argumentos do comando (sem rede, sem env). O ramo `role` do
// runOrq só traduz o resultado em requests; toda a decisão "o que o agente pediu" mora aqui, então
// os casos de borda (subcomando faltando/desconhecido, argumento a menos) são testáveis sem servidor.
export type RoleCommand =
  | { action: 'show'; name: string }
  | { action: 'write'; name: string; prompt: string }
  | { action: 'edit'; name: string; from: string; to: string }
  | { action: 'usage' }

export function parseRoleCommand(argv: string[]): RoleCommand {
  const [, sub, name, ...rest] = argv
  if (!name) return { action: 'usage' }
  if (sub === 'show') return { action: 'show', name }
  if (sub === 'write') {
    // Sem aspas, o shell entrega o prompt palavra a palavra — juntamos de volta (mesmo tratamento
    // do `ask`/`note write`). Prompt vazio não é uma escrita válida (limpar papel seria outro verbo).
    const prompt = rest.join(' ')
    return prompt ? { action: 'write', name, prompt } : { action: 'usage' }
  }
  if (sub === 'edit') {
    const [from, to] = rest
    // `to` vazio é LEGÍTIMO (remover um trecho do papel); `to` AUSENTE é argumento faltando. Por
    // isso o teste é contra undefined, não contra falsy.
    if (!from || to === undefined) return { action: 'usage' }
    return { action: 'edit', name, from, to }
  }
  return { action: 'usage' }
}

export const ROLE_USAGE =
  'orq: subcomando de role desconhecido ou argumentos faltando.\nUso: orq role show "<nome>" | orq role write "<nome>" "<prompt inteiro>" | orq role edit "<nome>" "<trecho antigo>" "<trecho novo>"'
