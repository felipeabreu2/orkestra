import { noteText } from './noteText'

export interface NoteTargetNode {
  id: string
  data?: Record<string, unknown>
}

/**
 * Resolve o alvo do `orq note write --to "<nome/id>"` entre as notas do canvas (Notas §5).
 *
 * Ordem DETERMINÍSTICA: `id` exato → `data.name` exato (case-insensitive) → prefixo do texto do
 * corpo (fallback legado). Antes só existia id → prefixo do texto: com duas notas de começo
 * parecido (ex.: duas "TODO AGENT ..."), o comando escrevia na errada e ainda respondia `ok`.
 * O nome personalizado (`data.name`, Notas #10) é o identificador estável — por isso vence o texto.
 *
 * Alvo vazio/ausente → `undefined` (o chamador cai nos outros critérios: edge do `from`, 1ª nota).
 * Função pura.
 */
export function resolveNoteTarget<T extends NoteTargetNode>(notes: T[], target?: string): T | undefined {
  const raw = (target ?? '').trim()
  if (!raw) return undefined
  const wanted = raw.toLowerCase()
  return (
    notes.find((n) => n.id === raw) ??
    notes.find((n) => ((n.data?.name as string) ?? '').trim().toLowerCase() === wanted) ??
    notes.find((n) => noteText(n.data).toLowerCase().startsWith(wanted))
  )
}
