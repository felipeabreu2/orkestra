import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { rankItems } from '../search'
import { buildPaletteItems, type PaletteItem } from '../palette/paletteCommands'
import { nextEdgeStyle } from '../edges/edgeStyle'
import { isValidSshHost } from '../../../shared/ssh'
import { AskAgentPanel } from './AskAgentPanel'
import { Icon } from './Icon'
import './CommandPalette.css'

// Command palette (Cmd/Ctrl+K, Fase 12): busca unificada sobre ações de criação (terminal/
// nota/portal/árvore de arquivos), ações contextuais da seleção atual (focar/remover/renomear/
// definir papel/conectar/desconectar — Fase 23) e os nós já presentes no canvas. A montagem dos
// itens é pura e testada em paletteCommands.test.ts (`buildPaletteItems`) — este componente só
// traduz o estado do store pro formato que ela espera, fecha `run`/`input` sobre o store e sobre
// `useReactFlow`, filtra via `rankItems` (puro, testado em search.test.ts) e cuida do teclado
// (↑/↓ navegam, Enter executa, Esc fecha). Desde a Fase 23 existe também um "modo input" — uma
// segunda tela de texto pra itens que pedem um valor (renomear/definir papel), já que o Electron
// bloqueia `window.prompt`. Precisa renderizar dentro do contexto do React Flow (ReactFlowProvider
// em App.tsx envolve todo o Canvas, então basta montar ao lado dos demais painéis) para que
// `useReactFlow()` funcione. Estilo mínimo segue os tokens da Fase 13.
interface CommandPaletteProps {
  onClose: () => void
}

// Rótulo curto por `kind` pro badge da lista (Fase 23 Task 2, Step 3 do brief: "dica visual leve
// por kind"). Tipado como Record<PaletteItem['kind'], string> de propósito — se paletteCommands.ts
// ganhar um kind novo, falta de entrada aqui vira erro de compilação em vez de um badge quebrado
// em silêncio.
const KIND_LABELS: Record<PaletteItem['kind'], string> = {
  action: 'ação',
  node: 'nó',
  context: 'contexto',
  connect: 'conectar',
  disconnect: 'desconectar'
}

// Rótulo de GRUPO (overlays §4.6 do spec): cabeçalho de seção acima da primeira ocorrência de
// cada `kind` na lista já ordenada/filtrada — reaproveita o mesmo campo `kind` do badge acima
// (sem precisar de metadado novo em paletteCommands.ts) para render dos grupos "Ações"/"Ir para"
// do mockup (docs/design-system/mockups/orkestra-overlays.html) sobre os kinds reais do app.
const KIND_GROUP_LABELS: Record<PaletteItem['kind'], string> = {
  action: 'Ações',
  node: 'Ir para',
  context: 'Contexto',
  connect: 'Conectar',
  disconnect: 'Desconectar'
}

