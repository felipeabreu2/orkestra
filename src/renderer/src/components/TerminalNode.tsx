import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { presetById } from '../../../shared/presets'
import { registerTerminalPty, unregisterTerminalPty } from '../terminal/terminalRegistry'
import { pathsToTerminalInput } from '../terminal/dropPaths'

export function TerminalNode({
  nodeId,
  preset,
  autostart,
  sshHost
}: {
  nodeId?: string
  preset?: string
  autostart?: boolean
  // Fase 27 (Task 3): quando presente, este terminal spawna `ssh <sshHost>` em vez de um shell
  // local (ver o branch de spawnOpts abaixo). Passado como prop por TerminalFlowNode, mesmo
  // padrão de preset/autostart — não lido diretamente de data aqui.
  sshHost?: string
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

    // Fase 27 (Task 3): modo SSH bifurca aqui — sshHost presente manda { sshHost } e OMITE
    // initialCommand (o processo já É o `ssh <host>`, main mapeia p/ file:'ssh', args:[host];
    // ver registerPtyIpc/Task 2). Ausente, comportamento local de sempre (initialCommand do
    // preset, se houver). O `.then(...)` abaixo é idêntico nos dois casos — ptyId, registro no
    // terminalRegistry, ligação de dados/resize — o pty resultante é tratado igual pelo xterm
    // independente de ser um shell local ou uma sessão ssh.
    const spawnOpts = sshHost
      ? { cols: term.cols, rows: term.rows, nodeId, sshHost }
      : { cols: term.cols, rows: term.rows, nodeId, initialCommand }

    // Liga este xterm a um pty (recém-criado OU reconectado): saída do pty -> xterm, teclado ->
    // pty, resize -> pty, e registra nodeId->ptyId no registry do renderer. Idêntico nos dois
    // casos. O resize inicial sincroniza o pty com o tamanho atual do xterm (importante no
    // re-attach, em que o xterm é novo e pode ter tamanho diferente do que o pty tinha).
    const connect = (id: string): void => {
      ptyId = id
      if (nodeId) registerTerminalPty(nodeId, id)
      disposeData = window.orkestra.pty.onData(id, (data) => term.write(data))
      term.onData((data) => window.orkestra.pty.write(id, data))
      term.onResize(({ cols, rows }) => window.orkestra.pty.resize(id, cols, rows))
      window.orkestra.pty.resize(id, term.cols, term.rows)
    }

    // Fase 31: se este nó JÁ tem um pty vivo (sobreviveu a uma troca de projeto/desmonte do
    // TerminalNode), reconecta a ele e restaura o scrollback — NÃO cria um shell novo, então o
    // que estava rodando (agente, build…) continua de onde parou. Só faz spawn na primeira vez.
    const start = async (): Promise<void> => {
      const attached = nodeId ? await window.orkestra.pty.attach(nodeId) : null
      if (disposed) return
      if (attached) {
        if (attached.buffer) term.write(attached.buffer)
        connect(attached.ptyId)
        return
      }
      const id = await window.orkestra.pty.spawn(spawnOpts)
      // desmontou durante o spawn: NÃO mata o pty (ele vive p/ re-attach quando o nó reaparecer).
      if (disposed) return
      connect(id)
    }
    void start().catch((err) => {
      term.write(`\r\n[spawn failed] ${String(err)}\r\n`)
    })

    const ro = new ResizeObserver(() => fit.fit())
    ro.observe(el)

    // Arrastar arquivos (do Finder) para o terminal insere seus caminhos, como num terminal
    // nativo. dragover.preventDefault habilita o drop E impede o Chromium de navegar para o
    // arquivo; getPathForFile (preload/webUtils) resolve o caminho absoluto; pathsToTerminalInput
    // aspa cada um (seguro p/ espaços/unicode) e escreve no pty deste terminal.
    const onDragOver = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }
    }
    const onDrop = (e: DragEvent): void => {
      if (!e.dataTransfer || e.dataTransfer.files.length === 0) return
      e.preventDefault()
      if (!ptyId) return
      const paths = Array.from(e.dataTransfer.files)
        .map((f) => window.orkestra.getPathForFile(f))
        .filter((p) => p.length > 0)
      const text = pathsToTerminalInput(paths)
      if (text) {
        window.orkestra.pty.write(ptyId, text)
        term.focus()
      }
    }
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('drop', onDrop)

    return () => {
      disposed = true
      ro.disconnect()
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('drop', onDrop)
      disposeData()
      if (nodeId) unregisterTerminalPty(nodeId)
      // Fase 31: NÃO matar o pty aqui. Ao trocar de projeto, o TerminalNode desmonta mas o
      // processo deve continuar rodando — ele é reconectado (attach) quando o nó reaparece. O
      // pty só morre ao REMOVER o terminal (× -> pty.killForNode) ou ao fechar o app (killAll).
      term.dispose()
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
