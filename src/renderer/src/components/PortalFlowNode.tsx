import { useEffect, useRef, useState } from 'react'
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import type { WebviewTag } from 'electron'
import { PortalNode } from './PortalNode'
import { useCanvasStore } from '../store/canvasStore'
import './nodes.css'

export function PortalFlowNode({ id, selected, data }: NodeProps): JSX.Element {
  const removeNode = useCanvasStore((s) => s.removeNode)
  const updatePortalName = useCanvasStore((s) => s.updatePortalName)
  const updatePortalUrl = useCanvasStore((s) => s.updatePortalUrl)
  const name = (data as { name?: string })?.name ?? 'Portal'
  const url = (data as { url?: string })?.url ?? ''

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
          <button className="nodrag ork-node-iconbtn" onClick={() => removeNode(id)} aria-label="Fechar portal">
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
          <button className="nodrag ork-node-go" onClick={go} aria-label="Ir">
            ir
          </button>
        </div>
        <div className="nodrag nowheel ork-node-body">
          <PortalNode ref={webviewRef} url={url} nodeId={id} name={name} />
        </div>
      </div>
    </>
  )
}
