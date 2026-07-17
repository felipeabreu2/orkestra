// Onda 3 · T4 (CodeMirror) — extensão → linguagem, PURO e testável.
//
// Camada 1 de 2 de propósito: aqui só existe o mapeamento `path → id de linguagem` (string), sem
// nenhum import de CodeMirror. Isso mantém o arquivo testável em ambiente `node` (o vitest deste
// projeto só coleta `src/**/*.test.ts`) e independente da versão/estrutura dos pacotes
// `@codemirror/lang-*`. A tradução `id → LanguageSupport` vive em `cmLanguage.ts` (camada 2), que é
// quem toca a lib. Quem consome as duas é o `FileEditor.tsx`.
//
// Regra do fallback: extensão desconhecida, ausente, dotfile (`.gitignore`) ou caminho degenerado →
// `'plain'`, que a camada 2 traduz para "nenhuma extensão de linguagem" — o editor abre como texto
// puro, sem realce e SEM erro. Nunca lançamos: um arquivo estranho tem de abrir.

export const LANGUAGE_IDS = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'markdown',
  'css',
  'html',
  'python',
  'plain'
] as const

export type LanguageId = (typeof LANGUAGE_IDS)[number]

// Extensão (minúscula, sem ponto) → id. Mantido pequeno de propósito: só as linguagens cujo pacote
// `@codemirror/lang-*` está de fato instalado (ver cmLanguage.ts). Ampliar = adicionar a dep, o id
// em LANGUAGE_IDS e a entrada no Record exaustivo da camada 2 — o typecheck cobra as três.
const BY_EXTENSION: Record<string, LanguageId> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  markdown: 'markdown',
  css: 'css',
  html: 'html',
  htm: 'html',
  py: 'python'
}

// Último segmento não-vazio do caminho (POSIX e Windows) — mesmo critério de basename usado no
// FileTreeNode/quoteSelection; duplicado aqui para o helper não importar componente nenhum.
function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

/**
 * Id de linguagem do CodeMirror para um caminho de arquivo, decidido só pela extensão do basename.
 *
 * `indexOf` do último ponto > 0 no basename: o `> 0` é o que impede que um dotfile (`.env`) seja
 * lido como "extensão env", e olhar só o basename impede que um ponto no DIRETÓRIO (`/v1.2/Makefile`)
 * vire extensão. Extensão vazia (`'a.'`) ou desconhecida → `'plain'`.
 */
export function languageForPath(path: string): LanguageId {
  const base = basename(path)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return 'plain'
  const ext = base.slice(dot + 1).toLowerCase()
  return BY_EXTENSION[ext] ?? 'plain'
}
