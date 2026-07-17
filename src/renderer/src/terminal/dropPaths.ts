/** Envolve um caminho em aspas simples (seguro para espaços e unicode) para digitar no shell;
    aspas simples internas viram a sequência '\'' (fecha, escapa a aspa, reabre). */
export function quotePathForShell(p: string): string {
  return `'${p.replace(/'/g, "'\\''")}'`
}

/** Junta os caminhos de um drop num texto pronto para inserir no terminal, com um espaço no
    fim para separar do que o usuário digitar em seguida. Entradas vazias são ignoradas. */
export function pathsToTerminalInput(paths: string[]): string {
  const cleaned = paths.filter((p) => p.length > 0)
  if (cleaned.length === 0) return ''
  return cleaned.map(quotePathForShell).join(' ') + ' '
}

/** MIME interno usado quando uma linha de arquivo da árvore (FileTreeNode) é arrastada — distingue
    um drag NOSSO (payload = caminho absoluto, já resolvido no renderer) de um drop de arquivo
    externo do Finder (que chega em dataTransfer.files como File). */
export const ORKESTRA_PATH_MIME = 'application/x-orkestra-path'

// Forma mínima de DataTransfer que readDroppedPaths precisa — mantém o helper puro/testável sem
// depender do DOM (o teste passa um objeto literal).
interface DataTransferLike {
  types: readonly string[]
  getData: (format: string) => string
  files: ArrayLike<File>
}

/** Extrai os caminhos absolutos de um evento de drop, cobrindo os dois fluxos de origem:
    (a) drag INTERNO da árvore de arquivos — o caminho vem no MIME ORKESTRA_PATH_MIME (já absoluto);
    (b) drop EXTERNO do Finder — cada File é resolvido pelo `resolveFile` do chamador (getPathForFile
    no preload; este módulo é puro e nunca toca em webUtils/fs).
    O payload interno tem prioridade; sem ele, cai nos arquivos externos; sem nenhum, devolve [].
    De propósito NÃO consome `text/plain` solto: evita injetar no terminal um texto qualquer
    arrastado (seleção), preservando o comportamento antigo de só reagir a arquivos/à árvore. */
export function readDroppedPaths(
  dt: DataTransferLike,
  resolveFile: (file: File) => string = () => ''
): string[] {
  if (dt.types.includes(ORKESTRA_PATH_MIME)) {
    const raw = dt.getData(ORKESTRA_PATH_MIME)
    return raw.length > 0 ? [raw] : []
  }
  if (dt.files.length > 0) {
    return Array.from(dt.files).map(resolveFile).filter((p) => p.length > 0)
  }
  return []
}
