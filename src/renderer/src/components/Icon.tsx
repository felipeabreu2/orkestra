import { MotionIcon, type AnimationType, type TriggerType } from 'motion-icons-react'
import type { JSX } from 'react'

// Wrapper único de ícones animados do app: isola a dependência `motion-icons-react` atrás de uma
// API mínima e estável. TODO ícone da UI passa por aqui — se um dia trocarmos de biblioteca de
// ícones, só este arquivo muda (a lib é nova/pouco adotada, então essa camada é proposital). A
// própria lib respeita `prefers-reduced-motion`. `name` é um ícone do Lucide em PascalCase
// (ex.: "Terminal", "Folder"); `animation`/`trigger` seguem os presets da lib. Sem `color`, o
// ícone herda `currentColor` do elemento pai (essencial para o tema claro/escuro).
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
      className={className}
    />
  )
}
