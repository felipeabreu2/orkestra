import { Handle, Position } from '@xyflow/react'
import type { JSX } from 'react'

// Handles de conexão padrão de todos os nós (F03): ENTRADA na esquerda e no topo (target),
// SAÍDA na direita e embaixo (source). Assim o usuário liga contexto tanto pela lateral quanto por
// cima/baixo, sempre com a mesma direção: uma saída (direita/base) conecta a uma entrada
// (esquerda/topo). Os ids distinguem os dois handles do mesmo tipo e são persistidos na edge.
export function NodeHandles(): JSX.Element {
  return (
    <>
      <Handle type="target" position={Position.Left} id="in-left" className="ork-handle ork-handle--in" />
      <Handle type="target" position={Position.Top} id="in-top" className="ork-handle ork-handle--in" />
      <Handle type="source" position={Position.Right} id="out-right" className="ork-handle ork-handle--out" />
      <Handle type="source" position={Position.Bottom} id="out-bottom" className="ork-handle ork-handle--out" />
    </>
  )
}
