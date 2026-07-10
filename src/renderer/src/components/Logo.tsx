import { useId } from 'react'

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
 * Gradient ids are namespaced with `useId()` because SVG gradient ids are global to the
 * document — without this, two <Logo/> instances rendered at once (e.g. a future about panel
 * alongside the canvas wordmark) would collide.
 */
export function Logo({ size = 20 }: LogoProps): JSX.Element {
  const uid = useId()
  const bgId = `ork-logo-bg-${uid}`
  const glowId = `ork-logo-glow-${uid}`
  const hubId = `ork-logo-hub-${uid}`

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={bgId} x1={0} y1={0} x2={512} y2={512} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor="#161329" />
          <stop offset={1} stopColor="#08070d" />
        </linearGradient>
        <radialGradient id={glowId} cx={256} cy={256} r={150} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor="#7c6cff" stopOpacity={0.55} />
          <stop offset={1} stopColor="#7c6cff" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={hubId} x1={228} y1={228} x2={284} y2={284} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor="#ffffff" />
          <stop offset={1} stopColor="#cfc6ff" />
        </linearGradient>
      </defs>

      {/* backdrop: dark rounded square, app-icon-ready */}
      <rect width={512} height={512} rx={112} fill={`url(#${bgId})`} />

      {/* soft glow behind the hub */}
      <circle cx={256} cy={256} r={150} fill={`url(#${glowId})`} />

      {/* orbit ring passing through the five agent nodes (the abstract "O") */}
      <circle cx={256} cy={256} r={130} fill="none" stroke="#7c6cff" strokeOpacity={0.38} strokeWidth={6} />

      {/* spokes: hub conducting each agent node */}
      <g stroke="#9d8fff" strokeOpacity={0.55} strokeWidth={8} strokeLinecap="round">
        <line x1={256} y1={256} x2={256} y2={126} />
        <line x1={256} y1={256} x2={380} y2={216} />
        <line x1={256} y1={256} x2={332} y2={361} />
        <line x1={256} y1={256} x2={180} y2={361} />
        <line x1={256} y1={256} x2={132} y2={216} />
      </g>

      {/* five agent nodes */}
      <g fill="#b3a8ff">
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
