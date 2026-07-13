import { useCallback, useEffect, useState } from 'react'
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import type { FileEntry } from '../../../shared/filetree'
import { Icon } from './Icon'
import './nodes.css'
import './FileTreeNode.css'

// Fase 19 (Task 2): explorador de arquivos padrão de IDE, como um nó do canvas. Lê tudo via
// window.orkestra.filetree.*/projects.* (IPC) — este arquivo nunca importa fs/child_process.
// READ-ONLY: list (lazy, por diretório) + gitStatus (overlay de cor) + read (preview truncado/
// binário). Sem editor embutido nem drag-para-terminal (refinamentos de ondas futuras, ver o
// brief da Fase 19).

// Último segmento não-vazio do path (funciona pra POSIX "/a/b/" e Windows "C:\\a\\b\\") — mesmo
// helper (não compartilhado) já usado em ProjectsSidebar.tsx.
function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

// `file.path` vem absoluto (join(dir, name) no main) — a chave do gitStatus é relativa à raiz
// do repo. No MVP o root do FileTree É o cwd do projeto (tipicamente a raiz do repo), então
// "descascar" o prefixo `root + '/'` do path absoluto já basta (ver notas de risco do brief:
// isso não resolve o caso de root ser um SUBdiretório do repo).
function relativeToRoot(root: string, path: string): string {
  const prefix = root.endsWith('/') ? root : `${root}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

interface GitMarker {
  label: string
  color: string
}

// M=amarelo (--warn), A ou ??=verde (--ok), D=vermelho (--err) — como o brief pede. Qualquer
// outro código (rename/copy/conflito) cai num marcador neutro em vez de ser silenciosamente
// ignorado.
function gitMarker(status: string | undefined): GitMarker | null {
  if (!status) return null
  const code = status.trim()
  if (!code) return null
  if (code.includes('D')) return { label: 'D', color: 'var(--err)' }
  if (code === '??' || code.includes('A')) return { label: code === '??' ? '?' : 'A', color: 'var(--ok)' }
  if (code.includes('M')) return { label: 'M', color: 'var(--warn)' }
  return { label: code[0] ?? '•', color: 'var(--text-2)' }
}

interface TreeLevelProps {
  entries: FileEntry[]
  depth: number
  root: string
  expanded: Set<string>
  childrenCache: Map<string, FileEntry[]>
  gitStatus: Record<string, string>
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
        const marker = gitMarker(gitStatus[relativeToRoot(root, entry.path)])
        return (
          <div
            key={entry.path}
            className="nodrag ork-filetree-row"
            style={{ paddingLeft: indent }}
            onClick={() => onOpenFile(entry)}
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
  const [gitStatus, setGitStatus] = useState<Record<string, string>>({})

  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState<PreviewState | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [copied, setCopied] = useState(false)

  // Recarrega a raiz (e zera cache/expansão/preview de uma pasta anterior) sempre que `root`
  // muda — troca de pasta pelo header, ou a resolução do fallback (projeto ativo) terminar.
  useEffect(() => {
    setExpanded(new Set())
    setChildrenCache(new Map())
    setPreviewPath(null)
    setPreviewContent(null)
    setPreviewError('')
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

  const fetchGitStatus = useCallback((dir: string): void => {
    window.orkestra.filetree
      .gitStatus(dir)
      .then(setGitStatus)
      .catch(() => setGitStatus({}))
  }, [])

  // Git status: no mount (quando root muda) + reforçado pelo botão "atualizar" no header.
  useEffect(() => {
    if (!root) {
      setGitStatus({})
      return
    }
    fetchGitStatus(root)
  }, [root, fetchGitStatus])

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
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="ork-node">
        <div className="ork-node-header">
          <span className="ork-node-dot ork-node-dot--filetree" aria-hidden="true" />
          <span className="ork-node-title" title={root ?? name}>
            {root ? basename(root) : name}
          </span>
          <button
            className="nodrag ork-node-iconbtn"
            onClick={() => root && fetchGitStatus(root)}
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
              <p className="ork-filetree-msg">Nenhuma pasta selecionada.</p>
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
                <button
                  className="nodrag ork-filetree-copybtn"
                  onClick={copyPath}
                  title="Copiar caminho completo"
                >
                  {copied ? 'copiado!' : 'copiar caminho'}
                </button>
              </div>
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
            </div>
          )}
          {root && !previewPath && (
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
