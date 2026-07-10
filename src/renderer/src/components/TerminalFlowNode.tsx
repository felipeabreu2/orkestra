import { useEffect, useState } from 'react'
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import { TerminalNode } from './TerminalNode'
import { useCanvasStore } from '../store/canvasStore'
import type { Floor } from '../../../shared/floors'

export function TerminalFlowNode({ id, selected, data }: NodeProps): JSX.Element {
  const removeNode = useCanvasStore((s) => s.removeNode)
  const updateTerminalName = useCanvasStore((s) => s.updateTerminalName)
  const updateTerminalRole = useCanvasStore((s) => s.updateTerminalRole)
  const updateTerminalFloor = useCanvasStore((s) => s.updateTerminalFloor)
  const name = (data as { name?: string })?.name ?? 'Terminal'
  const role = (data as { role?: string })?.role ?? ''
  const floorId = (data as { floorId?: string })?.floorId ?? ''
  const preset = (data as { preset?: string })?.preset
  const autostart = (data as { autostart?: boolean })?.autostart

  // Lista local de floors p/ o seletor abaixo — buscada uma vez ao montar e novamente ao
  // focar o select (cobre o caso comum de o usuário criar um floor no FloorsPanel enquanto
  // este terminal já está na tela). Sem assinatura/push: floors.list() é um invoke pontual.
  const [floors, setFloors] = useState<Floor[]>([])
  useEffect(() => {
    let cancelled = false
    window.orkestra.floors.list().then((list) => {
      if (!cancelled) setFloors(list)
    })
    return () => {
      cancelled = true
    }
  }, [])
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
            onChange={(e) => updateTerminalName(id, e.target.value)}
            aria-label="Nome do terminal"
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
          <input
            className="nodrag"
            value={role}
            onChange={(e) => updateTerminalRole(id, e.target.value)}
            aria-label="Papel do terminal"
            placeholder="papel"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8a8a8a',
              fontSize: 12,
              padding: 0,
              outline: 'none',
              flex: 1,
              minWidth: 0,
              textAlign: 'right'
            }}
          />
          <select
            className="nodrag"
            value={floorId}
            onChange={(e) => updateTerminalFloor(id, e.target.value)}
            onFocus={() => {
              window.orkestra.floors.list().then(setFloors)
            }}
            aria-label="Floor do terminal"
            title={floorId ? (floors.find((f) => f.id === floorId)?.name ?? floorId) : 'sem floor'}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8a8a8a',
              fontSize: 11,
              outline: 'none',
              flex: '0 0 auto',
              maxWidth: 70
            }}
          >
            <option value="">sem floor</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
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
            aria-label="Fechar terminal"
          >
            ×
          </button>
        </div>
        <div className="nodrag nowheel" style={{ flex: 1, minHeight: 0 }}>
          <TerminalNode nodeId={id} preset={preset} autostart={autostart} floorId={floorId} />
        </div>
      </div>
    </>
  )
}
