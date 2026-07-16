// Onda 3 · T10 — lógica pura do campo de busca da árvore (extraída de FileTreeNode.tsx porque o
// vitest não coleta `.tsx`). Dois modos, decididos pelo PREFIXO do input:
//   · sem prefixo  -> filtra por NOME, client-side, sobre o que já foi carregado (raiz + níveis
//     expandidos). Instantâneo e sem IPC — a árvore é lazy e isto respeita isso: não varre o disco
//     atrás de pastas que o usuário nunca abriu.
//   · `>` inicial  -> busca por CONTEÚDO, delegada ao main (FileTreeService.searchContent), que
//     varre o disco de verdade (recursivo, com tetos). O `>` é o mesmo gesto do quick-open de
//     editores (VS Code usa `>` para comandos; aqui alterna nome→conteúdo).
import type { FileEntry } from '../../../shared/filetree'

export interface ParsedSearch {
  mode: 'name' | 'content'
  query: string
}

// Só o `>` na PRIMEIRA posição alterna o modo — um `>` no meio é texto legítimo (ex.: buscar
// "=> callback" por nome de arquivo não faz sentido, mas "a>b" pode ser um nome real). No modo
// conteúdo a query é trimada (espaço depois do `>` é hábito de digitação, não parte da busca);
// no modo nome o input vai como está — quem decide o que fazer com espaços é o filterByName.
export function parseSearchMode(input: string): ParsedSearch {
  if (input.startsWith('>')) return { mode: 'content', query: input.slice(1).trim() }
  return { mode: 'name', query: input }
}

// Substring case-insensitive sobre o NOME (não o path — buscar "src" não deve devolver o projeto
// inteiro só porque tudo vive sob src/). Query vazia -> NENHUM resultado, não "todos": o chamador
// usa isso para saber que não há busca ativa e mostrar a árvore normal.
export function filterByName(entries: FileEntry[], query: string): FileEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return entries.filter((e) => e.name.toLowerCase().includes(q))
}

// Achata o que a árvore JÁ carregou (raiz + childrenCache) em pré-ordem — pai antes dos filhos,
// mesma ordem visual da árvore expandida. O cache pode ter níveis de pastas já COLAPSADAS (o
// toggle não o limpa) e eles entram de propósito: já pagamos o list, o filtro fica mais útil.
// `visited` corta ciclo (symlink de pasta apontando para um ancestral entra no cache com o mesmo
// path); cache órfão (pasta que saiu da árvore após refresh) é inalcançável e fica de fora.
export function collectLoadedEntries(
  rootEntries: FileEntry[],
  childrenCache: ReadonlyMap<string, FileEntry[]>
): FileEntry[] {
  const out: FileEntry[] = []
  const visited = new Set<string>()
  const visit = (entries: FileEntry[]): void => {
    for (const entry of entries) {
      if (!entry.isDir) {
        out.push(entry)
        continue
      }
      if (visited.has(entry.path)) continue
      visited.add(entry.path)
      out.push(entry)
      const kids = childrenCache.get(entry.path)
      if (kids) visit(kids)
    }
  }
  visit(rootEntries)
  return out
}
