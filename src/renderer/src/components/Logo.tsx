import { useId, type CSSProperties } from 'react'

interface LogoProps {
  size?: number
}

/**
 * Orkestra mark (Fase 13), inlined as SVG. This mirrors `resources/icon.svg` — see that file's
 * comments for the design concept (a bright "hub" node conducting five dimmer "agent" nodes on
 * a ring) — but hand-authored as JSX instead of loaded from disk: the renderer's CSP blocks
 * remote/file resource loads, so an `<img src="...">` or `fetch()` of the .svg is not an option,
 * and inlining is also what lets the mark resize/recolor like any other bit of UI.
 *
 * Reformulação DesignCode UI (2026-07-14): a paleta violeta→magenta (`--brand-violet`/
 * `--brand-magenta`) foi REMOVIDA dos tokens — a voz da marca agora é o azul→índigo de
 * `--gradient-brand` (mesmo valor nos dois temas, por design: a identidade da marca não deve
 * variar com o tema, só a superfície ao redor dela varia). `--gradient-brand` é um valor CSS
 * `linear-gradient()`; SVG `fill` só aceita `<paint>` (cor sólida ou `url(#id)` para um
 * `<linearGradient>` interno) — um gradiente CSS não é um `<paint>` válido ali. Então o badge
 * deixou de ser um `<rect fill="url(#...)">` com stops manuais e passou a ser o PRÓPRIO `<svg>`
 * pintado via `style={{ background: 'var(--gradient-brand)' }}` (propriedade CSS de verdade, que
 * aceita gradientes) com `borderRadius`/`overflow:hidden` reproduzindo o `rx` do desenho original
 * — o ícone (glow/anel/raios/nós/hub) fica em `--accent-text` (branco, igual nos dois temas) por
 * cima, com opacidade variável para dar profundidade. Sem hex cru em lugar nenhum.
 *
 * Colors are applied via `style` (CSSOM), not presentation attributes: `var()` only resolves as a
 * CSS value — `fill="var(--x)"` written as an SVG attribute would be dropped.
 *
 * Gradient ids are namespaced with `useId()` because SVG gradient ids are global to the
 * document — without this, two <Logo/> instances rendered at once (e.g. a future about panel
 * alongside the canvas wordmark) would collide.
 */
export function Logo({ size = 20 }: LogoProps): JSX.Element {
  const uid = useId()
  const glowId = `ork-logo-glow-${uid}`
  const hubId = `ork-logo-hub-${uid}`

  // Ícone sobre o badge em gradiente: sempre --accent-text (branco, mesmo valor nos dois temas),
  // variando só a opacidade pra criar hierarquia (glow < raio < nó < hub).
  const iconColor = 'var(--accent-text)'

  const stop = (color: string): CSSProperties => ({ stopColor: color })

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden="true"
      // Badge: o próprio elemento raiz pintado com o gradiente de marca (azul→índigo), cantos
      // arredondados reproduzindo o rx=112/512 do desenho original (112/512 = 21.875%).
      style={{ background: 'var(--gradient-brand)', borderRadius: '21.875%', overflow: 'hidden' }}
    >
      <defs>
        <radialGradient id={glowId} cx={256} cy={256} r={150} gradientUnits="userSpaceOnUse">
          <stop offset={0} style={stop(iconColor)} stopOpacity={0.5} />
          <stop offset={0.5} style={stop(iconColor)} stopOpacity={0.24} />
          <stop offset={1} style={stop(iconColor)} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={hubId} x1={228} y1={228} x2={284} y2={284} gradientUnits="userSpaceOnUse">
          <stop offset={0} style={stop(iconColor)} stopOpacity={1} />
          <stop offset={1} style={stop(iconColor)} stopOpacity={0.55} />
        </linearGradient>
      </defs>

      {/* soft glow behind the hub — the only "profundidade luminosa" permitida */}
      <circle cx={256} cy={256} r={150} fill={`url(#${glowId})`} />

      {/* orbit ring passing through the five agent nodes (the abstract "O") */}
      <circle cx={256} cy={256} r={130} fill="none" style={{ stroke: iconColor }} strokeOpacity={0.38} strokeWidth={6} />

      {/* spokes: hub conducting each agent node */}
      <g style={{ stroke: iconColor }} strokeOpacity={0.55} strokeWidth={8} strokeLinecap="round">
        <line x1={256} y1={256} x2={256} y2={126} />
        <line x1={256} y1={256} x2={380} y2={216} />
        <line x1={256} y1={256} x2={332} y2={361} />
        <line x1={256} y1={256} x2={180} y2={361} />
        <line x1={256} y1={256} x2={132} y2={216} />
      </g>

      {/* five agent nodes */}
      <g style={{ fill: iconColor }} fillOpacity={0.85}>
        <circle cx={256} cy={126} r={22} />
        <circle cx={380} cy={216} r={22} />
        <circle cx={332} cy={361} r={22} />
        <circle cx={180} cy={361} r={22} />
        <circle cx={132} cy={216} r={22} />
      </g>

      {/* the hub: the conductor */}
      <circle cx={256} cy={256} r={34} fill={`url(#${hubId})`} />
    </svg>
  )
}
