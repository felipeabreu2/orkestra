import { useEffect, useRef, useState } from 'react'
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import type { WebviewTag } from 'electron'
import { PortalNode } from './PortalNode'
import { useCanvasStore } from '../store/canvasStore'

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
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#1e1e1e',
          border: '1px solid #333',
          borderRadius: 6,
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            height: 26,
            background: '#2d2d2d',
            color: '#cccccc',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            cursor: 'grab',
            userSelect: 'none'
          }}
        >
          <input
            className="nodrag"
            value={name}
            onChange={(e) => updatePortalName(id, e.target.value)}
            aria-label="Nome do portal"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#cccccc',
              fontSize: 12,
              padding: 0,
              outline: 'none',
              flex: 1,
              minWidth: 0
            }}
          />
          <button
            className="nodrag"
            onClick={() => removeNode(id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#cccccc',
              fontSize: 15,
              lineHeight: 1,
              cursor: 'pointer',
              padding: '0 4px'
            }}
            aria-label="Fechar portal"
          >
            ×
          </button>
        </div>
        <div
          className="nodrag"
          style={{
            height: 26,
            background: '#242424',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '0 6px',
            borderBottom: '1px solid #333'
          }}
        >
          <input
            className="nodrag"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') go()
            }}
            placeholder="https://..."
            aria-label="URL do portal"
            style={{
              flex: 1,
              minWidth: 0,
              background: '#1a1a1a',
              border: '1px solid #3a3a3a',
              borderRadius: 4,
              color: '#cccccc',
              fontSize: 12,
              padding: '2px 6px',
              outline: 'none'
            }}
          />
          <button
            className="nodrag"
            onClick={go}
            aria-label="Ir"
            style={{
              background: '#1633f9',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              padding: '3px 10px',
              cursor: 'pointer'
            }}
          >
            ir
          </button>
        </div>
        <div className="nodrag nowheel" style={{ flex: 1, minHeight: 0 }}>
          <PortalNode ref={webviewRef} url={url} />
        </div>
      </div>
    </>
  )
}
