import { buildRolePrompt } from './rolePrompt'

// Decisão PURA de COMO injetar o papel no arranque de um terminal-agente (T2). Sem I/O: só
// devolve o plano; quem escreve o arquivo / digita no PTY é o main (registerPtyIpc). Testável
// em isolamento e reusável (main + renderer preview).
export type RoleInjection =
  | { kind: 'none' }
  | { kind: 'file'; filename: string; content: string }
  // Estratégia (B) do plano — "prompt digitado" como fallback para presets sem suporte a arquivo
  // de contexto. Reservada/documentada na união conforme o desenho de T2; nenhum preset atual
  // (claude/codex/gemini) cai aqui, então planRoleInjection não a emite hoje.
  | { kind: 'type'; text: string }

// Mapa preset → arquivo de contexto lido pelo CLI no startup (estratégia A, sem custo de tokens).
// claude lê CLAUDE.md; codex/gemini leem AGENTS.md. shell (e qualquer preset fora deste mapa) não
// recebe injeção por arquivo.
const CONTEXT_FILE_BY_PRESET: Readonly<Record<string, string>> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'AGENTS.md'
}

export function planRoleInjection(opts: { preset?: string; role: string }): RoleInjection {
  // Reusa o builder de T1 (não reimplementa o texto). Papel vazio / papel livre sem prompt → ''.
  const content = buildRolePrompt(opts.role)
  if (!content) return { kind: 'none' } // sem papel efetivo → nada a injetar
  const filename = opts.preset ? CONTEXT_FILE_BY_PRESET[opts.preset] : undefined
  if (filename) return { kind: 'file', filename, content }
  return { kind: 'none' } // shell / preset sem arquivo de contexto
}
