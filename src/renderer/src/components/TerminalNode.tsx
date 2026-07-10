import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { presetById } from '../../../shared/presets'

export function TerminalNode({
  nodeId,
  preset,
  autostart,
  floorId
}: {
  nodeId?: string
  preset?: string
  autostart?: boolean
  floorId?: string
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

    // floorId (Fase 8) é lido só nesta primeira execução do efeito (deps: [] — spawna uma vez
    // por montagem do nó). O main resolve floorId -> worktreePath e usa como cwd do pty. Como
    // o cwd de um processo já em execução não pode mudar, atribuir/trocar o floor de um
    // terminal JÁ rodando (no seletor do header) não afeta esta sessão de shell — só o próximo
    // terminal criado com aquele floor. MVP intencional (documentado no plano da Fase 8).
    window.orkestra.pty
      .spawn({ cols: term.cols, rows: term.rows, nodeId, initialCommand, floorId })
      .then((id) => {
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
