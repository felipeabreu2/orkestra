import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { presetById } from '../../../shared/presets'
import { registerTerminalPty, unregisterTerminalPty } from '../terminal/terminalRegistry'
import { pathsToTerminalInput } from '../terminal/dropPaths'
import { xtermThemeFromTokens } from '../terminal/xtermTheme'
import { useCanvasStore } from '../store/canvasStore'

export function TerminalNode({
  nodeId,
  preset,
  sshHost
}: {
  nodeId?: string
  preset?: string
  // Fase 27 (Task 3): quando presente, este terminal spawna `ssh <sshHost>` em vez de um shell
  // local (ver o branch de spawnOpts abaixo). Passado como prop por TerminalFlowNode, mesmo
  // padrão de preset — não lido diretamente de data aqui.
  sshHost?: string
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Tema do xterm derivado dos tokens de design em runtime: o xterm não conhece nossas custom
    // properties, então `xtermThemeFromTokens` (src/renderer/src/terminal/xtermTheme.ts) lê
    // --term-bg/--term-fg/--accent/--accent-weak/--ok/--warn/--err/--paper-*/--text-* do <html> e
    // monta o objeto `theme` (sem isso ele cai no preto/branco padrão, que ignora o tema do app).
    // Fonte e tamanho também vêm dos tokens (--font-mono/--fs-base), nunca hex/px cru.
    const rootCss = getComputedStyle(document.documentElement)
    const fontFamily =
      rootCss.getPropertyValue('--font-mono').trim() ||
      'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    const fontSize = parseInt(rootCss.getPropertyValue('--fs-base'), 10) || 13

    const term = new XTerm({
      cursorBlink: true,
      fontSize,
      fontFamily,
      theme: xtermThemeFromTokens()
    })

    // Reaplica o tema quando o app troca claro↔escuro (flip de data-theme no <html>): recalcula os
    // tokens e atualiza term.options.theme SEM recriar o terminal — o pty, o scrollback e o foco
    // são preservados. É a única forma de o xterm acompanhar o tema, já que ele fotografou as cores
    // no construtor. attributeFilter garante que só o data-theme dispara o recompute.
    const themeObserver = new MutationObserver(() => {
      term.options.theme = xtermThemeFromTokens()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    // NÃO usamos @xterm/addon-webgl: ele crashava de forma assíncrona no render loop em GPUs
    // Intel antigas (Cannot read properties of undefined 'dimensions'/'_isDisposed' + "task queue
    // exceeded deadline"), e o try/catch só pega falha de INICIALIZAÇÃO, não esse crash tardio —
    // que, sem Error Boundary, derrubava o React inteiro (tela preta). O renderer DOM padrão do
    // xterm é estável e rápido o bastante para o volume de output de um terminal de agente.
    fit.fit()

    let disposeData = (): void => {}
    let ptyId = ''
    let disposed = false

    // Sinal "generating" (border-beam, Lote D): HEURÍSTICA debounced — deliberadamente não é um
    // sinal real de "o agente está pensando/gerando" (não existe hoje; o AgentBus só expõe
    // onAttention, que é o OPOSTO: idle-APÓS-output). Cada chunk que o pty emite marca
    // generating:true no canvasStore (Set efêmero, mesmo padrão de `attention` — nunca
    // persistido/undo, ver canvasStore.ts); sem chunk novo por GENERATING_IDLE_MS, volta a false.
    // Trade-off aceito e documentado: um terminal tagarela sem agente nenhum (ex.: `tail -f` de
    // log, `watch`) também acende o beam — não há como distinguir "agente produzindo resposta" de
    // "processo qualquer imprimindo" sem parsear o conteúdo (spinner do wrapper claude) ou expor
    // um sinal real via IPC, nenhum dos dois existe ainda (ver TODO em TerminalFlowNode.tsx).
    const GENERATING_IDLE_MS = 500
    let generatingTimer: ReturnType<typeof setTimeout> | null = null
    const markGenerating = (): void => {
      if (!nodeId) return
      useCanvasStore.getState().setGenerating(nodeId, true)
      if (generatingTimer) clearTimeout(generatingTimer)
      generatingTimer = setTimeout(() => {
        generatingTimer = null
        useCanvasStore.getState().setGenerating(nodeId, false)
      }, GENERATING_IDLE_MS)
    }

    // Auto-início do CLI do agente: um preset de agente (claude/codex/gemini) SEMPRE inicia seu CLI
    // ao montar — inclusive terminais HIDRATADOS ao reabrir o app (o usuário quer o agente "sempre
    // lá", já com o onboarding injetado pelo wrapper `claude`). Digitar o comando do preset só abre
    // o CLI, não manda prompt, então não gasta tokens. preset 'shell'/ausente → command null → sem
    // auto-início. NB: só vale para pty NOVO — na troca de projeto o pty SOBREVIVE e é re-attachado
    // (ver `start`/pty.attach acima), então o agente não reinicia à toa ao alternar projetos.
    const initialCommand = preset ? (presetById(preset)?.command ?? undefined) : undefined

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
      disposeData = window.orkestra.pty.onData(id, (data) => {
        term.write(data)
        markGenerating()
      })
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
      themeObserver.disconnect()
      ro.disconnect()
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('drop', onDrop)
      disposeData()
      if (generatingTimer) clearTimeout(generatingTimer)
      if (nodeId) useCanvasStore.getState().setGenerating(nodeId, false)
      if (nodeId) unregisterTerminalPty(nodeId)
      // Fase 31: NÃO matar o pty aqui. Ao trocar de projeto, o TerminalNode desmonta mas o
      // processo deve continuar rodando — ele é reconectado (attach) quando o nó reaparece. O
      // pty só morre ao REMOVER o terminal (× -> pty.killForNode) ou ao fechar o app (killAll).
      term.dispose()
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
