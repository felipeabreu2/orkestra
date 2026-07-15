// Helper puro do overlay de git status da árvore de arquivos (extraído de FileTreeNode.tsx para
// ser testável isolado). `entry.path` vem absoluto (join(dir, name) no main); as CHAVES do
// gitStatus são SEMPRE relativas ao TOPLEVEL do repo, não à raiz da árvore. Por isso a chave certa
// é `prefix + relativoÀRaiz(root, path)`, onde `prefix` (do main, via `rev-parse --show-prefix`) é
// o caminho da raiz da árvore DENTRO do repo — '' no toplevel, 'sub/' num subdiretório. Sem o
// prefixo, uma árvore apontando para um subdiretório do repo perdia o marcador nos arquivos
// aninhados (a chave 'deep/a.txt' nunca casava com 'sub/deep/a.txt' do git).

// Descasca o prefixo `root + '/'` de um path absoluto. Se o path não estiver sob a raiz, devolve-o
// como veio (best-effort — melhor uma chave levemente errada do que quebrar). Funciona só para
// POSIX ('/'); o app é macOS-primeiro.
export function relativeToRoot(root: string, path: string): string {
  const prefix = root.endsWith('/') ? root : `${root}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

// Chave de gitStatus.entries para uma entrada da árvore: prefixo do dir dentro do repo + caminho
// relativo à raiz da árvore. Reconstrói o path relativo ao toplevel que o git usa como chave.
export function gitKeyForEntry(prefix: string, root: string, path: string): string {
  return prefix + relativeToRoot(root, path)
}
