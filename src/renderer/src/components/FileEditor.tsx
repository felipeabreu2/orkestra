import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  rectangularSelection,
  crosshairCursor
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { search, searchKeymap, openSearchPanel, gotoLine } from '@codemirror/search'
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language'
import { useCanvasStore } from '../store/canvasStore'
import { getTerminalPty } from '../terminal/terminalRegistry'
import { buildContextBlock } from '../context/contextBlock'
import { resolveConnectedTerminal, selectionLineRange, quoteLabel } from './quoteSelection'
import { languageForPath } from '../editor/languageForPath'
import { languageExtension } from '../editor/cmLanguage'
import { orkestraCodeMirrorTheme } from '../editor/cmTheme'
import { Icon } from './Icon'

// Onda 3 · T4 — editor embutido do FileTreeNode sobre CODEMIRROR (era um <textarea>; a troca é a
// primeira tarefa da Onda 3, "Árvore como IDE colaborativo"). O que o CodeMirror traz: realce de
// sintaxe por linguagem, find/replace (⌘F) e ir-para-linha (⌘⌥G, o binding do searchKeymap) —
// este último destrava o "abrir na linha" da busca (T10).
//
// O CONTRATO com o resto do app é o mesmo do textarea e não pode regredir:
//   • SALVAR (⌘/Ctrl+S) → filetree.write, que grava atômico e valida o caminho sob a raiz NO MAIN;
//   • CITAR SELEÇÃO → escreve "[contexto — arquivo:Lx-y]\n…" no pty do terminal ligado por aresta,
//     sem Enter de disparo;
//   • binário/truncado não chegam aqui — o FileTreeNode só monta este componente para texto íntegro
//     (salvar um arquivo truncado destruiria o resto).
//
// SELEÇÃO (o ponto de maior risco da migração): o textarea dava `selectionStart/End`; o CodeMirror
// dá `view.state.selection.main.{from,to}`. As duas são offsets de caractere no MESMO texto, então
// `selectionLineRange`/`quoteLabel` (puros, testados em quoteSelection.test.ts) seguem valendo sem
// alteração — só a leitura muda. E some um problema: não precisamos mais capturar a seleção em
// onSelect/onMouseUp para sobreviver ao blur, porque o EditorState guarda a seleção mesmo com o
// editor desfocado (o clique no botão "citar" não a apaga).

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface FileEditorProps {
  // id do NÓ da árvore no React Flow — usado para resolver o terminal conectado por aresta.
  nodeId: string
  path: string
  // raiz da árvore: enviada ao main junto do write para a validação de caminho (isInsideRoot).
  root: string
  initialContent: string
  // notifica o pai (FileTreeNode) do conteúdo salvo, para manter o preview coerente sem reler o disco.
  onSaved?: (content: string) => void
}

