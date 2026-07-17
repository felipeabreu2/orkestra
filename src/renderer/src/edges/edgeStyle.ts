// R5/Onda 2: estilo global das conexões — 'curva' (bezier), 'circuito' (trilhos ortogonais) ou
// 'corda' (bezier com barriga por gravidade + traço pontilhado grosso + balanço; F02). Preferência
// de UI persistida em localStorage; TypedEdge lê s.edgeStyle. 'corda' é o padrão (a referência usa
// cordas), mas uma preferência salva anterior é respeitada.
export type EdgeStyle = 'curva' | 'circuito' | 'corda'

const STORAGE_KEY = 'orkestra-edge-style'

export function resolveInitialEdgeStyle(stored: string | null): EdgeStyle {
  if (stored === 'curva' || stored === 'circuito' || stored === 'corda') return stored
  return 'corda'
}

// Conexões T4: estilo POR ARESTA. `dataStyle` vem de `edge.data.style` — ou seja, de um snapshot
// em disco, que pode estar corrompido ou ter sido escrito por uma versão futura do app. Por isso o
// parâmetro é `unknown` e qualquer valor que não seja um EdgeStyle conhecido cai no global (que já
// é sempre válido, vindo de resolveInitialEdgeStyle). Ausência de override = seguir o global.
export function isEdgeStyle(value: unknown): value is EdgeStyle {
  return value === 'curva' || value === 'circuito' || value === 'corda'
}

export function resolveEdgeStyle(dataStyle: unknown, global: EdgeStyle): EdgeStyle {
  return isEdgeStyle(dataStyle) ? dataStyle : global
}

export function nextEdgeStyle(current: EdgeStyle): EdgeStyle {
  if (current === 'curva') return 'circuito'
  if (current === 'circuito') return 'corda'
  return 'curva'
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
