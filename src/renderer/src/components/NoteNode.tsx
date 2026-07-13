import { useEffect } from 'react'
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color, FontSize, FontFamily } from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'
import { useCanvasStore } from '../store/canvasStore'
import { markdownToHtml } from '../markdown/markdownToHtml'
import { noteColorBg } from '../notes/noteColors'
import { registerNoteEditor, unregisterNoteEditor } from '../notes/noteEditorRegistry'
import './nodes.css'

// Extensões compartilhadas por todas as notas (constante de módulo — não recriar por render, o
// TipTap avisa sobre isso). StarterKit já traz bold/italic/strike/underline/heading/listas/code/
// link; text-style traz cor/fonte/tamanho de texto; Image insere imagens por URL.
const NOTE_EXTENSIONS = [StarterKit, TextStyle, Color, FontSize, FontFamily, Image]

export function NoteNode({ id, selected, data }: NodeProps): JSX.Element {
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

  return (
    <>
      <NodeResizer minWidth={160} minHeight={100} isVisible={selected ?? false} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div
        className={`ork-node ork-note${bg ? ' ork-note--colored' : ''}`}
        style={bg ? { background: bg } : undefined}
      >
        {/* Pega de arraste: o editor abaixo tem `nodrag` (para selecionar texto), então cobria o nó
            inteiro e não sobrava área para mover a nota. Esta faixa no topo NÃO é nodrag — é por ela
            que o React Flow arrasta o nó. */}
        <div className="ork-note-drag" title="Arraste para mover a nota" aria-hidden="true" />
        <EditorContent editor={editor} className="nodrag nowheel ork-note-editor" />
      </div>
    </>
  )
}