export function FileEditor({ nodeId, path, root, initialContent, onSaved }: FileEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)

  // Espelho reativo do doc: o CodeMirror é a fonte de verdade do texto, mas React precisa de estado
  // para re-renderizar o rótulo do botão (salvar*/salvo). Só o comprimento do doc trafega aqui, não
  // é um segundo editor.
  const [value, setValue] = useState(initialContent)
  // Baseline do que está EM DISCO (atualiza a cada save bem-sucedido) — dirty = value !== savedContent.
  const [savedContent, setSavedContent] = useState(initialContent)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState('')
  const [quoteMsg, setQuoteMsg] = useState('')

  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  // Conjunto de ids de nós-terminal, para o filtro de resolveConnectedTerminal (uma árvore pode
  // estar ligada a notas/portais também — só terminal tem pty).
  const terminalIds = useMemo(
    () => new Set(nodes.filter((n) => n.type === 'terminal').map((n) => n.id)),
    [nodes]
  )
  const connectedTerminal = useMemo(
    () => resolveConnectedTerminal(nodeId, edges, terminalIds),
    [nodeId, edges, terminalIds]
  )

  const dirty = value !== savedContent

  const save = useCallback(async (): Promise<void> => {
    // Lê o doc do EditorView, não do state do React: o atalho ⌘S dispara dentro do CodeMirror e o
    // espelho `value` pode estar um keystroke atrás (o updateListener agenda um setState).
    const atual = viewRef.current?.state.doc.toString() ?? value
    if (atual === savedContent) return
    setSaveState('saving')
    setSaveError('')
    try {
      await window.orkestra.filetree.write(path, atual, root)
      setSavedContent(atual)
      setSaveState('saved')
      onSaved?.(atual)
    } catch (err) {
      setSaveState('error')
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }, [value, savedContent, path, root, onSaved])

  // O keymap é montado UMA vez (na criação do EditorView) e capturaria a primeira versão de `save`
  // para sempre — salvando conteúdo velho contra uma baseline velha. Este ref mantém o atalho
  // apontando para o `save` do render atual.
  const saveRef = useRef(save)
  saveRef.current = save

  // Cita a seleção atual → escreve o bloco de contexto no pty do terminal conectado (sem Enter).
  const quote = useCallback((): void => {
    const view = viewRef.current
    if (!view) return
    const doc = view.state.doc.toString()
    // `selection.main` = seleção primária (o CM tem múltiplos cursores; citamos a principal).
    // `from`/`to` já vêm normalizados (from <= to), diferente do textarea, onde a seleção podia vir
    // invertida se o usuário arrastasse para trás.
    const { from, to } = view.state.selection.main
    const selected = doc.slice(from, to)
    if (!selected.trim()) {
      setQuoteMsg('selecione um trecho primeiro')
      return
    }
    if (!connectedTerminal) {
      setQuoteMsg('nenhum terminal conectado a esta árvore')
      return
    }
    const ptyId = getTerminalPty(connectedTerminal)
    if (!ptyId) {
      setQuoteMsg('o terminal conectado ainda não tem processo')
      return
    }
    const range = selectionLineRange(doc, from, to)
    const block = buildContextBlock(quoteLabel(path, range), selected)
    if (!block) {
      setQuoteMsg('selecione um trecho primeiro')
      return
    }
    window.orkestra.pty.write(ptyId, block)
    setQuoteMsg('citação enviada ao agente')
  }, [connectedTerminal, path])

  // Monta o EditorView uma única vez. O FileTreeNode passa key={previewPath}, então trocar de
  // arquivo remonta o componente — `path`/`initialContent` não mudam sob os pés deste efeito.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const extensions: Extension[] = [
      lineNumbers(),
      foldGutter(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      rectangularSelection(),
      crosshairCursor(),
      indentOnInput(),
      bracketMatching(),
      EditorState.allowMultipleSelections.of(true),
      search({ top: true }),
      keymap.of([
        // ⌘S antes de tudo: o defaultKeymap não usa Mod-s, mas a prioridade explícita deixa claro
        // que salvar nunca é sequestrado por outra extensão.
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => {
            void saveRef.current()
            return true
          }
        },
        // ⌘F busca, ⌘⌥G ir-para-linha, ⌘D próxima ocorrência.
        // SEM o Mod-g do searchKeymap (próxima ocorrência): ⌘G neste app é do CANVAS (agrupar), e
        // o handler global do Canvas roda ANTES do guard isTypingTarget de propósito ("é comando,
        // não texto"). Como o keydown do CodeMirror BORBULHA até o window mesmo com
        // preventDefault, deixar o binding aqui faria um único ⌘G buscar a próxima ocorrência E
        // agrupar os nós selecionados. Próxima/anterior continuam em F3/⇧F3 e no Enter do painel.
        ...searchKeymap.filter((b) => b.key !== 'Mod-g'),
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        indentWithTab
      ]),
      // Linguagem por extensão do arquivo: languageForPath (puro/testado) → languageExtension.
      // Desconhecida → 'plain' → sem realce, e o arquivo abre igual.
      languageExtension(languageForPath(path)),
      orkestraCodeMirrorTheme,
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (!u.docChanged) return
        setValue(u.state.doc.toString())
        setSaveState((s) => (s === 'idle' ? s : 'idle'))
        setQuoteMsg((m) => (m ? '' : m))
      })
    ]

    const view = new EditorView({
      state: EditorState.create({ doc: initialContent, extensions }),
      parent: host
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // deps vazias de propósito: montar uma vez. Ver o comentário acima do efeito.
  }, [])

  return (
    <div className="ork-filetree-editor">
      <div className="ork-filetree-editor-actions">
        <button
          className="nodrag ork-filetree-editbtn"
          onClick={() => void save()}
          disabled={!dirty || saveState === 'saving'}
          title="Salvar (⌘S)"
        >
          <Icon name="Save" size={13} animation="none" />
          {dirty ? 'salvar*' : 'salvo'}
        </button>
        <button
          className="nodrag ork-filetree-editbtn"
          onClick={quote}
          disabled={!connectedTerminal}
          title={
            connectedTerminal
              ? 'Enviar a seleção ao agente conectado'
              : 'Ligue esta árvore a um terminal para citar ao agente'
          }
        >
          <Icon name="MessageSquare" size={13} animation="none" />
          citar
        </button>
        {/* Busca e ir-para-linha também têm atalho (⌘F / ⌘⌥G), mas o editor vive dentro de um nó do
            canvas: sem botão, ninguém descobre que existem. Os dois comandos precisam do editor
            focado para agir sobre ele — daí o view.focus() antes. */}
        <button
          className="nodrag ork-filetree-editbtn"
          onClick={() => {
            const view = viewRef.current
            if (!view) return
            view.focus()
            openSearchPanel(view)
          }}
          title="Buscar / substituir (⌘F)"
        >
          <Icon name="Search" size={13} animation="none" />
          buscar
        </button>
        <button
          className="nodrag ork-filetree-editbtn"
          onClick={() => {
            const view = viewRef.current
            if (!view) return
            view.focus()
            gotoLine(view)
          }}
          title="Ir para a linha (⌘⌥G)"
        >
          <Icon name="CornerDownRight" size={13} animation="none" />
          linha
        </button>
        <span className="ork-filetree-editor-status" aria-live="polite">
          {saveState === 'saving'
            ? 'salvando…'
            : saveState === 'error'
              ? `erro: ${saveError}`
              : quoteMsg || (saveState === 'saved' ? 'salvo no disco' : '')}
        </span>
      </div>
      {/* nodrag: selecionar texto não pode arrastar o nó no canvas. nowheel: a roda rola o editor,
          não dá zoom no canvas. Mesmo par usado pelo textarea anterior e pelo editor de notas. */}
      <div ref={hostRef} className="nodrag nowheel ork-filetree-cm" />
    </div>
  )
}
