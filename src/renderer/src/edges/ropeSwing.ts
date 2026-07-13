// Física do balanço da corda (F02): oscilação senoidal amortecida. Ao arrastar/soltar um nó, o
// TypedEdge injeta "energia" (proporcional ao movimento) e chama isto a cada frame com o tempo
// decorrido; o retorno é o deslocamento lateral (px) do ponto de controle da corda, que oscila e
// decai a zero. Função pura e determinística (sem Date.now aqui — o tempo vem de fora), então é
// testável e não quebra o replay de workflows.

// Frequência angular (rad/ms) e constante de amortecimento — ajustadas para ~2 oscilações visíveis
// que somem em pouco menos de 1s. SWING_SETTLE_MS é o horizonte após o qual tratamos como parado.
const OMEGA = 0.018
const DAMPING = 0.004
export const SWING_SETTLE_MS = 900

export function dampedSwing(elapsedMs: number, energy: number): number {
  if (energy === 0 || elapsedMs >= SWING_SETTLE_MS) return 0
  return energy * Math.exp(-DAMPING * elapsedMs) * Math.sin(OMEGA * elapsedMs)
}
