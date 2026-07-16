import { useEffect, useState } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { NodeHandles } from './NodeHandles'
import { useCanvasStore } from '../store/canvasStore'
import type { FileEntry } from '../../../shared/filetree'
import { Icon } from './Icon'
import { gitKeyForEntry } from './fileTreeGit'
import { parseDiffLines } from './fileTreeDiff'
import { FileEditor } from './FileEditor'
import { ORKESTRA_PATH_MIME } from '../terminal/dropPaths'
import { openEntryInEditor } from '../ui/openInEditor'
import './nodes.css'
import './FileTreeNode.css'

// Fase 19 (Task 2): explorador de arquivos padrão de IDE, como um nó do canvas. Lê/escreve tudo via
// window.orkestra.filetree.*/projects.* (IPC) — este arquivo nunca importa fs/child_process.
// list (lazy, por diretório) + gitStatus (overlay de cor) + read (preview truncado/binário) +
// EDITOR embutido (Onda 2 · T4, ver FileEditor.tsx: editar/salvar via filetree.write atômico) +
// CITAR seleção → agente conectado (T5). Arrastar arquivo→terminal já veio na Onda 1.

// Último segmento não-vazio do path (funciona pra POSIX "/a/b/" e Windows "C:\\a\\b\\") — mesmo
// helper (não compartilhado) já usado em ProjectsSidebar.tsx.
function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

// A chave de casamento do gitStatus (prefix + relativoÀRaiz) vive em ./fileTreeGit (puro/testável);
// o `prefix` vem do main junto do status e cobre o caso de a raiz ser um SUBdiretório do repo.

interface GitMarker {
  label: string
  color: string
}

// Cor SEMÂNTICA por estado (§4.13): M=modificado (--warn), A=adicionado (--ok), D=removido
// (--err), ??=untracked (--text-3, neutro — não é "verde/adicionado", é ausência de rastreio).
// Nunca um accent de papel aqui (é status, não decoração). Qualquer outro código (rename/copy/
// conflito) cai num marcador neutro em vez de ser silenciosamente ignorado.
function gitMarker(status: string | undefined): GitMarker | null {
  if (!status) return null
  const code = status.trim()
  if (!code) return null
  if (code.includes('D')) return { label: 'D', color: 'var(--err)' }
  if (code === '??') return { label: '?', color: 'var(--text-3)' }
  if (code.includes('A')) return { label: 'A', color: 'var(--ok)' }
  if (code.includes('M')) return { label: 'M', color: 'var(--warn)' }
  return { label: code[0] ?? '•', color: 'var(--text-2)' }
}

// Shape do gitStatus vindo do main (ver preload/FileTreeService): `prefix` é o caminho da raiz da
// árvore dentro do repo ('' no toplevel, 'sub/' num subdir); `entries` mapeia path-relativo-ao-
// toplevel -> código de status. A chave certa por entrada é gitKeyForEntry(prefix, root, path).
interface GitStatus {
  prefix: string
  entries: Record<string, string>
}

interface TreeLevelProps {
  entries: FileEntry[]
  depth: number
  root: string
  expanded: Set<string>
  childrenCache: Map<string, FileEntry[]>
  gitStatus: GitStatus
  onToggleDir: (dir: FileEntry) => void
  onOpenFile: (file: FileEntry) => void
}

