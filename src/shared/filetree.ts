// Fase 19 (Task 1): tipos da árvore de arquivos do canvas (file-explorer node). Espelha o que
// FileTreeService.list() devolve no main; consumido pelo renderer (Task 2) via
// window.orkestra.filetree.list(). Sem dependência de fs/electron — puro cross-process.
export interface FileEntry {
  name: string
  path: string
  isDir: boolean
}
