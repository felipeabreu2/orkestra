import { MotionIcon, type AnimationType, type TriggerType } from 'motion-icons-react'
import type { JSX } from 'react'
import './Icon.css'

// Wrapper único de ícones animados do app: isola a dependência `motion-icons-react` atrás de uma
// API mínima e estável. TODO ícone da UI passa por aqui — se um dia trocarmos de biblioteca de
// ícones, só este arquivo muda (a lib é nova/pouco adotada, então essa camada é proposital). A
// própria lib respeita `prefers-reduced-motion`. `name` é um ícone do Lucide em PascalCase
// (ex.: "Terminal", "Folder"); `animation`/`trigger` seguem os presets da lib. Sem `color`, o
// ícone herda `currentColor` do elemento pai (essencial para o tema claro/escuro).
//
// `ork-icon` (reformulação 2026-07-14, DesignCode UI §4 "Ícones") é aplicada SEMPRE, mesmo sem
// className do consumidor: normaliza o traço (Icon.css) e é o gancho estável para as classes de
// micro-motion CSS-puras (`ork-icon--rotate/--slide/--spin-hover`, ver Icon.css) — a lib expõe
// hover só como estado JS toggling uma classe condicional, então uma classe sempre-presente é o
// único jeito confiável de mirar `.ork-icon svg` em qualquer estado.
export function Icon({
  name,
  size = 17,
  animation = 'nudge',
  trigger = 'hover',
  color,
  className
}: {
  name: string
  size?: number
  animation?: AnimationType
  trigger?: TriggerType
  color?: string
  className?: string
}): JSX.Element {
  return (
    <MotionIcon
      name={name}
      size={size}
      animation={animation}
      trigger={trigger}
      color={color}
      className={className ? `ork-icon ${className}` : 'ork-icon'}
    />
  )
}
