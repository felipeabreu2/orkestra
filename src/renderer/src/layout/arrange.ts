// Alinhar / distribuir / organizar em grade nós selecionados (Fase 18 Task 2).
//
// Funções PURAS de geometria — sem dependência de React/Zustand/React Flow. Recebem uma lista
// de "PosNode" (id + posição + width/height opcionais) e devolvem um mapa id -> nova posição,
// que o chamador (Canvas.tsx) repassa a `canvasStore.setNodePositions`. Isso as torna
// 100% testáveis em isolamento (arrange.test.ts) e reutilizáveis fora do React Flow.
//
// width/height ausentes são tratados como 0 (não lança e não quebra a matemática de bordas) —
// alguns nós podem não ter dimensão conhecida ainda no momento do clique.

export interface PosNode {
  id: string
  position: { x: number; y: number }
  width?: number
  height?: number
}

export type AlignAxis = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'

type PositionMap = Record<string, { x: number; y: number }>

/**
 * Alinha os nós num dos 6 eixos, usando a bounding box da seleção como referência:
 * - left/top: menor x/y da seleção.
 * - right/bottom: maior borda direita/inferior (x+width / y+height) da seleção.
 * - hcenter/vcenter: centro da bounding box ((min + max) / 2), cada nó centralizado nele.
 * Cada nó devolvido preserva a coordenada do eixo NÃO alinhado (align horizontal não mexe em y
 * e vice-versa).
 */
export function alignNodes(nodes: PosNode[], axis: AlignAxis): PositionMap {
  const result: PositionMap = {}
  if (nodes.length === 0) return result

  const minX = Math.min(...nodes.map((n) => n.position.x))
  const maxRight = Math.max(...nodes.map((n) => n.position.x + (n.width ?? 0)))
  const minY = Math.min(...nodes.map((n) => n.position.y))
  const maxBottom = Math.max(...nodes.map((n) => n.position.y + (n.height ?? 0)))
  const centerX = (minX + maxRight) / 2
  const centerY = (minY + maxBottom) / 2

  for (const n of nodes) {
    const w = n.width ?? 0
    const h = n.height ?? 0
    let x = n.position.x
    let y = n.position.y
    switch (axis) {
      case 'left':
        x = minX
        break
      case 'hcenter':
        x = centerX - w / 2
        break
      case 'right':
        x = maxRight - w
        break
      case 'top':
        y = minY
        break
      case 'vcenter':
        y = centerY - h / 2
        break
      case 'bottom':
        y = maxBottom - h
        break
    }
    result[n.id] = { x, y }
  }
  return result
}

/**
 * Distribui os nós com espaçamento igual ao longo de um eixo. Os dois nós extremos (menor e
 * maior posição no eixo escolhido) ficam parados; os do meio são reposicionados para que o
 * espaço entre as bordas (não os centros) de nós consecutivos seja o mesmo. Com <=2 nós não há
 * "meio" a distribuir — devolve as posições originais inalteradas.
 */
export function distributeNodes(nodes: PosNode[], axis: DistributeAxis): PositionMap {
  const result: PositionMap = {}
  if (nodes.length === 0) return result

  // Semeia todos com a posição original: garante que (a) o eixo não distribuído fique
  // intocado e (b) os extremos fiquem EXATAMENTE na posição original (sem arredondamento
  // de ponto flutuante vindo da acumulação do gap abaixo).
  for (const n of nodes) result[n.id] = { ...n.position }
  if (nodes.length <= 2) return result

  const getCoord = (n: PosNode): number => (axis === 'horizontal' ? n.position.x : n.position.y)
  const getSize = (n: PosNode): number => (axis === 'horizontal' ? (n.width ?? 0) : (n.height ?? 0))

  const sorted = [...nodes].sort((a, b) => getCoord(a) - getCoord(b))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  const totalSize = sorted.reduce((sum, n) => sum + getSize(n), 0)
  const span = getCoord(last) + getSize(last) - getCoord(first)
  const gap = (span - totalSize) / (sorted.length - 1)

  let cursor = getCoord(first) + getSize(first) + gap
  for (let i = 1; i < sorted.length - 1; i++) {
    const n = sorted[i]
    const base = result[n.id]
    result[n.id] = axis === 'horizontal' ? { x: cursor, y: base.y } : { x: base.x, y: cursor }
    cursor += getSize(n) + gap
  }

  return result
}

/**
 * Organiza os nós numa grade: ceil(sqrt(n)) colunas, passo = maior width/height da seleção + gap
 * (mesmo passo nos dois eixos, usando a maior dimensão para não sobrepor mesmo com tamanhos
 * mistos), ancorada no menor x/y da seleção (o nó mais ao topo-esquerda não se move).
 */
export function gridArrange(nodes: PosNode[], opts?: { gap?: number }): PositionMap {
  const result: PositionMap = {}
  if (nodes.length === 0) return result

  const gap = opts?.gap ?? 24
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const maxWidth = Math.max(...nodes.map((n) => n.width ?? 0))
  const maxHeight = Math.max(...nodes.map((n) => n.height ?? 0))
  const stepX = maxWidth + gap
  const stepY = maxHeight + gap
  const anchorX = Math.min(...nodes.map((n) => n.position.x))
  const anchorY = Math.min(...nodes.map((n) => n.position.y))

  nodes.forEach((n, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    result[n.id] = { x: anchorX + col * stepX, y: anchorY + row * stepY }
  })

  return result
}
