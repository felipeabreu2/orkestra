import { useEffect, useState } from 'react'
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import { TerminalNode } from './TerminalNode'
import { useCanvasStore } from '../store/canvasStore'
import type { Floor } from '../../../shared/floors'
import './nodes.css'

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
      <div className="ork-node">
        <div className="ork-node-header">
          <span className="ork-node-dot" aria-hidden="true" />
          <input
            className="nodrag ork-node-input"
            value={name}
            onChange={(e) => updateTerminalName(id, e.target.value)}
            aria-label="Nome do terminal"
          />
          <input
            className="nodrag ork-node-input ork-node-input--secondary"
            value={role}
            onChange={(e) => updateTerminalRole(id, e.target.value)}
            aria-label="Papel do terminal"
            placeholder="papel"
          />
          <select
            className="nodrag ork-node-input ork-node-input--select"
            value={floorId}
            onChange={(e) => updateTerminalFloor(id, e.target.value)}
            onFocus={() => {
              window.orkestra.floors.list().then(setFloors)
            }}
            aria-label="Floor do terminal"
            title={floorId ? (floors.find((f) => f.id === floorId)?.name ?? floorId) : 'sem floor'}
          >
            <option value="">sem floor</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            className="nodrag ork-node-iconbtn"
            onClick={() => removeNode(id)}
            aria-label="Fechar terminal"
          >
            ×
          </button>
        </div>
        <div className="nodrag nowheel ork-node-body">
          <TerminalNode nodeId={id} preset={preset} autostart={autostart} floorId={floorId} />
        </div>
      </div>
    </>
  )
}
