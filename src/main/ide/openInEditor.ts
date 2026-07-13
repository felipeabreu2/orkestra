// R1 (abrir no editor externo): resolve qual editor abrir a partir de uma lista de candidatos,
// tentando cada um em ordem até um funcionar. Lógica pura e testável — quem executa de fato
// (spawn) e o fallback pro gerenciador de arquivos são injetados por registerIdeIpc no main.

// Comandos de CLI que os editores populares instalam no PATH, na ordem de preferência. O primeiro
// que existir/abrir ganha. São binários fixos (allowlist) — o renderer nunca escolhe o comando,
// só passa a pasta a abrir, então não há caminho de injeção aqui.
export const EDITOR_CANDIDATES = ['code', 'cursor', 'subl', 'zed', 'idea', 'webstorm', 'pycharm'] as const

export interface OpenInEditorResult {
  ok: boolean
  // O comando que funcionou (ex.: 'code'), ou 'files' quando caiu no gerenciador de arquivos do SO.
  editor?: string
}

export interface OpenInEditorDeps {
  // Resolve true se o comando existir e disparar com sucesso; false em ENOENT/erro. Nunca lança.
  tryExec: (cmd: string, args: string[]) => Promise<boolean>
  // Fallback: abre o caminho no gerenciador de arquivos do SO (Finder/Explorer). Opcional.
  openFiles?: (path: string) => Promise<boolean>
  // Sobrescreve a lista de candidatos (usado nos testes).
  candidates?: readonly string[]
}

export async function openInEditor(path: string, deps: OpenInEditorDeps): Promise<OpenInEditorResult> {
  // Caminho vazio (nenhuma pasta vinculada ao projeto) não tem o que abrir.
  if (typeof path !== 'string' || path.trim() === '') return { ok: false }
  const candidates = deps.candidates ?? EDITOR_CANDIDATES
  for (const cmd of candidates) {
    if (await deps.tryExec(cmd, [path])) {
      return { ok: true, editor: cmd }
    }
  }
  // Nenhum editor de código respondeu — abre a pasta no gerenciador de arquivos, se disponível.
  if (deps.openFiles && (await deps.openFiles(path))) {
    return { ok: true, editor: 'files' }
  }
  return { ok: false }
}