export function CommandPalette({ onClose }: CommandPaletteProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  // Modo input (Fase 23): quando o item escolhido pede texto (renomear/definir papel), a lista
  // some e dá lugar a essa segunda tela. `inputItem` guarda o item (label + `input.submit`);
  // `inputValue` é o texto controlado do campo, pré-preenchido com `input.initial`.
  const [inputItem, setInputItem] = useState<PaletteItem | null>(null)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Modo "perguntar ao agente" (Fase 24): quando o item escolhido tem `ask` (ver
  // paletteCommands.ts), a lista some e dá lugar ao AskAgentPanel — mesma posição/mecânica do
  // modo input acima, mas com fases próprias (digitar prompt -> preview do stream) geridas
  // inteiramente dentro do painel.
  const [askTarget, setAskTarget] = useState<{ nodeId: string; label: string } | null>(null)

  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const addTerminalNode = useCanvasStore((s) => s.addTerminalNode)
  const addNoteNode = useCanvasStore((s) => s.addNoteNode)
  const addPortalNode = useCanvasStore((s) => s.addPortalNode)
  const addFileTreeNode = useCanvasStore((s) => s.addFileTreeNode)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const updateTerminalName = useCanvasStore((s) => s.updateTerminalName)
  const updateTerminalRole = useCanvasStore((s) => s.updateTerminalRole)
  const onConnect = useCanvasStore((s) => s.onConnect)
  const removeEdge = useCanvasStore((s) => s.removeEdge)
  const removeEdgesForNode = useCanvasStore((s) => s.removeEdgesForNode)
  const edgeStyle = useCanvasStore((s) => s.edgeStyle)
  const setEdgeStyle = useCanvasStore((s) => s.setEdgeStyle)
  const { setCenter } = useReactFlow()

  // Autofocus na busca ao montar — e de volta pra ela sempre que o modo input fecha (Esc), já
  // que a tela de input desmonta o <input> da busca, e remontar um elemento não devolve o foco
  // sozinho. O palette em si só existe no DOM enquanto aberto (Canvas.tsx desmonta via
  // `{paletteOpen && ...}`), então este efeito roda toda vez que ele abre também.
  useEffect(() => {
    if (!inputItem) inputRef.current?.focus()
  }, [inputItem])

  // Foca o nó centralizando o viewport no centro visual dele — soma metade da largura/altura à
  // posição (que é o canto superior-esquerdo), não fitView (mais previsível pra um único alvo
  // escolhido no palette) (Fase 12, corrigido Fase 13). Redefinida a cada render (fecha sobre
  // `nodes`/`setCenter` atuais); `setCenter` do React Flow é estável entre renders e `nodes` já
  // está nas deps do `useMemo` abaixo, então `items` sempre referencia a versão corrente.
  const focusNode = (id: string): void => {
    const n = nodes.find((x) => x.id === id)
    if (n) {
      void setCenter(n.position.x + (n.width ?? 200) / 2, n.position.y + (n.height ?? 120) / 2, {
        zoom: 1.2,
        duration: 300
      })
    }
  }

  // Fase 27 (Task 4): cria o terminal SSH remoto a partir do texto digitado no modo input do
  // palette (item `action:ssh` em paletteCommands.ts). `isValidSshHost` aqui é só validação de UX
  // (evita spawnar um destino obviamente inválido) — o boundary de segurança real é a revalidação
  // no main, no `pty:spawn` com `sshHost` (Task 2). Se o host não passar, simplesmente não cria
  // nada (sem toast/erro — mesmo padrão silencioso de outras validações de input no palette).
  const addSshTerminal = (host: string): void => {
    const h = host.trim()
    if (!isValidSshHost(h)) return
    addTerminalNode(undefined, { name: `SSH: ${h}`, sshHost: h })
  }

  const items = useMemo(
    () =>
      buildPaletteItems({
        nodes: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data as Record<string, unknown>, selected: n.selected })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
        selectedNodes: nodes
          .filter((n) => n.selected)
          .map((n) => ({ id: n.id, type: n.type, data: n.data as Record<string, unknown>, selected: true })),
        edgeStyle,
        actions: {
          addTerminalNode,
          addNoteNode,
          addPortalNode,
          addFileTreeNode,
          focusNode,
          removeNode,
          renameTerminal: updateTerminalName,
          setTerminalRole: updateTerminalRole,
          connect: (source, target) => onConnect({ source, target, sourceHandle: null, targetHandle: null }),
          removeEdge,
          addSshTerminal,
          toggleEdgeStyle: () => setEdgeStyle(nextEdgeStyle(edgeStyle)),
          removeEdgesForNode
        }
      }),
    [
      nodes,
      edges,
      addTerminalNode,
      addNoteNode,
      addPortalNode,
      addFileTreeNode,
      removeNode,
      updateTerminalName,
      updateTerminalRole,
      onConnect,
      removeEdge,
      addSshTerminal,
      edgeStyle,
      setEdgeStyle,
      removeEdgesForNode
    ]
  )

  const filtered = useMemo(() => rankItems(query, items), [query, items])
  const activeIndex = filtered.length === 0 ? -1 : Math.min(selectedIndex, filtered.length - 1)

  const runItem = (item: PaletteItem | undefined): void => {
    if (!item) return
    if (item.ask) {
      setAskTarget(item.ask)
      return
    }
    if (item.input) {
      setInputItem(item)
      setInputValue(item.input.initial)
      return
    }
    item.run?.()
    onClose()
  }

  const submitInput = (): void => {
    if (inputItem?.input) inputItem.input.submit(inputValue)
    setInputItem(null)
    onClose()
  }

  return (
    // Backdrop: clique fora do card fecha o palette (onClose aqui); o card abaixo para a
    // propagação e carrega role/aria-modal — é ele que representa o diálogo em si (Fase 13).
    <div className="ork-palette-backdrop" onClick={onClose}>
      <div className="ork-palette-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {inputItem ? (
          <div className="ork-palette-input-screen">
            <div className="ork-palette-input-label">{inputItem.label}</div>
            <input
              autoFocus
              className="ork-palette-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitInput()
                } else if (e.key === 'Escape') {
                  // Volta pra lista sem fechar o palette (Step 2 do brief) — quem fecha via Esc é
                  // só a lista (abaixo), quando não há item de input em andamento.
                  e.preventDefault()
                  setInputItem(null)
                } else if (e.key === 'Tab') {
                  e.preventDefault()
                }
              }}
              placeholder={inputItem.input?.placeholder}
              aria-label={inputItem.label}
            />
            <div className="ork-palette-input-hint">Enter para confirmar · Esc para voltar</div>
          </div>
        ) : askTarget ? (
          <AskAgentPanel nodeId={askTarget.nodeId} label={askTarget.label} onClose={onClose} />
        ) : (
          <>
            <div className="ork-palette-search">
              <Icon name="Search" size={17} animation="none" />
              <input
                ref={inputRef}
                className="ork-palette-input"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelectedIndex(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelectedIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelectedIndex((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    runItem(filtered[activeIndex])
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    onClose()
                  } else if (e.key === 'Tab') {
                    // Focus-trap simples (Fase 13): o input é o único elemento focável do palette (a
                    // lista é navegada por seta, não por Tab), então basta bloquear o Tab pra ele não
                    // vazar foco pro canvas por trás do overlay.
                    e.preventDefault()
                  }
                }}
                placeholder="Buscar nós ou ações..."
                aria-label="Busca do command palette"
              />
              <span className="ork-palette-kbd">esc</span>
            </div>
            <div className="ork-palette-list">
              {filtered.length === 0 && <div className="ork-palette-empty">Nenhum resultado</div>}
              {(() => {
                let lastKind: PaletteItem['kind'] | null = null
                return filtered.map((item, index) => {
                  const showGroup = item.kind !== lastKind
                  lastKind = item.kind
                  return (
                    <Fragment key={item.id}>
                      {showGroup && <div className="ork-palette-group">{KIND_GROUP_LABELS[item.kind]}</div>}
                      <div
                        className={`ork-palette-item${index === activeIndex ? ' ork-palette-item--active' : ''}`}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => runItem(item)}
                      >
                        <span className="ork-palette-item-label">{item.label}</span>
                        <span className="ork-palette-item-kind">{KIND_LABELS[item.kind]}</span>
                      </div>
                    </Fragment>
                  )
                })
              })()}
            </div>
            {filtered.length > 0 && (
              <div className="ork-palette-foot">
                <span>
                  <b>↑↓</b> navegar
                </span>
                <span>
                  <b>↵</b> abrir
                </span>
                <span>
                  <b>esc</b> fechar
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
