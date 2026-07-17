import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { python } from '@codemirror/lang-python'
import type { Extension } from '@codemirror/state'
import type { LanguageId } from './languageForPath'

// Onda 3 · T4 (CodeMirror) — camada 2: id de linguagem → extensão do CodeMirror. Separada de
// languageForPath.ts (camada 1, puro) para que o mapeamento de EXTENSÃO DE ARQUIVO continue
// testável sem arrastar a lib; aqui é só a tradução para os pacotes @codemirror/lang-*.
//
// O Record é EXAUSTIVO sobre LanguageId de propósito: acrescentar um id em languageForPath.ts sem
// dar a ele uma extensão aqui vira erro de typecheck, não um editor mudo em runtime.
const FACTORIES: Record<LanguageId, () => Extension> = {
  typescript: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  javascript: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  json: () => json(),
  markdown: () => markdown(),
  css: () => css(),
  html: () => html(),
  python: () => python(),
  // 'plain' = nenhuma extensão. Um array vazio É uma Extension válida no CM (composição), então o
  // arquivo desconhecido abre como texto puro: sem realce, sem erro, sem caso especial no chamador.
  plain: () => []
}

/** Extensão de linguagem do CodeMirror para um id resolvido por `languageForPath`. */
export function languageExtension(id: LanguageId): Extension {
  return FACTORIES[id]()
}