// Nível recursivo da árvore: cada pasta expandida renderiza seus filhos cacheados chamando a
// si mesma com depth+1. Lazy por construção — só existe uma entrada em childrenCache/expanded
// para uma pasta depois que o usuário clica nela (toggleDir dispara o filetree:list sob demanda).
function TreeLevel(props: TreeLevelProps): JSX.Element {
  const { entries, depth, root, expanded, childrenCache, gitStatus, onToggleDir, onOpenFile } = props
  const indent = 8 + depth * 14
  return (
    <>
      {entries.map((entry) => {
        if (entry.isDir) {
          const isOpen = expanded.has(entry.path)
          const kids = childrenCache.get(entry.path)
          return (
            <div key={entry.path}>
              <div
                className="nodrag ork-filetree-row ork-filetree-row--dir"
                style={{ paddingLeft: indent }}
                onClick={() => onToggleDir(entry)}
                title={entry.path}
              >
                <span className="ork-filetree-triangle" aria-hidden="true">
                  <Icon name={isOpen ? 'ChevronDown' : 'ChevronRight'} size={14} animation="none" />
                </span>
                <span className="ork-filetree-name">{entry.name}</span>
              </div>
              {isOpen &&
                (kids ? (
                  kids.length > 0 ? (
                    <TreeLevel {...props} entries={kids} depth={depth + 1} />
                  ) : (
                    <div className="ork-filetree-msg" style={{ paddingLeft: indent + 14 }}>
                      (vazio)
                    </div>
                  )
                ) : (
                  <div className="ork-filetree-msg" style={{ paddingLeft: indent + 14 }}>
                    carregando…
                  </div>
                ))}
            </div>
          )
        }
        const marker = gitMarker(gitStatus.entries[gitKeyForEntry(gitStatus.prefix, root, entry.path)])
        return (
          <div
            key={entry.path}
            className="nodrag ork-filetree-row"
            style={{ paddingLeft: indent }}
            onClick={() => onOpenFile(entry)}
            // Onda 1 · T3: duplo-clique = válvula de escape "abre isso no meu editor de verdade".
            // O onClick acima dispara junto (o preview embutido tolera o disparo duplo — é o mesmo
            // arquivo, idempotente); pastas não têm este handler (lá o duplo-clique só expande e
            // colapsa de novo). Fire-and-forget: openEntryInEditor nunca rejeita.
            onDoubleClick={() => void openEntryInEditor(entry, window.orkestra.ide.open)}
            // Arrastar uma linha de ARQUIVO (pastas não — evita `cd` ambíguo) injeta seu caminho
            // absoluto no terminal de um agente ao soltar sobre um TerminalNode (que lê o MIME
            // interno via readDroppedPaths). `draggable` (HTML5) coexiste com `nodrag`, que só
            // bloqueia o pan por ponteiro do React Flow; text/plain é fallback p/ alvos externos.
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(ORKESTRA_PATH_MIME, entry.path)
              e.dataTransfer.setData('text/plain', entry.path)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            title={entry.path}
          >
            <span className="ork-filetree-triangle" aria-hidden="true" />
            <span className="ork-filetree-name" style={marker ? { color: marker.color } : undefined}>
              {entry.name}
            </span>
            {marker && (
              <span className="ork-filetree-gitmark" style={{ color: marker.color }} aria-hidden="true">
                {marker.label}
              </span>
            )}
          </div>
        )
      })}
    </>
  )
}

interface PreviewState {
  content: string
  truncated: boolean
  binary: boolean
}

// Onda 3 · T8 — modo Diff: render textual do `git diff` das alterações não commitadas, com realce
// simples por tipo de linha (a classificação vive em ./fileTreeDiff, puro/testável). Não é um
// diff-viewer lado-a-lado: é o mesmo texto que o terminal mostraria, legível dentro do nó.
function DiffView({ text, truncated }: { text: string; truncated: boolean }): JSX.Element {
  const lines = parseDiffLines(text)
  if (lines.length === 0) {
    return <div className="ork-filetree-msg">(sem alterações não commitadas)</div>
  }
  return (
    <>
      <pre className="ork-filetree-diff">
        {lines.map((l) => (
          <div key={l.key} className={`ork-filetree-diffline ork-filetree-diffline--${l.kind}`}>
            {l.text === '' ? ' ' : l.text}
          </div>
        ))}
      </pre>
      {/* Truncado é um aviso HONESTO, não um detalhe: o resto do diff existe e não está aqui —
          o teto (MAX_DIFF_LINES no main) evita que um refactor gigante trave o canvas. */}
      {truncated && (
        <div className="ork-filetree-msg ork-filetree-msg--warn">
          (diff truncado — use o terminal para ver o restante)
        </div>
      )}
    </>
  )
}

