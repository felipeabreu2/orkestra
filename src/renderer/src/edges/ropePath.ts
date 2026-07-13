// Geometria da conexão "corda" (F02): um bezier QUADRÁTICO cujo ponto de controle fica ABAIXO do
// ponto médio (gravidade), dando a "barriga". Função pura — o TypedEdge só desenha o resultado.
// Retorna a mesma tripla [path, labelX, labelY] das helpers do React Flow (getBezierPath), então o
// badge/label da edge continua sendo posicionado do mesmo jeito.

const MIN_SAG = 24
const SAG_FACTOR = 0.25

// Profundidade da barriga: proporcional à distância horizontal (corda mais "aberta" pendura mais),
// com um mínimo para nunca ficar reta. dy entra só para não exagerar em conexões muito verticais.
export function ropeSag(dx: number, dy: number): number {
  const horizontal = Math.abs(dx)
  const base = Math.max(MIN_SAG, horizontal * SAG_FACTOR)
  // Amortece a barriga quando a conexão é bem mais vertical que horizontal (evita laço estranho).
  const verticalDamp = Math.abs(dy) > horizontal ? horizontal / Math.abs(dy || 1) : 1
  return base * verticalDamp
}

export function ropePath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  swingX = 0
): [string, number, number] {
  const sag = ropeSag(tx - sx, ty - sy)
  const cx = (sx + tx) / 2 + swingX
  const cy = (sy + ty) / 2 + sag
  const path = `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`
  // Ponto no meio da quadrática (t=0.5) para posicionar o badge: 0.25*P0 + 0.5*Pc + 0.25*P2.
  const labelX = 0.25 * sx + 0.5 * cx + 0.25 * tx
  const labelY = 0.25 * sy + 0.5 * cy + 0.25 * ty
  return [path, labelX, labelY]
}
