// Onda 1 · T3: decisão de "abrir no editor externo" a partir de uma entrada da árvore de arquivos.
// Vive aqui (fora do .tsx) porque o vitest só coleta src/**/*.test.ts — componente React não tem
// cobertura automática, esta lógica tem. Quem chama é o onDoubleClick da linha de ARQUIVO em
// FileTreeNode.tsx; a execução de fato (allowlist de editores + fallback pro Finder) é do main,
// em src/main/ide/openInEditor.ts, atrás do IPC 'ide:open'.

import type { FileEntry } from '../../../shared/filetree'

export type IdeOpen = (path: string) => Promise<{ ok: boolean; editor?: string }>

// Regras: só ARQUIVO (o duplo-clique numa pasta pertence ao expandir/colapsar, e `code <pasta>`
// abriria uma janela inteira sem o usuário pedir); caminho vazio não tem o que abrir; e uma
// rejeição do IPC vira `false` em vez de unhandled rejection — o handler é fire-and-forget.
export async function openEntryInEditor(entry: FileEntry, open: IdeOpen): Promise<boolean> {
  if (entry.isDir) return false
  if (typeof entry.path !== 'string' || entry.path.trim() === '') return false
  try {
    const res = await open(entry.path)
    return res?.ok === true
  } catch {
    return false
  }
}
