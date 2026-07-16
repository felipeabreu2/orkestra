import { useCallback, useMemo, useRef, useState, type JSX } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { getTerminalPty } from '../terminal/terminalRegistry'
import { buildContextBlock } from '../context/contextBlock'
import { resolveConnectedTerminal, selectionLineRange, quoteLabel } from './quoteSelection'
import { Icon } from './Icon'

// Onda 2 · T4/T5 — editor embutido do FileTreeNode. Deliberadamente um <textarea> monospace, NÃO
// CodeMirror: ver o retorno da task para a justificativa (evitar dep pesada + install de rede +
// bundle; realce de sintaxe é refinamento posterior — a fase 1 pede visualizar/EDITAR conteúdo, que
// o textarea entrega). Duas ações: SALVAR (⌘/Ctrl+S → filetree.write atômico no main, que valida o
// caminho sob a raiz) e CITAR A SELEÇÃO → agente conectado (escreve "[contexto — arquivo:Lx-y]\n…"
// no pty do terminal ligado por aresta a esta árvore, sem disparar Enter). A parte pura (resolver o
// terminal, montar o rótulo) vive em quoteSelection.ts (testada); aqui é só a UI/efeitos.

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
  const [value, setValue] = useState(initialContent)
  // Baseline do que está EM DISCO (atualiza a cada save bem-sucedido) — dirty = value !== savedContent.
  const [savedContent, setSavedContent] = useState(initialContent)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState('')
  const [quoteMsg, setQuoteMsg] = useState('')
  // Seleção capturada no onSelect (sobrevive ao blur do textarea quando o botão citar recebe o clique).
  const selRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })

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
    if (value === savedContent) return
    setSaveState('saving')
    setSaveError('')
    try {
      await window.orkestra.filetree.write(path, value, root)
      setSavedContent(value)
      setSaveState('saved')
      onSaved?.(value)
    } catch (err) {
      setSaveState('error')
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }, [value, savedContent, path, root, onSaved])

  // Cita a seleção atual → escreve o bloco de contexto no pty do terminal conectado (sem Enter).
  const quote = useCallback((): void => {
    const { start, end } = selRef.current
    const selected = value.slice(Math.min(start, end), Math.max(start, end))
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
    const range = selectionLineRange(value, start, end)
    const block = buildContextBlock(quoteLabel(path, range), selected)
    if (!block) {
      setQuoteMsg('selecione um trecho primeiro')
      return
    }
    window.orkestra.pty.write(ptyId, block)
    setQuoteMsg('citação enviada ao agente')
  }, [value, connectedTerminal, path])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void save()
    }
  }

  const captureSelection = (e: React.SyntheticEvent<HTMLTextAreaElement>): void => {
    const el = e.currentTarget
    selRef.current = { start: el.selectionStart, end: el.selectionEnd }
  }

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
          citar seleção
        </button>
        <span className="ork-filetree-editor-status" aria-live="polite">
          {saveState === 'saving'
            ? 'salvando…'
            : saveState === 'error'
              ? `erro: ${saveError}`
              : quoteMsg || (saveState === 'saved' ? 'salvo no disco' : '')}
        </span>
      </div>
      <textarea
        className="nodrag nowheel ork-filetree-textarea"
        value={value}
        spellCheck={false}
        onChange={(e) => {
          setValue(e.target.value)
          if (saveState !== 'idle') setSaveState('idle')
          if (quoteMsg) setQuoteMsg('')
        }}
        onKeyDown={onKeyDown}
        onSelect={captureSelection}
        onKeyUp={captureSelection}
        onMouseUp={captureSelection}
      />
    </div>
  )
}
