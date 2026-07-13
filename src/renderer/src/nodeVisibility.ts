import { useEffect, useRef, useState } from 'react'

// Otimização (Bloco 4): decisão pura de visibilidade com histerese, para o TerminalFlowNode suspender
// o corpo (xterm) quando o nó sai da viewport. Entrada = visível na hora; saída = agenda a suspensão
// após um atraso (cancelável se voltar antes), evitando pisca-pisca durante pan rápido. O hook abaixo
// é só a cola com o IntersectionObserver + o timer; esta função concentra a lógica testável.
export type VisAction = 'show' | 'arm-hide' | 'noop'

export function decideVisibility(intersecting: boolean, hidePending: boolean): VisAction {
  if (intersecting) return 'show' // visível imediato + cancela qualquer suspensão agendada
  if (!hidePending) return 'arm-hide' // saiu e nada agendado → arma a suspensão
  return 'noop' // saiu, mas a suspensão já está agendada
}

// Observa o elemento raiz do nó e reporta se ele deve renderizar o corpo pesado. Fallback seguro:
// sem IntersectionObserver (ex.: jsdom/preview), retorna sempre `true` (nunca suspende).
export function useNodeVisibility<T extends Element>(
  leaveDelayMs = 500,
  rootMargin = '200px'
): { ref: React.RefObject<T>; visible: boolean } {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const clearHide = (): void => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current)
        hideTimer.current = null
      }
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        const action = decideVisibility(entry.isIntersecting, hideTimer.current !== null)
        if (action === 'show') {
          clearHide()
          setVisible(true)
        } else if (action === 'arm-hide') {
          hideTimer.current = setTimeout(() => {
            hideTimer.current = null
            setVisible(false)
          }, leaveDelayMs)
        }
      },
      { rootMargin }
    )
    obs.observe(el)
    return () => {
      obs.disconnect()
      clearHide()
    }
  }, [leaveDelayMs, rootMargin])

  return { ref, visible }
}