export function FileTreeNode({ id, selected, data }: NodeProps): JSX.Element {
  const removeNode = useCanvasStore((s) => s.removeNode)
  const updateFileTreeRoot = useCanvasStore((s) => s.updateFileTreeRoot)
  const name = (data as { name?: string })?.name ?? 'Arquivos'
  const rootPath = (data as { rootPath?: string })?.rootPath

  // Fallback: sem rootPath explícito (nó recém-criado via toolbar), resolve o cwd do projeto
  // ativo — mas NÃO persiste isso em data.rootPath (fica "seguindo" o projeto ativo até o
  // usuário fixar uma pasta explicitamente pelo botão de pasta, que aí sim chama
  // updateFileTreeRoot). Só roda quando falta rootPath — trocar de pasta pelo header já resolve
  // localmente via a prop `data` (o node re-renderiza com o novo rootPath).
  const [fallbackCwd, setFallbackCwd] = useState<string | undefined>(undefined)
  const [resolving, setResolving] = useState<boolean>(!rootPath)

  useEffect(() => {
    if (rootPath) {
      setResolving(false)
      return undefined
    }
    let cancelled = false
    setResolving(true)
    window.orkestra.projects
      .list()
      .then((idx) => {
        if (cancelled) return
        const active = idx.projects.find((p) => p.id === idx.activeId)
        setFallbackCwd(active?.cwd)
      })
      .catch(() => {
        if (!cancelled) setFallbackCwd(undefined)
      })
      .finally(() => {
        if (!cancelled) setResolving(false)
      })
    return () => {
      cancelled = true
    }
  }, [rootPath])

  const root = rootPath ?? fallbackCwd

  const [entries, setEntries] = useState<FileEntry[]>([])
  const [childrenCache, setChildrenCache] = useState<Map<string, FileEntry[]>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeError, setTreeError] = useState('')
  const [gitStatus, setGitStatus] = useState<GitStatus>({ prefix: '', entries: {} })
  // Onda 3 · T8: branch do header ('' = fora de repo ou HEAD destacado → o header não mostra nada)
  // e modo de exibição do corpo (Lista de arquivos ↔ Diff das alterações não commitadas).
  const [branch, setBranch] = useState('')
  const [mode, setMode] = useState<'list' | 'diff'>('list')
  const [diff, setDiff] = useState<{ text: string; truncated: boolean } | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  // Bump manual do botão "atualizar": git status/branch/diff não têm watch (T9), então o refresh é
  // explícito. Um nonce (em vez de 3 callbacks) mantém as três leituras em sincronia num clique.
  const [gitNonce, setGitNonce] = useState(0)

  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState<PreviewState | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [copied, setCopied] = useState(false)
  // Onda 2 · T4: alterna entre o preview somente-leitura (<pre>) e o editor embutido (FileEditor).
  const [editing, setEditing] = useState(false)

  // Recarrega a raiz (e zera cache/expansão/preview de uma pasta anterior) sempre que `root`
  // muda — troca de pasta pelo header, ou a resolução do fallback (projeto ativo) terminar.
  useEffect(() => {
    setExpanded(new Set())
    setChildrenCache(new Map())
    setPreviewPath(null)
    setPreviewContent(null)
    setPreviewError('')
    // Onda 3 · T8: volta pra Lista ao trocar de raiz. Não é só higiene: o toggle fica DESABILITADO
    // fora de repo, então quem estivesse no modo Diff e trocasse para uma pasta sem git ficaria
    // preso num diff vazio sem botão de volta.
    setMode('list')
    if (!root) {
      setEntries([])
      return undefined
    }
    let cancelled = false
    setTreeLoading(true)
    setTreeError('')
    window.orkestra.filetree
      .list(root)
      .then((list) => {
        if (cancelled) return
        setEntries(list)
        setTreeLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setTreeError(err instanceof Error ? err.message : String(err))
        setTreeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [root])

  // Git status (overlay) + branch (header): no mount, quando `root` muda, e a cada clique no botão
  // "atualizar" (gitNonce). Leitura pura — nada aqui muta o repo. Fora de repo os dois devolvem
  // vazio sem rejeitar; o catch cobre só falhas inesperadas do IPC.
  useEffect(() => {
    if (!root) {
      setGitStatus({ prefix: '', entries: {} })
      setBranch('')
      return undefined
    }
    let cancelled = false
    window.orkestra.filetree
      .gitStatus(root)
      .then((s) => !cancelled && setGitStatus(s))
      .catch(() => !cancelled && setGitStatus({ prefix: '', entries: {} }))
    window.orkestra.filetree
      .gitBranch(root)
      .then((b) => !cancelled && setBranch(b))
      .catch(() => !cancelled && setBranch(''))
    return () => {
      cancelled = true
    }
  }, [root, gitNonce])

  // Onda 3 · T8: o diff só é buscado quando o modo Diff está ATIVO (não paga o custo de um
  // `git diff` a cada refresh de quem só usa a lista) e é rebuscado ao trocar de raiz/atualizar.
  useEffect(() => {
    if (!root || mode !== 'diff') {
      setDiff(null)
      return undefined
    }
    let cancelled = false
    setDiffLoading(true)
    window.orkestra.filetree
      .gitDiff(root)
      .then((d) => {
        if (cancelled) return
        setDiff(d)
        setDiffLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setDiff({ text: '', truncated: false })
        setDiffLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [root, mode, gitNonce])

  const toggleDir = (dir: FileEntry): void => {
    const isOpen = expanded.has(dir.path)
    if (isOpen) {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.delete(dir.path)
        return next
      })
      return
    }
    setExpanded((prev) => new Set(prev).add(dir.path))
    if (!childrenCache.has(dir.path)) {
      window.orkestra.filetree
        .list(dir.path)
        .then((list) => setChildrenCache((prev) => new Map(prev).set(dir.path, list)))
        .catch(() => setChildrenCache((prev) => new Map(prev).set(dir.path, [])))
    }
  }

  const openFile = (file: FileEntry): void => {
    setPreviewPath(file.path)
    setPreviewContent(null)
    setPreviewError('')
    setEditing(false)
    setPreviewLoading(true)
    window.orkestra.filetree
      .read(file.path)
      .then((r) => {
        setPreviewContent(r)
        setPreviewLoading(false)
      })
      .catch((err) => {
        setPreviewError(err instanceof Error ? err.message : String(err))
        setPreviewLoading(false)
      })
  }

  const closePreview = (): void => {
    setPreviewPath(null)
    setPreviewContent(null)
    setPreviewError('')
    setEditing(false)
  }

  const copyPath = (): void => {
    if (!previewPath) return
    navigator.clipboard
      ?.writeText(previewPath)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  // Compartilhado pelo botão de pasta do header e pelo empty-state ("Escolher pasta") — sempre
  // persiste via updateFileTreeRoot (diferente do fallback do projeto ativo, que é só em
  // memória): é assim que a pasta escolhida sobrevive a fechar/reabrir o app.
  const handleChooseFolder = async (): Promise<void> => {
    try {
      const picked = await window.orkestra.projects.pickDirectory()
      if (!picked) return
      updateFileTreeRoot(id, picked)
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <NodeResizer minWidth={220} minHeight={160} isVisible={selected ?? false} />
      <NodeHandles />
      <div className="ork-node">
        <div className="ork-node-header">
          <span className="ork-node-dot ork-node-dot--filetree" aria-hidden="true" />
          <span className="ork-node-title" title={root ?? name}>
            {root ? basename(root) : name}
          </span>
          {/* Onda 3 · T8: branch atual. Só aparece DENTRO de um repo (fora, e em HEAD destacado,
              gitBranch devolve '' e o header fica limpo em vez de mentir um nome). */}
          {branch && (
            <span className="ork-filetree-branch" title={`Branch atual: ${branch}`}>
              <Icon name="GitBranch" size={12} animation="none" />
              <span className="ork-filetree-branch-name">{branch}</span>
            </span>
          )}
          {/* Toggle Lista ↔ Diff. Só faz sentido em repo: sem git não há diff nenhum p/ mostrar. */}
          <button
            className={`nodrag ork-node-iconbtn${mode === 'diff' ? ' ork-node-iconbtn--on' : ''}`}
            onClick={() => setMode((m) => (m === 'diff' ? 'list' : 'diff'))}
            aria-label={mode === 'diff' ? 'Ver lista de arquivos' : 'Ver diff'}
            aria-pressed={mode === 'diff'}
            title={
              branch
                ? mode === 'diff'
                  ? 'Voltar para a lista de arquivos'
                  : 'Ver alterações não commitadas (diff)'
                : 'Sem repositório git nesta pasta'
            }
            disabled={!branch}
          >
            <Icon name={mode === 'diff' ? 'List' : 'FileDiff'} size={14} animation="pop" />
          </button>
          <button
            className="nodrag ork-node-iconbtn"
            onClick={() => setGitNonce((n) => n + 1)}
            aria-label="Atualizar status git"
            title="Atualizar status git"
            disabled={!root}
          >
            <Icon name="RefreshCw" size={14} animation="spin" />
          </button>
          <button
            className="nodrag ork-node-iconbtn"
            onClick={() => void handleChooseFolder()}
            aria-label="Trocar pasta"
            title="Trocar pasta"
          >
            <Icon name="Folder" size={14} animation="bounce" />
          </button>
          <button
            className="nodrag ork-node-iconbtn"
            onClick={() => removeNode(id)}
            aria-label="Fechar árvore de arquivos"
            title="Remover nó"
          >
            <Icon name="X" size={14} animation="pop" />
          </button>
        </div>
        <div className="ork-node-body ork-filetree-body">
          {resolving && <div className="ork-filetree-msg">carregando…</div>}
          {!resolving && !root && (
            <div className="ork-filetree-choose">
              <p className="ork-filetree-msg">Nenhuma pasta. Escolha uma.</p>
              <button className="nodrag ork-node-go" onClick={() => void handleChooseFolder()}>
                Escolher pasta
              </button>
            </div>
          )}
          {root && previewPath && (
            <div className="ork-filetree-preview">
              <div className="ork-filetree-preview-bar">
                <button
                  className="nodrag ork-node-iconbtn"
                  onClick={closePreview}
                  aria-label="Voltar para a árvore"
                  title="Voltar"
                >
                  ←
                </button>
                <span className="ork-filetree-preview-path" title={previewPath}>
                  {basename(previewPath)}
                </span>
                {/* Onda 2 · T4: alterna Ver ↔ Editar. Só habilitado para texto completo — binário
                    (não editável) e truncado (só temos os primeiros 256KB; salvar destruiria o resto)
                    ficam em leitura. */}
                {previewContent && !previewContent.binary && (
                  <button
                    className="nodrag ork-filetree-copybtn"
                    onClick={() => setEditing((v) => !v)}
                    disabled={previewContent.truncated}
                    title={
                      previewContent.truncated
                        ? 'Arquivo truncado — edição desabilitada (só lemos os primeiros 256KB)'
                        : editing
                          ? 'Voltar para visualização'
                          : 'Editar este arquivo'
                    }
                  >
                    {editing ? 'ver' : 'editar'}
                  </button>
                )}
                <button
                  className="nodrag ork-filetree-copybtn"
                  onClick={copyPath}
                  title="Copiar caminho completo"
                >
                  {copied ? 'copiado!' : 'copiar caminho'}
                </button>
              </div>
              {editing && previewContent && !previewContent.binary && !previewContent.truncated ? (
                <FileEditor
                  key={previewPath}
                  nodeId={id}
                  path={previewPath}
                  root={root}
                  initialContent={previewContent.content}
                  onSaved={(content) =>
                    setPreviewContent({ content, truncated: false, binary: false })
                  }
                />
              ) : (
                <div className="nodrag nowheel ork-filetree-previewbody">
                  {previewLoading && <div className="ork-filetree-msg">carregando…</div>}
                  {previewError && <div className="ork-filetree-msg ork-filetree-msg--err">{previewError}</div>}
                  {previewContent &&
                    (previewContent.binary ? (
                      <div className="ork-filetree-msg">(arquivo binário)</div>
                    ) : (
                      <>
                        {previewContent.truncated && (
                          <div className="ork-filetree-msg ork-filetree-msg--warn">(truncado)</div>
                        )}
                        <pre className="ork-filetree-pre">{previewContent.content}</pre>
                      </>
                    ))}
                </div>
              )}
            </div>
          )}
          {/* Onda 3 · T8: modo Diff ocupa o corpo no lugar da lista (o preview de arquivo, quando
              aberto, continua tendo precedência sobre os dois). */}
          {root && !previewPath && mode === 'diff' && (
            <div className="nodrag nowheel ork-filetree-previewbody">
              {diffLoading && <div className="ork-filetree-msg">carregando…</div>}
              {!diffLoading && diff && <DiffView text={diff.text} truncated={diff.truncated} />}
            </div>
          )}
          {root && !previewPath && mode === 'list' && (
            <div className="nodrag nowheel ork-filetree-rows">
              {treeLoading && <div className="ork-filetree-msg">carregando…</div>}
              {treeError && <div className="ork-filetree-msg ork-filetree-msg--err">{treeError}</div>}
              {!treeLoading && !treeError && entries.length === 0 && (
                <div className="ork-filetree-msg">(vazio)</div>
              )}
              <TreeLevel
                entries={entries}
                depth={0}
                root={root}
                expanded={expanded}
                childrenCache={childrenCache}
                gitStatus={gitStatus}
                onToggleDir={toggleDir}
                onOpenFile={openFile}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
