import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { highlightTree } from '@lezer/highlight'
import { languageExtension } from './cmLanguage'
import { languageForPath, LANGUAGE_IDS, type LanguageId } from './languageForPath'
import { orkestraHighlightStyle } from './cmTheme'

// Este teste roda o CodeMirror DE VERDADE (EditorState + parser real, sem DOM): monta o estado com
// a extensão que o FileEditor monta e inspeciona a árvore de sintaxe produzida. Nada de shape
// fabricado — os nomes de nó abaixo saíram da saída real dos parsers @codemirror/lang-*.

// Nomes de nó que só aparecem se o parser CERTO estiver ligado (não só "parseou alguma coisa").
const AMOSTRAS: { path: string; id: LanguageId; doc: string; esperaNo: string }[] = [
  { path: 'a.ts', id: 'typescript', doc: 'const x: number = 1\n', esperaNo: 'TypeAnnotation' },
  { path: 'App.tsx', id: 'tsx', doc: 'const a = <div className="x" />\n', esperaNo: 'JSXSelfClosingTag' },
  { path: 'a.js', id: 'javascript', doc: 'function f() { return 1 }\n', esperaNo: 'FunctionDeclaration' },
  { path: 'a.jsx', id: 'jsx', doc: 'const a = <div />\n', esperaNo: 'JSXElement' },
  { path: 'a.json', id: 'json', doc: '{"a": 1}\n', esperaNo: 'JsonText' },
  { path: 'a.md', id: 'markdown', doc: '# t\n\n**b**\n', esperaNo: 'ATXHeading1' },
  { path: 'a.css', id: 'css', doc: '.a { color: red; }\n', esperaNo: 'RuleSet' },
  { path: 'a.html', id: 'html', doc: '<div class="a">x</div>\n', esperaNo: 'OpenTag' },
  { path: 'a.py', id: 'python', doc: 'def f():\n    return 1\n', esperaNo: 'FunctionDefinition' }
]

// ATENÇÃO ao usar `syntaxTree(state)` direto aqui: `EditorState.create` dá ao parser só 20ms
// (Work.Apply em @codemirror/language) e, estourando o orçamento, chama `takeTree()` — devolvendo
// uma árvore PARCIAL. Com os workers do vitest em paralelo, o primeiro parse de TS estoura os 20ms
// e o teste falha por tempo, não por bug (visto acontecer neste repositório). `ensureSyntaxTree`
// aceita orçamento próprio: aqui pedimos o parse COMPLETO do doc, tornando o teste determinístico.
// (Em produção não há problema: o CM continua o parse em idle time dentro do EditorView.)
function nomesDosNos(id: LanguageId, doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [languageExtension(id)] })
  const tree = ensureSyntaxTree(state, doc.length, 10_000)
  expect(tree, `nenhuma linguagem ligada para '${id}'`).not.toBeNull()
  const nomes: string[] = []
  tree?.iterate({
    enter: (n) => {
      nomes.push(n.name)
    }
  })
  return nomes
}

describe('languageExtension', () => {
  it('tem uma entrada para cada LanguageId (Record exaustivo, sem id órfão)', () => {
    for (const id of LANGUAGE_IDS) expect(() => languageExtension(id)).not.toThrow()
  })

  for (const { path, id, doc, esperaNo } of AMOSTRAS) {
    it(`liga o parser real de ${id} (via languageForPath('${path}'))`, () => {
      // o caminho passa pelas DUAS camadas, como em produção: path → id → extensão.
      expect(languageForPath(path)).toBe(id)
      expect(nomesDosNos(languageForPath(path), doc)).toContain(esperaNo)
    })
  }

  it('plain não parseia nada — abre como texto puro, sem erro', () => {
    expect(languageForPath('dados.xyz')).toBe('plain')
    // sem linguagem ligada não há campo de parse: ensureSyntaxTree devolve null (por isso este caso
    // não passa por nomesDosNos) e o syntaxTree fica vazio. O estado monta — o editor abre.
    const state = EditorState.create({ doc: 'qualquer coisa\n', extensions: [languageExtension('plain')] })
    expect(ensureSyntaxTree(state, state.doc.length, 10_000)).toBeNull()
    const nomes: string[] = []
    syntaxTree(state).iterate({
      enter: (n) => {
        nomes.push(n.name)
      }
    })
    expect(nomes).toEqual([])
  })
})

describe('orkestraHighlightStyle', () => {
  it('pinta as tags do parser real com os tokens --syn-* (nada de hex cru)', () => {
    const doc = 'const x = 1 // oi\n'
    const state = EditorState.create({ doc, extensions: [languageExtension('typescript')] })
    const tree = ensureSyntaxTree(state, doc.length, 10_000)! // completo — ver nota em nomesDosNos
    // classe CSS atribuída a cada trecho pelo highlighter, exatamente como o CM faz ao renderizar.
    const porTrecho: { texto: string; classes: string }[] = []
    highlightTree(tree, orkestraHighlightStyle, (from, to, classes) => {
      porTrecho.push({ texto: doc.slice(from, to), classes })
    })
    const classeDe = (texto: string): string =>
      porTrecho.find((p) => p.texto === texto)?.classes ?? ''
    expect(classeDe('const')).not.toBe('') // keyword recebeu classe
    expect(classeDe('1')).not.toBe('') // number recebeu classe
    expect(classeDe('// oi')).not.toBe('') // comment recebeu classe

    // e a folha de estilo gerada por essas classes usa var(--syn-*) — é isso que faz o realce
    // seguir o tema claro/escuro sem recriar o editor.
    const regras = orkestraHighlightStyle.module?.getRules() ?? ''
    for (const token of ['--syn-keyword', '--syn-string', '--syn-number', '--syn-comment', '--syn-type']) {
      expect(regras).toContain(`var(${token})`)
    }
    expect(regras).not.toMatch(/#[0-9a-f]{6}/i) // nenhuma cor crua escapou para o realce
  })
})
