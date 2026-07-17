// T9 (Notas · incremento 1) — vínculo de uma nota a um arquivo `.md` em disco, lógica pura.
//
// DECISÃO DE ARQUITETURA do incremento: NENHUM código novo no main. Toda a superfície privilegiada
// que a T9 pede já existe, endurecida e testada, na infra da Árvore de Arquivos:
//   · escrita atômica com guard de raiz  -> filetree.write (tmp+fsync+rename, isInsideRoot no main)
//   · leitura com teto/binário           -> filetree.read
//   · watch com debounce e escopo        -> filetree.watch/onChanged (ignora .orktmp — a nossa
//     própria escrita atômica não acorda o watch pelo tmp; só o rename final)
// O que resta é o que vive aqui (puro) e a fiação no NoteNode/NoteFormatBar.
import { joinUnderRoot } from '../components/fileTreeMutate'

// Slug de nome de arquivo a partir do nome da nota. Preserva letras unicode (acentos são o caso
// comum em pt-BR) e troca o resto por '-'; separadores/controle NUNCA sobrevivem (o slug vira
// pedaço de path). Fallback 'nota' — um arquivo ".md" sem nome seria um dotfile invisível.
export function noteFileSlug(name: string): string {
  const safe = name
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return safe.length > 0 ? safe : 'nota'
}

// Caminho candidato para exportar a nota: `<cwd>/<slug>.md`, e a partir da 2ª tentativa
// `<slug>-n.md`. Quem decide se o candidato está livre é o chamador (filetree.read rejeita para
// arquivo inexistente = livre) — export NUNCA sobrescreve um arquivo que já existia.
export function notePathCandidate(cwd: string, name: string, attempt: number): string {
  const slug = noteFileSlug(name)
  const base = attempt > 1 ? `${slug}-${attempt}` : slug
  return joinUnderRoot(cwd, `${base}.md`)
}
