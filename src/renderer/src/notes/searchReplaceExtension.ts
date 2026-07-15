import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { findMatches, type TextSegment, type MatchRange } from './findMatches'

// Localizar/substituir dentro da nota (2026-07-14, revisto). O COMPONENTE (NoteFindBar) é a fonte da
// verdade: calcula os matches direto do doc via collectMatches e faz as substituições. Esta extensão
// só cuida do DESTAQUE — recebe o termo + o índice atual e desenha as decorations. Assim o contador
// da barra nunca depende de re-ler o estado do plugin (bug anterior: destaque aparecia, mas o
// contador ficava 0/0 porque o componente lia um estado defasado).

// Coleta os matches no doc (mesma função pura testada, sobre os nós de texto). Usada tanto pelo
// componente (contador/substituição) quanto pelas decorations abaixo — garante que os dois
// concordam sobre onde estão os matches.
export function collectMatches(doc: PMNode, term: string, caseSensitive = false): MatchRange[] {
  const segments: TextSegment[] = []
  doc.descendants((node, pos) => {
    if (node.isText && node.text) segments.push({ text: node.text, pos })
    return true
  })
  return findMatches(segments, term, caseSensitive)
}

interface HighlightState {
  term: string
  index: number
}

const highlightKey = new PluginKey<HighlightState>('orkSearchHighlight')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    orkSearchReplace: {
      // Atualiza o destaque: termo buscado + índice do match "atual". null/'' limpa os destaques.
      setSearchHighlight: (term: string, index: number) => ReturnType
    }
  }
}

export const SearchReplace = Extension.create({
  name: 'orkSearchReplace',

  addProseMirrorPlugins() {
    return [
      new Plugin<HighlightState>({
        key: highlightKey,
        state: {
          init: (): HighlightState => ({ term: '', index: 0 }),
          apply(tr, prev): HighlightState {
            const meta = tr.getMeta(highlightKey) as { term?: string; index?: number } | undefined
            if (!meta) return prev
            return { term: meta.term ?? prev.term, index: meta.index ?? prev.index }
          }
        },
        props: {
          decorations(state) {
            const hl = highlightKey.getState(state)
            if (!hl || !hl.term) return DecorationSet.empty
            const results = collectMatches(state.doc, hl.term)
            if (results.length === 0) return DecorationSet.empty
            return DecorationSet.create(
              state.doc,
              results.map((r, i) =>
                Decoration.inline(r.from, r.to, { class: i === hl.index ? 'ork-find-current' : 'ork-find-match' })
              )
            )
          }
        }
      })
    ]
  },

  addCommands() {
    return {
      setSearchHighlight:
        (term: string, index: number) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(highlightKey, { term, index }))
          return true
        }
    }
  }
})
