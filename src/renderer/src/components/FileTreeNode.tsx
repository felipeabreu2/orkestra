import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { NodeHandles } from './NodeHandles'
import { useCanvasStore } from '../store/canvasStore'
import type { ContentSearchResult, FileEntry } from '../../../shared/filetree'
import { Icon } from './Icon'
import { gitKeyForEntry, relativeToRoot } from './fileTreeGit'
import { parseSearchMode, filterByName, collectLoadedEntries } from './fileTreeFilter'
import { parentDir, nameError, relTargetError, joinUnderRoot } from './fileTreeMutate'
import { watchDirsFor, shouldApplyWatchEvent } from './fileTreeWatch'
import { parseDiffLines, diffHunkAt, diffQuoteLabel, type DiffLine, type DiffHunk } from './fileTreeDiff'
import { commitPreview, canCommit, commitConfirmText, branchNameError } from './fileTreeGitWrite'
import { FileEditor } from './FileEditor'
import { resolveConnectedTerminal } from './quoteSelection'
import { getTerminalPty } from '../terminal/terminalRegistry'
import { buildContextBlock } from '../context/contextBlock'
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
  // T13: botão-direito numa linha abre o menu de mutação para aquela entrada.
  onContextEntry: (entry: FileEntry) => void
}

// Nível recursivo da árvore: cada pasta expandida renderiza seus filhos cacheados chamando a
// si mesma com depth+1. Lazy por construção — só existe uma entrada em childrenCache/expanded
// para uma pasta depois que o usuário clica nela (toggleDir dispara o filetree:list sob demanda).
function TreeLevel(props: TreeLevelProps): JSX.Element {
  const { entries, depth, root, expanded, childrenCache, gitStatus, onToggleDir, onOpenFile, onContextEntry } =
    props
  const indent = 8 + depth * 14
  // stopPropagation: sem ele o context-menu da linha borbulharia até o container de rows, que abre
  // o menu da RAIZ — e o usuário veria o menu do lugar errado.
  const contextFor = (entry: FileEntry) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onContextEntry(entry)
  }
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
                onContextMenu={contextFor(entry)}
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
            onContextMenu={contextFor(entry)}
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
//
// Onda 3 · T12: clicar numa linha SELECIONA o hunk que a contém (realçado inteiro), que é a unidade
// citável ao agente — ver a decisão documentada em ./fileTreeDiff. Cabeçalhos de arquivo não são
// citáveis (diffHunkAt devolve null), então clicar neles não seleciona nada.
function DiffView({
  lines,
  truncated,
  selected,
  onPickHunk
}: {
  lines: DiffLine[]
  truncated: boolean
  selected: DiffHunk | null
  onPickHunk: (key: number) => void
}): JSX.Element {
  if (lines.length === 0) {
    return <div className="ork-filetree-msg">(sem alterações não commitadas)</div>
  }
  return (
    <>
      <pre className="ork-filetree-diff">
        {lines.map((l) => {
          const dentro = selected != null && l.key >= selected.startKey && l.key <= selected.endKey
          return (
            <div
              key={l.key}
              className={`ork-filetree-diffline ork-filetree-diffline--${l.kind}${
                dentro ? ' ork-filetree-diffline--picked' : ''
              }`}
              onClick={() => onPickHunk(l.key)}
              title="Clique para selecionar este hunk"
            >
              {l.text === '' ? ' ' : l.text}
            </div>
          )
        })}
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
  // Onda 3 · T12: linha clicada no diff → o hunk que a contém é o bloco citável. Guardamos a KEY
  // (índice da linha), não o hunk: o diff pode ser rebuscado (atualizar/troca de raiz) e um objeto
  // guardado ficaria descrito por um texto que não está mais na tela. O hunk é derivado abaixo.
  const [pickedLine, setPickedLine] = useState<number | null>(null)
  const [diffQuoteMsg, setDiffQuoteMsg] = useState('')
  // Bump do refresh: um nonce (em vez de 3 callbacks) mantém status/branch/diff em sincronia num
  // único disparo. Vem do botão "atualizar" (manual) e, desde a T9, do watch de filesystem.
  const [gitNonce, setGitNonce] = useState(0)
  // Onda 3 · T9: o watch DEGRADOU (não pegou, ou morreu no meio). '' = auto-refresh saudável. A UI
  // mostra isso no botão de atualizar — um watch quebrado em silêncio deixaria a árvore congelada
  // parecendo viva, que é a pior falha possível aqui.
  const [watchError, setWatchError] = useState('')

  // ── Onda 3 · T11: menu de git de ESCRITA (commit / nova branch / trocar) ─────────────────────
  // Único lugar da árvore que muta o REPOSITÓRIO do usuário. Cada operação passa por uma etapa de
  // confirmação explícita (nada dispara no primeiro clique) e o erro do git é mostrado LITERAL —
  // "nothing to commit", "would be overwritten by checkout"… são mensagens que o usuário sabe ler,
  // e reescrevê-las só perderia informação.
  const [gitMenu, setGitMenu] = useState<'none' | 'menu' | 'commit' | 'branch' | 'switch'>('none')
  const [commitMsg, setCommitMsg] = useState('')
  const [branchInput, setBranchInput] = useState('')
  const [gitBusy, setGitBusy] = useState(false)
  // Banners de RESULTADO de operação (erro literal / sucesso). Nasceram na T11 (git de escrita) e
  // desde a T13 servem também às mutações de arquivo — são o mesmo contrato: falhou é falhou,
  // visível até o usuário dispensar.
  const [gitWriteError, setGitWriteError] = useState('')
  const [gitWriteOk, setGitWriteOk] = useState('')

  // ── Onda 3 · T13: menu de mutação de ARQUIVOS (botão-direito numa linha da árvore) ───────────
  // Painel sob o header (mesmo padrão do menu git da T11 — um overlay position:fixed quebraria
  // dentro do nó transformado do React Flow). `mutTarget` null = ação na RAIZ (clique em área
  // vazia). A validação aqui é espelho (fileTreeMutate); a autoridade é o pathGuard no main.
  const [mutMenu, setMutMenu] = useState<'none' | 'menu' | 'newfile' | 'newdir' | 'rename' | 'delete'>(
    'none'
  )
  const [mutTarget, setMutTarget] = useState<FileEntry | null>(null)
  const [mutInput, setMutInput] = useState('')
  const [mutBusy, setMutBusy] = useState(false)

  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState<PreviewState | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [copied, setCopied] = useState(false)
  // Onda 2 · T4: alterna entre o preview somente-leitura (<pre>) e o editor embutido (FileEditor).
  const [editing, setEditing] = useState(false)
  // Onda 3 · T10: linha onde o editor deve abrir POSICIONADO (clique num resultado da busca por
  // conteúdo). null = abertura normal. Vive aqui (não no FileEditor) porque é a openFileAtLine que
  // decide entrar direto no modo edição.
  const [pendingLine, setPendingLine] = useState<number | null>(null)

  // ── Onda 3 · T10: campo de busca do rodapé ────────────────────────────────────────────────────
  // O INPUT decide o modo (parseSearchMode): sem prefixo filtra por NOME (client-side, sobre o já
  // carregado — instantâneo); com `>` busca por CONTEÚDO no main (Enter dispara — varrer o disco a
  // cada tecla seria pagar a varredura inteira por keystroke).
  const [searchInput, setSearchInput] = useState('')
  const [contentResults, setContentResults] = useState<ContentSearchResult | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError] = useState('')

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
    // T10: busca é POR raiz — resultados da pasta anterior seriam mentira na nova.
    setSearchInput('')
    setContentResults(null)
    setContentError('')
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
    // T12: a seleção de hunk é sempre descartada junto do diff que a originou — as keys são índices
    // de linha, e um diff novo (outro arquivo mudou, atualizar, troca de raiz) as invalida.
    setPickedLine(null)
    setDiffQuoteMsg('')
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

  // ————— Onda 3 · T9: watch de filesystem (auto-refresh) —————
  //
  // Este canvas é um lugar onde AGENTES editam arquivos o tempo todo. Sem watch, a árvore mostra um
  // retrato velho enquanto o agente trabalha. A lógica pura (o que observar, e se um push é meu)
  // vive em ./fileTreeWatch — o vitest não coleta `.tsx`, então aqui fica só a fiação.

  // Refs para o handler do push ler o estado FRESCO sem re-assinar o watch a cada render (mesmo
  // motivo de useOrchestrationSync usar getState() em vez de depender do dep array).
  const rootRef = useRef(root)
  rootRef.current = root
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  // Re-lista o que está VISÍVEL (raiz + expandidas) e ressincroniza o git. Diferente do efeito de
  // `root`, este NÃO zera expansão/cache/preview: o usuário não pediu nada, foi o disco que mudou —
  // colapsar a árvore dele embaixo do dedo por causa de um save de agente seria hostil.
  const refreshFromDisk = useCallback((): void => {
    const r = rootRef.current
    if (!r) return
    const dirs = watchDirsFor(r, expandedRef.current)
    Promise.all(
      dirs.map((d) =>
        window.orkestra.filetree
          .list(d)
          .then((list) => [d, list] as const)
          // Pasta apagada/inacessível entre o evento e o list: vira vazia em vez de derrubar o
          // refresh dos outros níveis (o efeito de `root` é quem trata erro de raiz).
          .catch(() => [d, [] as FileEntry[]] as const)
      )
    ).then((pairs) => {
      // Corrida: se a raiz mudou enquanto os lists corriam, o resultado é de uma árvore que não
      // está mais na tela — descarta (o efeito de `root` já recarregou tudo).
      if (rootRef.current !== r) return
      for (const [dir, list] of pairs) {
        if (dir === r) setEntries(list)
        else setChildrenCache((prev) => new Map(prev).set(dir, list))
      }
    })
    // Reusa o nonce do botão "atualizar": status + branch + diff em sincronia.
    //
    // DECISÃO — o modo Diff TAMBÉM é atualizado pelo watch. Um diff velho é pior que uma lista
    // velha: é o texto que o usuário lê para decidir, e (T12) o hunk que ele CITA ao agente. Citar
    // um hunk que não existe mais no arquivo é mandar o agente trabalhar em cima de ficção. O preço
    // é que a seleção de hunk é descartada quando o diff é refeito (o efeito da T8/T12 zera
    // pickedLine junto com o diff, porque as keys são índices de linha) — perder a seleção é
    // recuperável com um clique; citar um hunk fantasma, não.
    setGitNonce((n) => n + 1)
  }, [])

  // ── Onda 3 · T11: execução das operações de escrita ──────────────────────────────────────────
  //
  // POR QUE O REFRESH EXPLÍCITO: o watch da T9 observa a ÁRVORE (raiz + expandidas) e ignora `.git`
  // de propósito (churn do git acordaria o watch a cada operação). Um COMMIT só mexe dentro de
  // `.git` — nenhum arquivo da árvore muda — então o watcher NÃO dispara e o overlay/branch ficariam
  // congelados mostrando o estado pré-commit: a árvore mentiria que ainda há trabalho pendente. Por
  // isso todo caminho de sucesso aqui chama refreshFromDisk() à mão. (Um checkout mexe em arquivos
  // da árvore e acordaria o watch, mas não dá para depender disso: se a troca de branch não alterar
  // nenhum arquivo VISÍVEL, não há evento — o refresh explícito cobre os dois casos.)
  const runGitWrite = useCallback(
    async (label: string, op: () => Promise<void>): Promise<void> => {
      setGitBusy(true)
      setGitWriteError('')
      setGitWriteOk('')
      try {
        await op()
        setGitWriteOk(label)
        setGitMenu('none')
        setCommitMsg('')
        setBranchInput('')
        refreshFromDisk()
      } catch (err) {
        // Mensagem do git, literal. Falhou é falhou — nada de engolir e fingir que deu certo.
        setGitWriteError(err instanceof Error ? err.message : String(err))
      } finally {
        setGitBusy(false)
      }
    },
    [refreshFromDisk]
  )

  // ── Onda 3 · T13: execução das mutações de arquivo ───────────────────────────────────────────
  // Mesmo desenho do runGitWrite (busy → op → banner + refresh explícito). O refresh explícito
  // importa menos aqui que no commit (mutações de arquivo ACORDAM o watch), mas continua: se o
  // alvo estava num nível não-observado (pasta colapsada), o evento não vem.
  const runMutation = useCallback(
    async (label: string, op: () => Promise<void>): Promise<void> => {
      setMutBusy(true)
      setGitWriteError('')
      setGitWriteOk('')
      try {
        await op()
        setGitWriteOk(label)
        setMutMenu('none')
        setMutTarget(null)
        setMutInput('')
        refreshFromDisk()
      } catch (err) {
        setGitWriteError(err instanceof Error ? err.message : String(err))
      } finally {
        setMutBusy(false)
      }
    },
    [refreshFromDisk]
  )

  // Botão-direito numa linha (ou em área vazia -> raiz). Fecha o menu git (um painel por vez) e
  // zera os banners de resultado da operação anterior.
  const openMutMenu = (entry: FileEntry | null): void => {
    setGitMenu('none')
    setGitWriteError('')
    setGitWriteOk('')
    setMutTarget(entry)
    setMutInput('')
    setMutMenu('menu')
  }

  // Escopo de projeto: o projeto que ESTE canvas exibe. Carimbado na assinatura e reconferido em
  // cada push — ver shouldApplyWatchEvent. Existe por causa do incidente de corrupção
  // cross-project: um watcher do projeto A não pode atualizar o canvas do projeto B.
  const activeProjectId = useCanvasStore((s) => s.activeProjectId)

  useEffect(() => {
    if (!root) {
      setWatchError('')
      return undefined
    }
    // Id gerado AQUI (não devolvido pelo main) para que o cleanup abaixo sempre saiba o que
    // cancelar, mesmo se o nó desmontar antes do invoke de watch() resolver.
    const subscriptionId = crypto.randomUUID()
    let cancelled = false
    setWatchError('')

    const dispose = window.orkestra.filetree.onChanged((ev) => {
      if (cancelled) return
      if (!shouldApplyWatchEvent(ev, subscriptionId, useCanvasStore.getState().activeProjectId ?? null)) return
      if (ev.kind === 'error') {
        setWatchError(ev.message ?? 'watch interrompido')
        return
      }
      refreshFromDisk()
    })

    window.orkestra.filetree
      .watch(subscriptionId, watchDirsFor(root, expanded), activeProjectId ?? null)
      .then((r) => {
        if (cancelled) return
        // Falha NÃO é silenciosa: sem isto a árvore ficaria congelada parecendo viva.
        if (!r.ok) setWatchError(r.errors.join('; ') || 'não foi possível observar a pasta')
      })
      .catch((err) => {
        if (!cancelled) setWatchError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
      dispose() // remove o listener do ipcRenderer (vários nós de árvore = vários listeners)
      // Encerra os fs.watch no main. Roda ao desmontar o nó (× ou troca de PROJETO, que troca os
      // nós do canvas), ao trocar a raiz e a cada mudança do conjunto de expandidas. Sem isto,
      // cada uma dessas ações vazaria file descriptors — invisível até a sessão longa.
      void window.orkestra.filetree.unwatch(subscriptionId).catch(() => {})
    }
    // `expanded` no dep array de propósito: o watch é escopado ao VISÍVEL, então expandir/colapsar
    // muda o conjunto observado e precisa reassinar (o main fecha os antigos e abre os novos).
  }, [root, expanded, activeProjectId, refreshFromDisk])

  // T10 — estado derivado da busca. `nameHits` só existe no modo nome com query não-vazia (null =
  // sem busca ativa, mostra a árvore normal); recalcula quando o carregado muda (expandir uma pasta
  // enriquece o filtro — ele é sobre o que JÁ foi carregado, coerente com a árvore lazy).
  const search = useMemo(() => parseSearchMode(searchInput), [searchInput])
  const nameHits = useMemo(
    () =>
      search.mode === 'name' && search.query.trim()
        ? filterByName(collectLoadedEntries(entries, childrenCache), search.query)
        : null,
    [search, entries, childrenCache]
  )
  const searchActive = search.query.trim().length > 0

  // T13 — diretório-destino de "novo arquivo/pasta": a própria pasta clicada, o pai do arquivo
  // clicado, ou a raiz (clique em área vazia). Derivado, não estado — segue o alvo sozinho.
  const mutDestDir = mutTarget ? (mutTarget.isDir ? mutTarget.path : parentDir(mutTarget.path)) : (root ?? '')

  // Linhas classificadas do diff (T8) — memoizadas porque agora servem a DOIS consumidores: o
  // render e o recorte do hunk citado (T12).
  const diffLines = useMemo(() => parseDiffLines(diff?.text ?? ''), [diff])
  const pickedHunk = useMemo(
    () => (pickedLine == null ? null : diffHunkAt(diffLines, pickedLine)),
    [diffLines, pickedLine]
  )

  // T12 reusa o canal da T5 (o mesmo do FileEditor): terminal ligado por aresta → pty → bloco de
  // contexto. Só o QUE se cita muda (um hunk, não uma seleção de texto); o caminho de envio é o
  // mesmo, incluindo o filtro por nós do tipo terminal (só eles têm pty).
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const terminalIds = useMemo(
    () => new Set(nodes.filter((n) => n.type === 'terminal').map((n) => n.id)),
    [nodes]
  )
  const connectedTerminal = useMemo(
    () => resolveConnectedTerminal(id, edges, terminalIds),
    [id, edges, terminalIds]
  )

  // Cita o hunk selecionado → escreve o bloco no pty do terminal conectado, SEM Enter (o usuário
  // revisa e dispara). Mesma sequência de guardas do FileEditor.quote, mesmo vocabulário de aviso.
  const quoteHunk = (): void => {
    if (!pickedHunk) {
      setDiffQuoteMsg('clique num hunk primeiro')
      return
    }
    if (!connectedTerminal) {
      setDiffQuoteMsg('nenhum terminal conectado a esta árvore')
      return
    }
    const ptyId = getTerminalPty(connectedTerminal)
    if (!ptyId) {
      setDiffQuoteMsg('o terminal conectado ainda não tem processo')
      return
    }
    const block = buildContextBlock(diffQuoteLabel(pickedHunk.file), pickedHunk.text)
    if (!block) {
      setDiffQuoteMsg('clique num hunk primeiro')
      return
    }
    window.orkestra.pty.write(ptyId, block)
    setDiffQuoteMsg('citação enviada ao agente')
  }

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
    setPendingLine(null)
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

  // T10 — clique num resultado da busca por conteúdo: abre o arquivo JÁ NO EDITOR, posicionado na
  // linha do acerto (o CodeMirror destravou isso — o <pre> do preview não posiciona nada). Binário
  // e truncado não abrem para edição (mesma regra do botão "editar"): caem no preview normal, que
  // é degradar, não falhar.
  const openFileAtLine = (path: string, line: number): void => {
    setPreviewPath(path)
    setPreviewContent(null)
    setPreviewError('')
    setEditing(false)
    setPendingLine(line)
    setPreviewLoading(true)
    window.orkestra.filetree
      .read(path)
      .then((r) => {
        setPreviewContent(r)
        setPreviewLoading(false)
        if (!r.binary && !r.truncated) setEditing(true)
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
    setPendingLine(null)
  }

  // T10 — dispara a busca por conteúdo (Enter no campo com `>`). Uma varredura por disparo; o
  // guard de raiz no resolve descarta resultado velho se o usuário trocou de pasta no meio.
  const runContentSearch = (query: string): void => {
    const r = rootRef.current
    if (!r || !query) return
    setContentLoading(true)
    setContentError('')
    window.orkestra.filetree
      .searchContent(r, query)
      .then((res) => {
        if (rootRef.current !== r) return
        setContentResults(res)
        setContentLoading(false)
      })
      .catch((err) => {
        if (rootRef.current !== r) return
        setContentError(err instanceof Error ? err.message : String(err))
        setContentLoading(false)
      })
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
              gitBranch devolve '' e o header fica limpo em vez de mentir um nome).
              Onda 3 · T11: virou o gatilho do menu de git de escrita (commit/branch). */}
          {branch && (
            <button
              className={`nodrag ork-filetree-branch${gitMenu !== 'none' ? ' ork-filetree-branch--open' : ''}`}
              onClick={() => {
                setGitWriteError('')
                setGitWriteOk('')
                setGitMenu((m) => (m === 'none' ? 'menu' : 'none'))
              }}
              aria-haspopup="menu"
              aria-expanded={gitMenu !== 'none'}
              title={`Branch atual: ${branch} — clique para commit / branch`}
            >
              <Icon name="GitBranch" size={12} animation="none" />
              <span className="ork-filetree-branch-name">{branch}</span>
            </button>
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
          {/* Onda 3 · T9: com o watch saudável este botão é redundante (a árvore se atualiza
              sozinha) — mas continua aqui porque é a saída quando o watch DEGRADA, e porque o
              escopo do watch é só o visível. Quando o watch falha, o botão fica em --warn e o
              title diz o porquê: melhor um aviso feio do que uma árvore congelada parecendo viva. */}
          <button
            className={`nodrag ork-node-iconbtn${watchError ? ' ork-filetree-refresh--degraded' : ''}`}
            onClick={() => {
              setWatchError('')
              refreshFromDisk()
            }}
            aria-label={watchError ? 'Auto-refresh indisponível — atualizar manualmente' : 'Atualizar status git'}
            title={
              watchError
                ? `Auto-refresh indisponível (${watchError}) — clique para atualizar manualmente`
                : 'Atualizar status git'
            }
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
        {/* ── Onda 3 · T11: painel de git de escrita ────────────────────────────────────────────
            A ÚNICA superfície da árvore que muta o repositório do usuário. Duas etapas sempre:
            escolher a ação e então confirmar com os detalhes à vista. Nenhuma ação destrutiva mora
            aqui (sem force/reset/clean/branch -D): o pior caso de qualquer botão é um erro do git
            na faixa vermelha abaixo. */}
        {gitMenu !== 'none' && (
          <div className="nodrag ork-filetree-gitmenu" role="menu">
            {gitMenu === 'menu' && (
              <div className="ork-filetree-gitmenu-actions">
                <button
                  className="nodrag ork-filetree-gitmenu-item"
                  role="menuitem"
                  onClick={() => setGitMenu('commit')}
                  disabled={!canCommit(gitStatus.entries)}
                  title={
                    canCommit(gitStatus.entries)
                      ? 'Commitar as alterações rastreadas'
                      : 'Nada a commitar (só há arquivos não rastreados, ou nada mudou)'
                  }
                >
                  <Icon name="GitCommit" size={13} animation="none" />
                  Commit…
                </button>
                <button
                  className="nodrag ork-filetree-gitmenu-item"
                  role="menuitem"
                  onClick={() => setGitMenu('branch')}
                >
                  <Icon name="GitBranch" size={13} animation="none" />
                  Nova branch…
                </button>
                <button
                  className="nodrag ork-filetree-gitmenu-item"
                  role="menuitem"
                  onClick={() => setGitMenu('switch')}
                >
                  <Icon name="GitBranch" size={13} animation="none" />
                  Trocar de branch…
                </button>
              </div>
            )}

            {/* COMMIT — a confirmação mostra a LISTA EXATA do que entra e do que fica de fora
                (commitConfirmText). O main roda `git commit -a`: tracked modificado + o que já
                estava em stage; untracked NÃO entra. Sem isso o botão seria um `add -A` cego, capaz
                de varrer um .env esquecido para dentro do histórico. */}
            {gitMenu === 'commit' && (
              <div className="ork-filetree-gitform">
                <pre className="ork-filetree-gitpreview">{commitConfirmText(gitStatus.entries)}</pre>
                <textarea
                  className="nodrag ork-filetree-gitinput"
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  placeholder="Mensagem do commit"
                  rows={2}
                  autoFocus
                />
                <div className="ork-filetree-gitform-row">
                  <button
                    className="nodrag ork-node-go"
                    disabled={gitBusy || commitMsg.trim().length === 0}
                    onClick={() => {
                      const r = rootRef.current
                      if (!r) return
                      const n = commitPreview(gitStatus.entries).included.length
                      void runGitWrite(`commit criado (${n} arquivo(s))`, async () => {
                        await window.orkestra.filetree.gitCommit(r, commitMsg)
                      })
                    }}
                  >
                    {gitBusy ? 'commitando…' : 'Confirmar commit'}
                  </button>
                  <button className="nodrag ork-node-go" onClick={() => setGitMenu('menu')}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* NOVA BRANCH — cria a partir do HEAD atual e já troca para ela (é o que "nova branch"
                significa no fluxo real; são duas chamadas, e se a troca falhar — working tree sujo —
                a branch continua criada e o erro aparece). */}
            {(gitMenu === 'branch' || gitMenu === 'switch') && (
              <div className="ork-filetree-gitform">
                <input
                  className="nodrag ork-filetree-gitinput"
                  value={branchInput}
                  onChange={(e) => setBranchInput(e.target.value)}
                  placeholder={gitMenu === 'branch' ? 'nome da nova branch' : 'branch de destino'}
                  autoFocus
                />
                {/* validação-espelho: feedback imediato. A autoridade é o MAIN, que revalida e ainda
                    consulta o próprio git (check-ref-format). */}
                {branchInput.length > 0 && branchNameError(branchInput) && (
                  <div className="ork-filetree-giterr">{branchNameError(branchInput)}</div>
                )}
                {gitMenu === 'switch' && (
                  <div className="ork-filetree-githint">
                    Com alterações não commitadas que colidam, o git recusa a troca — e nós não
                    forçamos. Commite antes.
                  </div>
                )}
                <div className="ork-filetree-gitform-row">
                  <button
                    className="nodrag ork-node-go"
                    disabled={gitBusy || branchNameError(branchInput) !== ''}
                    onClick={() => {
                      const r = rootRef.current
                      if (!r) return
                      const alvo = branchInput
                      if (gitMenu === 'branch') {
                        void runGitWrite(`branch "${alvo}" criada e ativa`, async () => {
                          await window.orkestra.filetree.gitCreateBranch(r, alvo)
                          await window.orkestra.filetree.gitCheckout(r, alvo)
                        })
                      } else {
                        void runGitWrite(`agora em "${alvo}"`, async () => {
                          await window.orkestra.filetree.gitCheckout(r, alvo)
                        })
                      }
                    }}
                  >
                    {gitBusy ? 'executando…' : gitMenu === 'branch' ? 'Criar e trocar' : 'Trocar'}
                  </button>
                  <button className="nodrag ork-node-go" onClick={() => setGitMenu('menu')}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* ── Onda 3 · T13: painel de mutação de ARQUIVOS ──────────────────────────────────────
            Botão-direito numa linha (ou em área vazia = raiz). Duas etapas sempre — escolher a
            ação, depois confirmar com os detalhes à vista (mesmo desenho do painel git). EXCLUIR
            vai para a LIXEIRA do sistema (recuperável); exclusão definitiva não existe aqui. */}
        {mutMenu !== 'none' && root && (
          <div className="nodrag ork-filetree-gitmenu" role="menu">
            {mutMenu === 'menu' && (
              <div className="ork-filetree-gitmenu-actions">
                <div className="ork-filetree-githint">
                  alvo:{' '}
                  {mutTarget
                    ? `${relativeToRoot(root, mutTarget.path)}${mutTarget.isDir ? '/' : ''}`
                    : 'raiz da árvore'}
                </div>
                <button
                  className="nodrag ork-filetree-gitmenu-item"
                  role="menuitem"
                  onClick={() => {
                    setMutInput('')
                    setMutMenu('newfile')
                  }}
                >
                  <Icon name="FilePlus" size={13} animation="none" />
                  Novo arquivo…
                </button>
                <button
                  className="nodrag ork-filetree-gitmenu-item"
                  role="menuitem"
                  onClick={() => {
                    setMutInput('')
                    setMutMenu('newdir')
                  }}
                >
                  <Icon name="FolderPlus" size={13} animation="none" />
                  Nova pasta…
                </button>
                {mutTarget && (
                  <button
                    className="nodrag ork-filetree-gitmenu-item"
                    role="menuitem"
                    onClick={() => {
                      setMutInput(relativeToRoot(root, mutTarget.path))
                      setMutMenu('rename')
                    }}
                  >
                    <Icon name="Pencil" size={13} animation="none" />
                    Renomear / mover…
                  </button>
                )}
                {mutTarget && (
                  <button
                    className="nodrag ork-filetree-gitmenu-item ork-filetree-gitmenu-item--danger"
                    role="menuitem"
                    onClick={() => setMutMenu('delete')}
                  >
                    <Icon name="Trash2" size={13} animation="none" />
                    Excluir (Lixeira)…
                  </button>
                )}
                <button
                  className="nodrag ork-filetree-gitmenu-item"
                  role="menuitem"
                  onClick={() => setMutMenu('none')}
                >
                  Cancelar
                </button>
              </div>
            )}

            {(mutMenu === 'newfile' || mutMenu === 'newdir') && (
              <div className="ork-filetree-gitform">
                <div className="ork-filetree-githint">
                  {mutMenu === 'newfile' ? 'novo arquivo' : 'nova pasta'} em{' '}
                  {relativeToRoot(root, mutDestDir) || 'raiz'}/
                </div>
                <input
                  className="nodrag ork-filetree-gitinput"
                  value={mutInput}
                  onChange={(e) => setMutInput(e.target.value)}
                  placeholder={mutMenu === 'newfile' ? 'nome do arquivo' : 'nome da pasta'}
                  autoFocus
                />
                {mutInput.length > 0 && nameError(mutInput) && (
                  <div className="ork-filetree-giterr">{nameError(mutInput)}</div>
                )}
                <div className="ork-filetree-gitform-row">
                  <button
                    className="nodrag ork-node-go"
                    disabled={mutBusy || nameError(mutInput) !== ''}
                    onClick={() => {
                      const alvo = joinUnderRoot(mutDestDir, mutInput)
                      const kind = mutMenu === 'newdir' ? 'dir' : 'file'
                      void runMutation(`criado: ${relativeToRoot(root, alvo)}`, async () => {
                        await window.orkestra.filetree.create(alvo, root, kind)
                      })
                    }}
                  >
                    {mutBusy ? 'criando…' : 'Criar'}
                  </button>
                  <button className="nodrag ork-node-go" onClick={() => setMutMenu('menu')}>
                    Voltar
                  </button>
                </div>
              </div>
            )}

            {mutMenu === 'rename' && mutTarget && (
              <div className="ork-filetree-gitform">
                <div className="ork-filetree-githint">
                  renomear/mover {relativeToRoot(root, mutTarget.path)} para (relativo à raiz):
                </div>
                <input
                  className="nodrag ork-filetree-gitinput"
                  value={mutInput}
                  onChange={(e) => setMutInput(e.target.value)}
                  placeholder="novo/caminho/nome.ext"
                  autoFocus
                />
                {mutInput.length > 0 && relTargetError(mutInput) && (
                  <div className="ork-filetree-giterr">{relTargetError(mutInput)}</div>
                )}
                <div className="ork-filetree-gitform-row">
                  <button
                    className="nodrag ork-node-go"
                    disabled={mutBusy || relTargetError(mutInput) !== ''}
                    onClick={() => {
                      const from = mutTarget.path
                      const to = joinUnderRoot(root, mutInput)
                      void runMutation(`renomeado: ${mutInput}`, async () => {
                        await window.orkestra.filetree.rename(from, to, root)
                        // o preview do arquivo movido (ou de algo dentro da pasta movida) ficaria
                        // apontando para um caminho que não existe mais
                        if (previewPath && (previewPath === from || previewPath.startsWith(`${from}/`))) {
                          closePreview()
                        }
                      })
                    }}
                  >
                    {mutBusy ? 'renomeando…' : 'Renomear'}
                  </button>
                  <button className="nodrag ork-node-go" onClick={() => setMutMenu('menu')}>
                    Voltar
                  </button>
                </div>
              </div>
            )}

            {mutMenu === 'delete' && mutTarget && (
              <div className="ork-filetree-gitform">
                <div className="ork-filetree-githint">
                  Enviar {relativeToRoot(root, mutTarget.path)}
                  {mutTarget.isDir ? '/ (e todo o conteúdo)' : ''} para a Lixeira? Dá para restaurar
                  pela Lixeira do sistema.
                </div>
                <div className="ork-filetree-gitform-row">
                  <button
                    className="nodrag ork-node-go ork-node-go--danger"
                    disabled={mutBusy}
                    onClick={() => {
                      const alvo = mutTarget.path
                      void runMutation(
                        `enviado para a Lixeira: ${relativeToRoot(root, alvo)}`,
                        async () => {
                          await window.orkestra.filetree.remove(alvo, root)
                          if (previewPath && (previewPath === alvo || previewPath.startsWith(`${alvo}/`))) {
                            closePreview()
                          }
                        }
                      )
                    }}
                  >
                    {mutBusy ? 'enviando…' : 'Enviar para a Lixeira'}
                  </button>
                  <button className="nodrag ork-node-go" onClick={() => setMutMenu('menu')}>
                    Voltar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Erro do git, LITERAL ("nothing to commit", "would be overwritten by checkout"…): são
            mensagens que o usuário sabe ler e reescrevê-las só perderia informação. Fica fora do
            painel de propósito — continua visível depois que o menu fecha. */}
        {gitWriteError && (
          <div className="ork-filetree-giterr ork-filetree-giterr--banner" role="alert">
            {gitWriteError}
            <button
              className="nodrag ork-node-iconbtn"
              onClick={() => setGitWriteError('')}
              aria-label="Fechar erro"
            >
              <Icon name="X" size={12} animation="pop" />
            </button>
          </div>
        )}
        {gitWriteOk && (
          <div className="ork-filetree-gitok" role="status">
            {gitWriteOk}
            <button
              className="nodrag ork-node-iconbtn"
              onClick={() => setGitWriteOk('')}
              aria-label="Fechar aviso"
            >
              <Icon name="X" size={12} animation="pop" />
            </button>
          </div>
        )}
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
                  initialLine={pendingLine ?? undefined}
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
            <div className="ork-filetree-preview">
              {/* Onda 3 · T12: barra de citar do modo Diff. Mesmo padrão/vocabulário do FileEditor —
                  sem árvore ligada a um terminal, "citar" fica DESABILITADO (não há para onde
                  enviar) e o title explica o que fazer para habilitar. Só aparece quando há diff. */}
              {!diffLoading && diffLines.length > 0 && (
                <div className="ork-filetree-editor-actions">
                  <button
                    className="nodrag ork-filetree-editbtn"
                    onClick={quoteHunk}
                    disabled={!connectedTerminal || !pickedHunk}
                    title={
                      !connectedTerminal
                        ? 'Ligue esta árvore a um terminal para citar ao agente'
                        : !pickedHunk
                          ? 'Clique num hunk do diff para selecioná-lo'
                          : `Enviar o hunk de ${pickedHunk.file} ao agente conectado`
                    }
                  >
                    <Icon name="MessageSquare" size={13} animation="none" />
                    citar hunk
                  </button>
                  <span className="ork-filetree-editor-status" aria-live="polite">
                    {diffQuoteMsg || (pickedHunk ? `hunk de ${pickedHunk.file}` : 'clique num hunk')}
                  </span>
                </div>
              )}
              <div className="nodrag nowheel ork-filetree-previewbody">
                {diffLoading && <div className="ork-filetree-msg">carregando…</div>}
                {!diffLoading && diff && (
                  <DiffView
                    lines={diffLines}
                    truncated={diff.truncated}
                    selected={pickedHunk}
                    onPickHunk={(key) => {
                      // Clicar num cabeçalho de arquivo (não citável) não derruba a seleção atual —
                      // seria um "sumiu do nada" para quem só errou o alvo por uma linha.
                      if (!diffHunkAt(diffLines, key)) return
                      setPickedLine(key)
                      setDiffQuoteMsg('')
                    }}
                  />
                )}
              </div>
            </div>
          )}
          {root && !previewPath && mode === 'list' && (
            <>
              <div
                className="nodrag nowheel ork-filetree-rows"
                // T13: botão-direito em área VAZIA = agir na raiz (novo arquivo/pasta no topo).
                // As linhas param a propagação, então chegar aqui significa "fora de qualquer linha".
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (!searchActive) openMutMenu(null)
                }}
              >
                {treeLoading && <div className="ork-filetree-msg">carregando…</div>}
                {treeError && <div className="ork-filetree-msg ork-filetree-msg--err">{treeError}</div>}
                {/* ── T10: resultados da busca substituem a árvore enquanto houver query ── */}
                {!treeLoading && !treeError && searchActive && nameHits && (
                  <>
                    {nameHits.length === 0 && (
                      <div className="ork-filetree-msg">(nada carregado casa com “{search.query.trim()}”)</div>
                    )}
                    {nameHits.map((entry) => (
                      <div
                        key={entry.path}
                        className="nodrag ork-filetree-row"
                        style={{ paddingLeft: 8 }}
                        onClick={() => (entry.isDir ? toggleDir(entry) : openFile(entry))}
                        onDoubleClick={
                          entry.isDir
                            ? undefined
                            : () => void openEntryInEditor(entry, window.orkestra.ide.open)
                        }
                        draggable={!entry.isDir}
                        onDragStart={
                          entry.isDir
                            ? undefined
                            : (e) => {
                                e.dataTransfer.setData(ORKESTRA_PATH_MIME, entry.path)
                                e.dataTransfer.setData('text/plain', entry.path)
                                e.dataTransfer.effectAllowed = 'copy'
                              }
                        }
                        title={entry.path}
                      >
                        <span className="ork-filetree-name">
                          {relativeToRoot(root, entry.path)}
                          {entry.isDir ? '/' : ''}
                        </span>
                      </div>
                    ))}
                  </>
                )}
                {!treeLoading && !treeError && searchActive && search.mode === 'content' && (
                  <>
                    {contentLoading && <div className="ork-filetree-msg">buscando…</div>}
                    {contentError && (
                      <div className="ork-filetree-msg ork-filetree-msg--err">{contentError}</div>
                    )}
                    {!contentLoading && !contentError && !contentResults && (
                      <div className="ork-filetree-msg">Enter para buscar no conteúdo</div>
                    )}
                    {!contentLoading && !contentError && contentResults && (
                      <>
                        {contentResults.matches.length === 0 && (
                          <div className="ork-filetree-msg">(nenhuma ocorrência)</div>
                        )}
                        {contentResults.matches.map((m) => (
                          <div
                            key={`${m.path}:${m.line}`}
                            className="nodrag ork-filetree-row ork-filetree-hit"
                            onClick={() => openFileAtLine(m.path, m.line)}
                            title={`${m.path}:${m.line}`}
                          >
                            <span className="ork-filetree-hit-loc">
                              {relativeToRoot(root, m.path)}:{m.line}
                            </span>
                            <span className="ork-filetree-hit-snippet">{m.text}</span>
                          </div>
                        ))}
                        {contentResults.truncated && (
                          <div className="ork-filetree-msg ork-filetree-msg--warn">
                            (mais ocorrências existem — refine a busca)
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
                {/* Árvore normal — só quando não há busca ativa */}
                {!searchActive && !treeLoading && !treeError && entries.length === 0 && (
                  <div className="ork-filetree-msg">(vazio)</div>
                )}
                {!searchActive && (
                  <TreeLevel
                    entries={entries}
                    depth={0}
                    root={root}
                    expanded={expanded}
                    childrenCache={childrenCache}
                    gitStatus={gitStatus}
                    onToggleDir={toggleDir}
                    onOpenFile={openFile}
                    onContextEntry={openMutMenu}
                  />
                )}
              </div>
              {/* ── T10: rodapé de busca. Sem prefixo = filtro por NOME (instantâneo, sobre o já
                  carregado); `>` = busca por CONTEÚDO no disco (Enter dispara). O × limpa e volta
                  para a árvore. */}
              <div className="ork-filetree-search">
                <Icon name="Search" size={12} animation="none" />
                <input
                  className="nodrag ork-filetree-search-input"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value)
                    // resultados pertencem à query que os gerou — digitou, invalidou.
                    setContentResults(null)
                    setContentError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && search.mode === 'content') runContentSearch(search.query)
                    if (e.key === 'Escape') {
                      setSearchInput('')
                      setContentResults(null)
                      setContentError('')
                    }
                  }}
                  placeholder={'buscar por nome — comece com > para conteúdo'}
                  aria-label="Buscar na árvore (prefixo > busca no conteúdo)"
                />
                {searchInput && (
                  <button
                    className="nodrag ork-node-iconbtn"
                    onClick={() => {
                      setSearchInput('')
                      setContentResults(null)
                      setContentError('')
                    }}
                    aria-label="Limpar busca"
                    title="Limpar busca"
                  >
                    <Icon name="X" size={12} animation="pop" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
