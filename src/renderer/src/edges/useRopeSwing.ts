import { useEffect, useRef, useState } from 'react'
import { dampedSwing, SWING_SETTLE_MS } from './ropeSwing'

// Cola entre a mudança de coordenadas (arraste do nó) e a física pura do balanço. Quando os
// extremos da corda mudam, injeta energia proporcional ao movimento e roda um rAF que aplica
// dampedSwing até acomodar (SWING_SETTLE_MS), então PARA — nunca um rAF perpétuo. Só as edges do
// nó que moveu recebem novas coords, então só elas animam. performance.now() (não Date.now) é a
// base de tempo; é permitido no renderer e não entra em nenhuma lógica persistida.
export function useRopeSwing(sx: number, sy: number, tx: number, ty: number): number {
  const [swing, setSwing] = useState(0)
  const last = useRef({ sx, sy, tx, ty })
  const anim = useRef<{ energy: number; start: number } | null>(null)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const prev = last.current
    const moved = Math.hypot(tx - prev.tx, ty - prev.ty) + Math.hypot(sx - prev.sx, sy - prev.sy)
    last.current = { sx, sy, tx, ty }
    if (moved < 0.5) return

    // Energia proporcional ao movimento, com teto para não exagerar em saltos grandes (fitView).
    const energy = Math.min(48, moved * 0.4)
    anim.current = { energy, start: performance.now() }

    const tick = (): void => {
      const a = anim.current
      if (!a) return
      const elapsed = performance.now() - a.start
      const offset = dampedSwing(elapsed, a.energy)
      setSwing(offset)
      if (elapsed >= SWING_SETTLE_MS) {
        anim.current = null
        setSwing(0)
        raf.current = null
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    if (raf.current === null) raf.current = requestAnimationFrame(tick)
  }, [sx, sy, tx, ty])

  useEffect(() => {
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    }
  }, [])

  return swing
}
