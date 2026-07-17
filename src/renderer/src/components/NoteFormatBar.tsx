import { useState, type JSX } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { useNoteEditor } from '../notes/useNoteEditor'
import { NOTE_COLORS } from '../notes/noteColors'
import { useNoteRaw, toggleNoteRaw } from '../notes/noteRawModeRegistry'
import { deriveNoteName } from '../notes/noteName'
import { noteHtmlToRaw } from '../notes/noteRawSync'
import { notePathCandidate } from '../notes/noteFileLink'
import { Icon } from './Icon'

// Barra de formatação da nota (F06/F07) — renderizada dentro do NodeToolbar quando o nó é uma
// nota. Controla o editor TipTap daquela nota (via registry/useNoteEditor). Enquanto o editor não
// registrou (nó recém-selecionado), a barra não aparece.
export function NoteFormatBar({ nodeId }: { nodeId: string }): JSX.Element | null {
  const editor = useNoteEditor(nodeId)
  const updateNoteColor = useCanvasStore((s) => s.updateNoteColor)
  const updateNoteFilePath = useCanvasStore((s) => s.updateNoteFilePath)
  // T9: dados da nota para o vínculo com arquivo (.md). O find por render é barato (a barra só
  // existe para a nota selecionada).
  const noteData = useCanvasStore((s) => s.nodes.find((n) => n.id === nodeId)?.data) as
    | { html?: string; name?: string; filePath?: string }
    | undefined
  const filePath = noteData?.filePath
  const [exporting, setExporting] = useState(false)

  // Exporta a nota para `<cwd-do-projeto>/<slug>.md` e vincula. NUNCA sobrescreve arquivo
  // existente: filetree.read como teste de existência (rejeitou = livre), sufixo -n até 20.
  // O guard de raiz da escrita (isInsideRoot) roda no MAIN via filetree.write.
  const exportMd = async (): Promise<void> => {
    setExporting(true)
    try {
      const idx = await window.orkestra.projects.list()
      const cwd = idx.projects.find((p) => p.id === idx.activeId)?.cwd
      if (!cwd) return
      const name = deriveNoteName({ name: noteData?.name, html: noteData?.html })
      for (let attempt = 1; attempt <= 20; attempt++) {
        const candidate = notePathCandidate(cwd, name, attempt)
        const livre = await window.orkestra.filetree
          .read(candidate)
          .then(() => false)
          .catch(() => true)
        if (!livre) continue
        await window.orkestra.filetree.write(candidate, noteHtmlToRaw(noteData?.html ?? ''), cwd)
        updateNoteFilePath(nodeId, candidate)
        return
      }
    } catch {
      // falha de export não pode quebrar a barra; o usuário tenta de novo (o erro de sync
      // contínuo, esse sim persistente, aparece no próprio NoteNode)
    } finally {
      setExporting(false)
    }
  }
  // Toggle raw ↔ formatada (T7): estado efêmero fora do store; o NoteNode escuta o mesmo registry e
  // troca o EditorContent por um textarea com o Markdown cru.
  const raw = useNoteRaw(nodeId)
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
      <span className="ork-toolbar-divider" />
      <button
        className={`ork-toolbar-btn ork-node-toolbar-icon${raw ? ' ork-fmt--on' : ''}`}
        title={raw ? 'Ver formatada' : 'Ver Markdown cru'}
        aria-label={raw ? 'Ver formatada' : 'Ver Markdown cru'}
        aria-pressed={raw}
        onClick={() => toggleNoteRaw(nodeId)}
      >
        <Icon name="Braces" size={15} animation="none" />
      </button>
      {/* T9 (notas .md em disco): vincular grava um `.md` novo na pasta do projeto ativo (nunca
          sobrescreve arquivo que já existia — sufixo -n) e liga o auto-sync do NoteNode;
          desvincular só desfaz o vínculo — o ARQUIVO fica (paridade Maestri: excluir do canvas
          não apaga memória durável). */}
      {filePath ? (
        <button
          className="ork-toolbar-btn ork-node-toolbar-icon ork-fmt--on"
          title={`Vinculada a ${filePath} — clique para desvincular (o arquivo fica)`}
          aria-label="Desvincular do arquivo .md (o arquivo fica)"
          onClick={() => updateNoteFilePath(nodeId, undefined)}
        >
          <Icon name="FileText" size={15} animation="none" />
        </button>
      ) : (
        <button
          className="ork-toolbar-btn ork-node-toolbar-icon"
          title="Salvar como .md na pasta do projeto (a nota passa a viver no arquivo)"
          aria-label="Salvar como arquivo .md"
          disabled={exporting}
          onClick={() => void exportMd()}
        >
          <Icon name="FileDown" size={15} animation="none" />
        </button>
      )}
    </>
  )
}
