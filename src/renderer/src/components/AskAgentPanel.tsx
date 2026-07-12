import { useEffect, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { getTerminalPty } from '../terminal/terminalRegistry'
import { stripAnsi } from '../terminal/ansi'

const ASK_TIMEOUT_MS = 60000

export function AskAgentPanel({
  nodeId,
  label,
  onClose
}: {
  nodeId: string
  label: string
  onClose: () => void
}): JSX.Element {
  const [phase, setPhase] = useState<'input' | 'preview'>('input')
  const [prompt, setPrompt] = useState('')
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState<'waiting' | 'done' | 'timeout' | 'error'>('waiting')
  const nodes = useCanvasStore((s) => s.nodes)
  const { setCenter } = useReactFlow()

  const send = (): void => {
    const ptyId = getTerminalPty(nodeId)
    if (!ptyId) {
      setStatus('error')
      setPhase('preview')
      return
    }
    window.orkestra.pty.write(ptyId, prompt + '\n')
    setStatus('waiting')
    setPhase('preview')
  }

  useEffect(() => {
    if (phase !== 'preview') return
    const ptyId = getTerminalPty(nodeId)
    if (!ptyId) return
    const offData = window.orkestra.pty.onData(ptyId, (chunk) => setOutput((o) => (o + chunk).slice(-8000)))
    const offAtt = window.orkestra.onAgentAttention((nid) => {
      if (nid === nodeId) setStatus((s) => (s === 'waiting' ? 'done' : s))
    })
    const timer = setTimeout(() => setStatus((s) => (s === 'waiting' ? 'timeout' : s)), ASK_TIMEOUT_MS)
    return () => {
      offData()
      offAtt()
      clearTimeout(timer)
    }
  }, [phase, nodeId])

  const focusTerminal = (): void => {
    const n = nodes.find((x) => x.id === nodeId)
    if (n) setCenter(n.position.x + (n.width ?? 200) / 2, n.position.y + (n.height ?? 120) / 2, { zoom: 1.2, duration: 300 })
    onClose()
  }

  if (phase === 'input') {
    return (
      <div className="ork-ask">
        <div className="ork-ask-title">Perguntar ao agente: {label}</div>
        <input
          className="ork-palette-input"
          autoFocus
          value={prompt}
          placeholder="Digite a pergunta e pressione Enter"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && prompt.trim()) {
              e.preventDefault()
              send()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
      </div>
    )
  }

  const statusText =
    status === 'waiting'
      ? 'aguardando resposta…'
      : status === 'done'
        ? 'concluído'
        : status === 'timeout'
          ? 'sem resposta (tempo esgotado) — veja o terminal'
          : 'este terminal ainda não tem um processo ativo'

  return (
    <div className="ork-ask">
      <div className="ork-ask-title">
        {label} — {statusText}
      </div>
      {status !== 'error' && <pre className="nowheel ork-ask-output">{stripAnsi(output) || '…'}</pre>}
      <div className="ork-ask-actions">
        <button className="ork-ask-btn" onClick={focusTerminal}>
          Ir ao terminal
        </button>
        <button className="ork-ask-btn" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  )
}
