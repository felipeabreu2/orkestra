import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import type { EditorView } from '@tiptap/pm/view'
import { NodeHandles } from './NodeHandles'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color, FontSize, FontFamily } from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'
import { useCanvasStore } from '../store/canvasStore'
import { markdownToHtml } from '../markdown/markdownToHtml'
import { noteColorBg } from '../notes/noteColors'
import { registerNoteEditor, unregisterNoteEditor } from '../notes/noteEditorRegistry'
import { useNoteRaw } from '../notes/noteRawModeRegistry'
import { noteHtmlToRaw, noteRawToHtml } from '../notes/noteRawSync'
import { SearchReplace } from '../notes/searchReplaceExtension'
import { normalizeNoteName } from '../notes/noteRename'
import { pickImageFile, isImageDataUri, MAX_IMAGE_BYTES } from '../notes/imagePaste'
import { parentDir } from './fileTreeMutate'
import { shouldApplyWatchEvent } from './fileTreeWatch'
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
  const updateNoteName = useCanvasStore((s) => s.updateNoteName)
  const d = data as { html?: string; content?: string; color?: string; name?: string; filePath?: string }
  // Notas #10 (T2): renomear a nota por duplo-clique na faixa de arraste. data.name vazio = volta à
  // nomeação automática pela 1ª linha (mirror/orq list). normalizeNoteName apara/colapsa/corta em 40.
  const customName = (d.name ?? '').trim()
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(customName)
  const commitName = (): void => {
    setRenaming(false)
    updateNoteName(id, normalizeNoteName(nameDraft))
  }
  // Migração lazy: nota antiga tem `content` (Markdown) e não `html` — converte na 1ª montagem.
  const initialHtml = d.html ?? (d.content ? markdownToHtml(d.content) : '')
  const bg = noteColorBg(d.color)

  // Toggle raw ↔ formatada (T7): no modo raw mostramos o Markdown cru num textarea; a alternância é
  // disparada pela NoteFormatBar (via noteRawModeRegistry). O rascunho é semeado do HTML atual só ao
  // ENTRAR no modo raw; cada edição grava markdownToHtml(rascunho) no store (mantém a fonte da
  // verdade sincronizada, sem re-semear o texto enquanto o usuário digita).
  const raw = useNoteRaw(id)
  const [rawDraft, setRawDraft] = useState('')
  useEffect(() => {
    if (raw) setRawDraft(noteHtmlToRaw(d.html ?? ''))
  }, [raw])

  // ── T9 (notas .md em disco · incremento 1): sincronização nota ↔ arquivo vinculado ───────────
  //
  // Construído INTEIRO sobre a infra endurecida da Árvore (filetree.write atômico com guard de
  // raiz no main, filetree.read, filetree.watch com debounce e escopo de projeto) — nenhum código
  // novo no processo privilegiado. Três pernas:
  //  1. ADOÇÃO (mount/vínculo novo): o DISCO vence — lê o arquivo e aplica na nota se diferirem.
  //     É o que faz `git pull`/edição externa com o app fechado aparecerem ao abrir.
  //  2. ESCRITA (nota→arquivo): cada edição, com debounce, grava htmlToMarkdown no arquivo. O
  //     guard de raiz usa o cwd do projeto ATIVO, resolvido a cada escrita.
  //  3. WATCH (arquivo→nota): edição externa dispara releitura; `lastMdRef` corta o ECO da nossa
  //     própria escrita (o evento do rename final voltaria como "mudança externa"). Round-trip
  //     md→html→md pode normalizar o texto uma vez (T7 garante estabilidade dali em diante).
  // Excluir a nota do canvas NUNCA apaga o arquivo (não existe caminho de delete aqui).
  const filePath = d.filePath
  const [fileMsg, setFileMsg] = useState('')
  // Último markdown SABIDO do arquivo (adotado ou gravado). null = ainda não adotado — a escrita
  // fica bloqueada até a adoção, senão o mount sobrescreveria conteúdo externo mais novo.
  const lastMdRef = useRef<string | null>(null)

  // Perna 1 + 3: adoção inicial e watch do diretório do arquivo.
  useEffect(() => {
    if (!filePath) {
      lastMdRef.current = null
      setFileMsg('')
      return undefined
    }
    const subId = crypto.randomUUID()
    let cancelled = false

    const applyFromDisk = (): void => {
      window.orkestra.filetree
        .read(filePath)
        .then((r) => {
          if (cancelled || r.binary) return
          if (r.content === lastMdRef.current) return // eco da nossa própria escrita
          lastMdRef.current = r.content
          const html = noteRawToHtml(r.content)
          if (html !== (useCanvasStore.getState().nodes.find((n) => n.id === id)?.data as { html?: string })?.html) {
            updateNoteHtml(id, html)
          }
          setFileMsg('')
        })
        .catch(() => {
          if (!cancelled) setFileMsg('arquivo da nota não encontrado (movido/apagado por fora?)')
        })
    }

    const dispose = window.orkestra.filetree.onChanged((ev) => {
      if (cancelled) return
      if (!shouldApplyWatchEvent(ev, subId, useCanvasStore.getState().activeProjectId ?? null)) return
      if (ev.kind === 'error') {
        setFileMsg(ev.message ?? 'auto-sync do arquivo indisponível')
        return
      }
      applyFromDisk()
    })

    applyFromDisk() // adoção: o estado do disco entra antes de qualquer escrita nossa
    window.orkestra.filetree
      .watch(subId, [parentDir(filePath)], useCanvasStore.getState().activeProjectId ?? null)
      .then((r) => {
        if (!cancelled && !r.ok) setFileMsg(r.errors.join('; ') || 'auto-sync do arquivo indisponível')
      })
      .catch((err) => {
        if (!cancelled) setFileMsg(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
      dispose()
      void window.orkestra.filetree.unwatch(subId).catch(() => {})
    }
  }, [filePath, id])

  // Perna 2: escrita nota→arquivo, debounced. Bloqueada até a adoção (lastMdRef null).
  useEffect(() => {
    if (!filePath || lastMdRef.current === null) return undefined
    const md = noteHtmlToRaw(d.html ?? '')
    if (md === lastMdRef.current) return undefined
    const t = setTimeout(() => {
      void (async () => {
        try {
          const idx = await window.orkestra.projects.list()
          const cwd = idx.projects.find((p) => p.id === idx.activeId)?.cwd
          if (!cwd) return // sem projeto ativo não há raiz para o guard — não grava às cegas
          await window.orkestra.filetree.write(filePath, md, cwd)
          lastMdRef.current = md
          setFileMsg('')
        } catch (err) {
          // ex.: arquivo fora da raiz do projeto ativo (nota de outro projeto) — erro visível
          setFileMsg(err instanceof Error ? err.message : String(err))
        }
      })()
    }, 600)
    return () => clearTimeout(t)
  }, [filePath, d.html])

  // T6 (colar imagem): aviso transiente quando a colagem é recusada (teto de bytes / formato).
  // Recusar em silêncio faria o usuário colar de novo achando que falhou por acaso.
  const [imgMsg, setImgMsg] = useState('')
  useEffect(() => {
    if (!imgMsg) return undefined
    const t = setTimeout(() => setImgMsg(''), 4000)
    return () => clearTimeout(t)
  }, [imgMsg])

  // Insere um File de imagem como nó image do editor, via TRANSAÇÃO ProseMirror (nunca innerHTML —
  // SEC-1). FileReader → data URI raster validado (isImageDataUri: allowlist, SVG fora) → nó image
  // no lugar da seleção. O dispatch atravessa o dispatchTransaction do TipTap, então o onUpdate
  // acima roda e o data.html persiste sozinho. Teto de bytes: data URI vive dentro do snapshot
  // JSON do projeto — ver MAX_IMAGE_BYTES.
  const insertImageFromFile = (view: EditorView, file: File): void => {
    if (file.size > MAX_IMAGE_BYTES) {
      setImgMsg(
        `imagem grande demais (${Math.round(file.size / 1024)}KB — teto ${Math.round(MAX_IMAGE_BYTES / 1024)}KB)`
      )
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : ''
      if (!isImageDataUri(src)) {
        setImgMsg('formato de imagem não suportado')
        return
      }
      const node = view.state.schema.nodes.image?.create({ src })
      if (!node) return
      view.dispatch(view.state.tr.replaceSelectionWith(node))
    }
    reader.readAsDataURL(file)
  }

  const editor = useEditor({
    extensions: NOTE_EXTENSIONS,
    content: initialHtml,
    onUpdate: ({ editor }) => updateNoteHtml(id, editor.getHTML()),
    // T6: colar (⌘V de um print) ou soltar um arquivo de imagem DENTRO do editor insere a imagem
    // inline. `false` devolve o evento ao fluxo normal (texto cola como sempre; drop de caminho da
    // árvore continua com quem já o tratava).
    editorProps: {
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        const file = items ? pickImageFile(Array.from(items)) : null
        if (!file) return false
        event.preventDefault()
        insertImageFromFile(view, file)
        return true
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files
        const file = files
          ? pickImageFile(Array.from(files).map((f) => ({ type: f.type, getAsFile: () => f })))
          : null
        if (!file) return false
        event.preventDefault()
        insertImageFromFile(view, file)
        return true
      }
    }
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
        <div
          className={`ork-note-drag${customName || renaming ? ' ork-note-drag--named' : ''}`}
          title="Arraste para mover · duplo-clique para renomear"
          onDoubleClick={(e) => {
            e.stopPropagation()
            setNameDraft(customName)
            setRenaming(true)
          }}
        >
          {renaming ? (
            <input
              className="ork-note-name-input nodrag"
              autoFocus
              value={nameDraft}
              placeholder="Nome da nota"
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') commitName()
                else if (e.key === 'Escape') setRenaming(false)
              }}
            />
          ) : customName ? (
            <span className="ork-note-name">{customName}</span>
          ) : null}
          {/* T9: crachá do vínculo com arquivo .md — o title mostra o caminho; erro de sync pinta
              de --warn (arquivo sumiu, escrita recusada) para a degradação nunca ser invisível. */}
          {filePath && !renaming && (
            <span
              className={`ork-note-filebadge${fileMsg ? ' ork-note-filebadge--warn' : ''}`}
              title={fileMsg ? `${filePath} — ${fileMsg}` : `Vinculada a ${filePath}`}
            >
              <Icon name="FileText" size={11} animation="none" />
            </span>
          )}
        </div>
        {raw ? (
          <textarea
            className="ork-note-raw nodrag nowheel"
            value={rawDraft}
            aria-label="Markdown cru da nota"
            spellCheck={false}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              setRawDraft(e.target.value)
              updateNoteHtml(id, noteRawToHtml(e.target.value))
            }}
          />
        ) : (
          <EditorContent editor={editor} className="nodrag nowheel ork-note-editor" />
        )}
        {/* T6: aviso transiente de colagem recusada (some sozinho em 4s). */}
        {imgMsg && (
          <div className="ork-note-imgmsg" role="status">
            {imgMsg}
          </div>
        )}
        {/* T9: erro de sync com o arquivo vinculado — persistente até resolver (não some sozinho:
            uma nota que parou de gravar em disco parecendo saudável é perda de dados silenciosa). */}
        {fileMsg && (
          <div className="ork-note-imgmsg" role="alert">
            {fileMsg}
          </div>
        )}
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
