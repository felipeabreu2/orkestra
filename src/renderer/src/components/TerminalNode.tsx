import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { presetById } from '../../../shared/presets'

export function TerminalNode({
  nodeId,
  preset,
  autostart
}: {
  nodeId?: string
  preset?: string
  autostart?: boolean
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace'
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()

    let disposeData = (): void => {}
    let ptyId = ''
    let disposed = false

    // Auto-run só na criação: autostart é um flag efêmero (nunca persistido, ver canvasStore)
    // presente apenas em nós recém-criados nesta sessão. Nós hidratados de um snapshot salvo
    // não o têm, então montam um shell puro (sem auto-digitar o comando do preset) — evita
    // re-rodar o agente e queimar tokens a cada reload do app (Fase 7 Task 2).
    // preset 'shell'/ausente → command null/undefined → initialCommand undefined (sem auto-run).
    const initialCommand = autostart && preset ? (presetById(preset)?.command ?? undefined) : undefined

    window.orkestra.pty.spawn({ cols: term.cols, rows: term.rows, nodeId, initialCommand }).then((id) => {
      if (disposed) {
        window.orkestra.pty.kill(id)
        return
      }
      ptyId = id
      disposeData = window.orkestra.pty.onData(id, (data) => term.write(data))
      term.onData((data) => window.orkestra.pty.write(id, data))
      term.onResize(({ cols, rows }) => window.orkestra.pty.resize(id, cols, rows))
    })
    .catch((err) => {
      term.write(`\r\n[spawn failed] ${String(err)}\r\n`)
    })

    const ro = new ResizeObserver(() => fit.fit())
    ro.observe(el)

    return () => {
      disposed = true
      ro.disconnect()
      disposeData()
      if (ptyId) window.orkestra.pty.kill(ptyId)
      term.dispose()
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
