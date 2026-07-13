import { useState, type JSX } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { useNoteEditor } from '../notes/useNoteEditor'
import { NOTE_COLORS } from '../notes/noteColors'
import { Icon } from './Icon'

// Barra de formatação da nota (F06/F07) — renderizada dentro do NodeToolbar quando o nó é uma
// nota. Controla o editor TipTap daquela nota (via registry/useNoteEditor). Enquanto o editor não
// registrou (nó recém-selecionado), a barra não aparece.
export function NoteFormatBar({ nodeId }: { nodeId: string }): JSX.Element | null {
  const editor = useNoteEditor(nodeId)
  const updateNoteColor = useCanvasStore((s) => s.updateNoteColor)
  // Inserir imagem por URL sem window.prompt (proibido no projeto): um campo inline que abre ao
  // clicar no botão de imagem e insere no Enter. null = fechado.
  const [imgUrl, setImgUrl] = useState<string | null>(null)

  if (!editor) return null

  // Botão de marca/nó: destaca-se quando o comando está ativo na seleção (editor.isActive). `attrs`
  // cobre casos como heading nível 1. Todos usam .focus() antes do comando para não perder o cursor.
  const mark = (name: string, label: string, icon: string, run: () => void, attrs?: Record<string, unknown>): JSX.Element => (
    <button
      className={`ork-toolbar-btn ork-node-toolbar-icon${editor.isActive(name, attrs) ? ' ork-fmt--on' : ''}`}
      title={label}
      aria-label={label}
      onClick={run}
    >
      <Icon name={icon} size={15} animation="none" />
    </button>
  )

  const insertImage = (): void => {
    const url = imgUrl?.trim()
    if (url) editor.chain().focus().setImage({ src: url }).run()
    setImgUrl(null)
  }

  return (
    <>
      <span className="ork-fmt-colors" role="group" aria-label="Cor da nota">
        {NOTE_COLORS.map((c) => (
          <button
            key={c.key}
            className="ork-fmt-swatch"
            style={{ background: c.bg }}
            title={c.label}
            aria-label={`Cor ${c.label}`}
            onClick={() => updateNoteColor(nodeId, c.key)}
          />
        ))}
      </span>
      <span className="ork-toolbar-divider" />
      {mark('bold', 'Negrito', 'Bold', () => editor.chain().focus().toggleBold().run())}
      {mark('italic', 'Itálico', 'Italic', () => editor.chain().focus().toggleItalic().run())}
      {mark('underline', 'Sublinhado', 'Underline', () => editor.chain().focus().toggleUnderline().run())}
      {mark('strike', 'Tachado', 'Strikethrough', () => editor.chain().focus().toggleStrike().run())}
      <span className="ork-toolbar-divider" />
      {mark('heading', 'Título', 'Heading1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), { level: 1 })}
      {mark('bulletList', 'Lista', 'List', () => editor.chain().focus().toggleBulletList().run())}
      {mark('orderedList', 'Lista numerada', 'ListOrdered', () => editor.chain().focus().toggleOrderedList().run())}
      {mark('code', 'Código', 'Code2', () => editor.chain().focus().toggleCode().run())}
      <span className="ork-toolbar-divider" />
      {imgUrl === null ? (
        <button className="ork-toolbar-btn ork-node-toolbar-icon" title="Imagem" aria-label="Imagem" onClick={() => setImgUrl('')}>
          <Icon name="Image" size={15} animation="none" />
        </button>
      ) : (
        <input
          className="ork-fmt-imgurl"
          value={imgUrl}
          autoFocus
          placeholder="Colar URL da imagem…"
          aria-label="URL da imagem"
          onChange={(e) => setImgUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              insertImage()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setImgUrl(null)
            }
          }}
          onBlur={() => setImgUrl(null)}
        />
      )}
    </>
  )
}
