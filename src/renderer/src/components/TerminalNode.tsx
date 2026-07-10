import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function TerminalNode({ nodeId }: { nodeId?: string }): JSX.Element {
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

    window.orkestra.pty.spawn({ cols: term.cols, rows: term.rows, nodeId }).then((id) => {
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
