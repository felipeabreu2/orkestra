// R5 (estilo de conexão): as conexões do canvas podem ser desenhadas como curvas (bezier, padrão)
// ou como "circuito" (trilhos ortogonais com cantos de 90°). Preferência global de UI, persistida
// em localStorage — espelha o padrão de theme.ts, mas SEM tocar o DOM: a reatividade vem do store
// (TypedEdge lê s.edgeStyle), então aqui só resolvemos/persistimos o valor.
export type EdgeStyle = 'curva' | 'circuito'

const STORAGE_KEY = 'orkestra-edge-style'

export function resolveInitialEdgeStyle(stored: string | null): EdgeStyle {
  return stored === 'circuito' ? 'circuito' : 'curva'
}

export function nextEdgeStyle(current: EdgeStyle): EdgeStyle {
  return current === 'curva' ? 'circuito' : 'curva'
}

export function loadEdgeStyle(): EdgeStyle {
  let stored: string | null = null
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  } catch {
    stored = null
  }
  return resolveInitialEdgeStyle(stored)
}

export function saveEdgeStyle(style: EdgeStyle): void {
  try {
    localStorage.setItem(STORAGE_KEY, style)
  } catch {
    /* localStorage indisponível — o valor segue em memória no store */
  }
}
