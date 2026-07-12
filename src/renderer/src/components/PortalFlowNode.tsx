import { useEffect, useRef, useState } from 'react'
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import type { WebviewTag } from 'electron'
import { useShallow } from 'zustand/react/shallow'
import { PortalNode } from './PortalNode'
import { useCanvasStore } from '../store/canvasStore'
import { partitionForPortal } from '../portalPartition'
import './nodes.css'

export function PortalFlowNode({ id, selected, data }: NodeProps): JSX.Element {
  const removeNode = useCanvasStore((s) => s.removeNode)
  const updatePortalName = useCanvasStore((s) => s.updatePortalName)
  const updatePortalUrl = useCanvasStore((s) => s.updatePortalUrl)
  const updatePortalLink = useCanvasStore((s) => s.updatePortalLink)
  // Fase 25 (Task 2): outros portais do canvas — listados no seletor de sessão como possíveis
  // fontes de "compartilhar" (linkedTo aponta pro nodeId de um destes).
  // useShallow é obrigatório aqui: zustand v5 não memoiza seletores (useSyncExternalStore puro),
  // então um `.filter()` sem useShallow devolve um array novo a cada leitura -> loop infinito de
  // render ("Maximum update depth exceeded") assim que um portal monta.
  const portals = useCanvasStore(
    useShallow((s) => s.nodes.filter((n) => n.type === 'portal' && n.id !== id))
  )
  const name = (data as { name?: string })?.name ?? 'Portal'
  const url = (data as { url?: string })?.url ?? ''
  const linkedTo = data.linkedTo as string | undefined
  // Fase 25 (Task 2): partition de sessão deste portal — própria (isolada) por padrão, ou a
  // mesma do portal-fonte quando linkedTo aponta pra outro nó (ver portalPartition.ts).
  const partition = partitionForPortal(id, linkedTo)

  const webviewRef = useRef<WebviewTag>(null)
  // Rascunho local da barra de URL: só vira navegação/persistência ao clicar "ir" (ou Enter),
  // não a cada tecla — evita recarregar o webview a cada caractere digitado.
  const [urlInput, setUrlInput] = useState(url)

  // Mantém a barra em sincronia se data.url mudar por fora (ex.: hydrate ao carregar um
  // snapshot salvo, ou futuramente `orq portal open` — Task 2).
  useEffect(() => {
    setUrlInput(url)
  }, [url])

  const go = (): void => {
    updatePortalUrl(id, urlInput)
    if (urlInput) webviewRef.current?.loadURL(urlInput)
  }

  return (
    <>
      <NodeResizer minWidth={240} minHeight={140} isVisible={selected ?? false} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="ork-node">
        <div className="ork-node-header">
          <span className="ork-node-dot ork-node-dot--portal" aria-hidden="true" />
          <input
            className="nodrag ork-node-input"
            value={name}
            onChange={(e) => updatePortalName(id, e.target.value)}
            aria-label="Nome do portal"
          />
          {/* Fase 25 (Task 2): seletor de sessão — "isolada" usa a própria partition
              (persist:portal-<id>); "compartilhar" usa a partition de outro portal (mesmos
              cookies/login). Trocar aqui muda linkedTo -> muda partition -> (via key={partition}
              no PortalNode abaixo) remonta o webview com a nova sessão. */}
          <select
            className="nodrag ork-portal-session"
            value={linkedTo ?? ''}
            onChange={(e) => updatePortalLink(id, e.target.value || undefined)}
            title="Sessão do portal (cookies/login). Isolada = conta própria; compartilhar = mesma sessão de outro portal."
          >
            <option value="">Sessão isolada</option>
            {portals.map((p) => (
              <option key={p.id} value={p.id}>
                Compartilhar: {(p.data?.name as string) ?? 'Portal'}
              </option>
            ))}
          </select>
          <button
            className="nodrag ork-node-iconbtn"
            onClick={() => removeNode(id)}
            aria-label="Fechar portal"
            title="Remover nó"
          >
            ×
          </button>
        </div>
        <div className="nodrag ork-node-urlbar">
          <input
            className="nodrag ork-node-urlinput"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') go()
            }}
            placeholder="https://..."
            aria-label="URL do portal"
          />
          <button className="nodrag ork-node-go" onClick={go} aria-label="Ir" title="Navegar">
            ir
          </button>
        </div>
        <div className="nodrag nowheel ork-node-body">
          <PortalNode
            key={partition}
            ref={webviewRef}
            url={url}
            nodeId={id}
            name={name}
            partition={partition}
          />
        </div>
      </div>
    </>
  )
}
