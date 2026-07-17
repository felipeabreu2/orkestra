import type { FileTreeChangedEvent } from '../../../shared/filetree'

// Onda 3 · T9 — as duas decisões do lado do renderer no watch de filesystem, extraídas do
// FileTreeNode.tsx para cá porque são PURAS e precisam de teste: o vitest deste projeto coleta
// `src/**/*.test.ts` e NÃO `.tsx` (ver vitest.config.ts), então lógica dentro do componente é
// lógica sem rede de proteção. O .tsx fica só com a fiação (useEffect/estado).

// QUAIS diretórios o watch deve observar por este nó: a raiz + as pastas EXPANDIDAS, nada mais.
//
// É o escopo "visível", e não a árvore inteira: um watch recursivo num repo grande custa caro,
// e o que está colapsado não pode estar "desatualizado na tela" — ao expandir, o `filetree:list`
// roda na hora e traz o estado fresco. (O main ainda filtra .git/node_modules por cima disto —
// ver watchFilters.ts.)
//
// `root` vazio/indefinido => lista vazia: sem raiz não há o que observar (o nó ainda está
// resolvendo a pasta do projeto ativo, ou não tem pasta nenhuma).
export function watchDirsFor(root: string | undefined, expanded: Iterable<string>): string[] {
  if (!root) return []
  // A raiz vem primeiro; o Set do main deduplica, mas devolver já sem repetição mantém o
  // `watching` do resultado igual ao número de pastas que o usuário vê abertas.
  const out = [root]
  for (const dir of expanded) {
    if (dir && dir !== root && !out.includes(dir)) out.push(dir)
  }
  return out
}

// ESTE push é para MIM, AGORA? Duas guardas, nesta ordem:
//
//  1. Assinatura: um push de outra assinatura (outro nó de árvore no canvas, ou uma assinatura que
//     este nó já substituiu ao trocar de raiz) não é meu.
//  2. Escopo de PROJETO — a guarda que existe por causa do incidente de corrupção cross-project:
//     o main carimba cada push com o projeto que o renderer exibia ao assinar; se o canvas hoje
//     exibe OUTRO projeto (a janela de ms no meio de uma troca, antes do unwatch do unmount
//     chegar), o push é descartado. Sem isto, um watcher do projeto A dispararia um re-list no
//     canvas do projeto B. Mesma regra, literal, do relay de comandos do orq
//     (useOrchestrationSync): sem carimbo (null) ou sem dono conhecido (boot/legado), aplica —
//     degradar para o comportamento antigo é seguro, inventar um escopo não seria.
export function shouldApplyWatchEvent(
  ev: Pick<FileTreeChangedEvent, 'subscriptionId' | 'projectId'>,
  mySubscriptionId: string,
  activeProjectId: string | null
): boolean {
  if (ev.subscriptionId !== mySubscriptionId) return false
  if (ev.projectId != null && activeProjectId != null && ev.projectId !== activeProjectId) return false
  return true
}
