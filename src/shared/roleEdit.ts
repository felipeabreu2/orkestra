import { roleMeta } from './roles'
import { parseRoleSidecar, buildRoleSidecar, type RoleSidecar } from './roleSidecar'

// T4 (`orq role`) — regras PURAS de leitura/edição do papel. Vivem em src/shared porque o servidor
// de orquestração (main) as aplica, e o cliente `orq` só transporta os argumentos: sem fs, sem HTTP,
// testáveis em isolamento.

// Substitui UMA ocorrência de `from` por `to` em `prompt` (paridade com `maestri role edit`).
// LITERAL dos dois lados: `from` é texto do agente e viraria regex num `replace` com RegExp; `to`
// passa por uma função para o `$&`/`$1` do replace não ser expandido. `from` ausente (ou vazio) →
// devolve o texto ORIGINAL: a operação é idempotente e nunca lança — reescrever o próprio papel não
// pode explodir na mão do agente.
export function applyRoleEdit(prompt: string, from: string, to: string): string {
  if (from === '') return prompt
  const at = prompt.indexOf(from)
  if (at === -1) return prompt
  return prompt.slice(0, at) + to + prompt.slice(at + from.length)
}

// Papel ATUAL de um nó, na ordem: sidecar em disco (fonte primária — pode ter sido refinado por
// `orq role write/edit`) → papel do nó no espelho (mesmo derivador do spawn, buildRoleSidecar, para
// `role show` funcionar em terminal que ainda não gravou arquivo) → sidecar mínimo (nó sem papel:
// nome do nó, prompt vazio). Nunca lança: `raw` vem de um arquivo fora do controle do app e o
// parseRoleSidecar já é defensivo.
export function resolveRoleSidecar(raw: string | null, node: { name: string; role?: string }): RoleSidecar {
  const parsed = parseRoleSidecar(raw)
  if (parsed) return parsed
  const derived = buildRoleSidecar(node.role ?? '')
  if (derived) return derived
  return { name: node.name, color: roleMeta('').color, prompt: '' }
}
