import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { NodeHandles } from './NodeHandles'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color, FontSize, FontFamily } from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'
import { useCanvasStore } from '../store/canvasStore'
import { markdownToHtml } from '../markdown/markdownToHtml'
import { noteColorBg } from '../notes/noteColors'
import { registerNoteEditor, unregisterNoteEditor } from '../notes/noteEditorRegistry'
import { SearchReplace } from '../notes/searchReplaceExtension'
import { NoteFindBar } from './NoteFindBar'
import { Icon } from './Icon'
import './nodes.css'

// Extensões compartilhadas por todas as notas (constante de módulo — não recriar por render, o
// TipTap avisa sobre isso). StarterKit já traz bold/italic/strike/underline/heading/listas/code/
// link; text-style traz cor/fonte/tamanho de texto; Image insere imagens por URL; SearchReplace
// (2026-07-14) adiciona localizar/substituir dentro da nota (Cmd+F).
const NOTE_EXTENSIONS = [StarterKit, TextStyle, Color, FontSize, FontFamily, Image, SearchReplace]

export function NoteNode({ id, selected, data }: NodeProps): JSX.Element {
  // Localizar/substituir (2026-07-14): barra aberta por Cmd/Ctrl+F (com a nota/editor em foco) ou
  // pelo botão de lupa (visível quando a nota está selecionada).
  const [findOpen, setFindOpen] = useState(false)
  const updateNoteHtml = useCanvasStore((s) => s.updateNoteHtml)
  const d = data as { html?: string; content?: string; color?: string }
  // Migração lazy: nota antiga tem `content` (Markdown) e não `html` — converte na 1ª montagem.
  const initialHtml = d.html ?? (d.content ? markdownToHtml(d.content) : '')
  const bg = noteColorBg(d.color)

  const editor = useEditor({
    extensions: NOTE_EXTENSIONS,
    content: initialHtml,
    onUpdate: ({ editor }) => updateNoteHtml(id, editor.getHTML())
  })

  // Se a migração converteu algo, persiste o HTML já na montagem (senão o `content` seguiria sendo
  // a única fonte e a nota "perderia" a edição ao recarregar).
  useEffect(() => {
    if (editor && !d.html && d.content) updateNoteHtml(id, editor.getHTML())
  }, [editor])

  // Registro para a barra de formatação (NodeToolbar) alcançar este editor.
  useEffect(() => {
    if (!editor) return
    registerNoteEditor(id, editor)
    return () => unregisterNoteEditor(id)
  }, [editor, id])

  // Sincroniza mudanças EXTERNAS do html (ex.: o agente escrevendo via `orq note write`) para o
  // editor, em tempo real. Sem loop: só aplica quando o html do store difere do conteúdo atual do
  // editor (a edição local já deixa os dois iguais). emitUpdate:false para não re-disparar onUpdate.
  useEffect(() => {
    if (!editor) return
    if (typeof d.html === 'string' && d.html !== editor.getHTML()) {
      editor.commands.setContent(d.html, { emitUpdate: false })
    }
  }, [editor, d.html])

  // Cmd/Ctrl+F abre a barra de localizar quando a nota (ou seu editor) tem foco — o keydown do
  // contentEditable borbulha até este container. preventDefault evita qualquer ação padrão.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      setFindOpen(true)
    }
  }

  return (
    <>
      <NodeResizer minWidth={160} minHeight={100} isVisible={selected ?? false} />
      <NodeHandles />
      <div
        className={`ork-node ork-note${bg ? ' ork-note--colored' : ''}`}
        style={bg ? { background: bg } : undefined}
        onKeyDown={onKeyDown}
      >
        {/* Pega de arraste: o editor abaixo tem `nodrag` (para selecionar texto), então cobria o nó
            inteiro e não sobrava área para mover a nota. Esta faixa no topo NÃO é nodrag — é por ela
            que o React Flow arrasta o nó. */}
        <div className="ork-note-drag" title="Arraste para mover a nota" aria-hidden="true" />
        <EditorContent editor={editor} className="nodrag nowheel ork-note-editor" />
      </div>
      {/* Botão de localizar + barra ficam FORA do .ork-note (que tem overflow:hidden e cortaria a
          barra em notas pequenas). Como irmãos, ancoram no wrapper do nó (React Flow) e podem
          transbordar sobre o canvas sem serem clipados. */}
      {selected && !findOpen && (
        <button
          type="button"
          className="ork-note-find-btn nodrag"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setFindOpen(true)}
          title="Localizar na nota (⌘F)"
          aria-label="Localizar na nota"
        >
          <Icon name="Search" size={13} animation="none" />
        </button>
      )}
      {findOpen && editor && <NoteFindBar editor={editor} onClose={() => setFindOpen(false)} />}
    </>
  )
}
