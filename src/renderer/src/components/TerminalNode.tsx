import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { presetById } from '../../../shared/presets'
import { registerTerminalPty, unregisterTerminalPty } from '../terminal/terminalRegistry'
import { pathsToTerminalInput, readDroppedPaths, ORKESTRA_PATH_MIME } from '../terminal/dropPaths'
import { xtermThemeFromTokens } from '../terminal/xtermTheme'
import { screenIsGenerating } from '../terminal/generatingSignal'
import { useCanvasStore } from '../store/canvasStore'

// Throttle da varredura de conteúdo (ver bloco "Sinal generating" abaixo): cadência fixa, não
// debounce — durante streaming contínuo (Claude Code TUI repintando a cada poucos ms) um debounce
// clássico (reagenda a cada chunk) NUNCA chegaria a disparar.
const GENERATING_SCAN_THROTTLE_MS = 150

export function TerminalNode({
  nodeId,
  preset,
  role,
  sshHost
}: {
  nodeId?: string
  preset?: string
  // Papel do agente (Dev/Revisor/...): propagado ao main p/ injetar a instrução de arranque no
  // cwd do pty (CLAUDE.md/AGENTS.md; ver registerPtyIpc). Vazio/ausente = nenhuma injeção.
  role?: string
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

    // Sinal "generating" (border-beam, Lote D) — tentativa 3 (2026-07-15): as DUAS heurísticas de
    // OCIOSIDADE anteriores (timer fixo de 500ms aqui mesmo; depois o watcher `busy` do AgentBus
    // com idleMs) ficavam PRESAS ligadas porque a TUI do Claude Code/Ink emite saída mesmo ociosa
    // (repaints da barra de status, cursor piscando) em intervalos curtos — "silêncio" no stream
    // do pty nunca acontece de verdade. Esta versão abandona silêncio como sinal e detecta por
    // CONTEÚDO da tela: `screenIsGenerating` (src/renderer/src/terminal/generatingSignal.ts) casa
    // a marca "esc to interrupt" — presente na linha de status do Claude Code SÓ enquanto ele está
    // gerando — contra as linhas VISÍVEIS do buffer do xterm (o estado ATUAL da tela, ao contrário
    // do stream do pty, que é append-only e nunca "desmostra" a marca quando ela some). Varredura
    // throttled (não debounce) a cada chunk de dados via `scheduleGeneratingScan` abaixo, chamada
    // dentro do callback de `term.write` (garante que o buffer já reflete o chunk recém-escrito
    // antes de ler `term.buffer.active`). O único knob a reajustar se uma versão futura do Claude
    // Code trocar o texto do indicador é WORKING_MARKER em generatingSignal.ts.
    const scanGenerating = (): void => {
      if (disposed || !nodeId) return
      const buf = term.buffer.active
      const lines: string[] = []
      for (let y = Math.max(0, buf.length - term.rows); y < buf.length; y++) {
        const line = buf.getLine(y)
        if (line) lines.push(line.translateToString(true))
      }
      useCanvasStore.getState().setGenerating(nodeId, screenIsGenerating(lines))
    }
    let scanThrottleTimer: ReturnType<typeof setTimeout> | null = null
    let scanPending = false
    const scheduleGeneratingScan = (): void => {
      if (!nodeId) return
      if (scanThrottleTimer) {
        scanPending = true
        return
      }
      scanGenerating()
      scanThrottleTimer = setTimeout(() => {
        scanThrottleTimer = null
        if (scanPending) {
          scanPending = false
          scanGenerating()
        }
      }, GENERATING_SCAN_THROTTLE_MS)
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
      : { cols: term.cols, rows: term.rows, nodeId, initialCommand, preset, role }

    // Liga este xterm a um pty (recém-criado OU reconectado): saída do pty -> xterm, teclado ->
    // pty, resize -> pty, e registra nodeId->ptyId no registry do renderer. Idêntico nos dois
    // casos. O resize inicial sincroniza o pty com o tamanho atual do xterm (importante no
    // re-attach, em que o xterm é novo e pode ter tamanho diferente do que o pty tinha).
    const connect = (id: string): void => {
      ptyId = id
      if (nodeId) registerTerminalPty(nodeId, id)
      disposeData = window.orkestra.pty.onData(id, (data) => {
        // callback (não `scheduleGeneratingScan()` solto após o write): garante que o buffer do
        // xterm já processou ESTE chunk antes de varrer — term.write pode adiar o parsing de
        // chunks grandes para não travar a UI, e ler o buffer cedo demais arriscaria varrer o
        // estado ANTERIOR ao chunk que acabou de chegar.
        term.write(data, scheduleGeneratingScan)
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
        // Varredura pós-attach (mesmo raciocínio do callback em connect() acima): o buffer
        // restaurado pode já conter "esc to interrupt" se o pty ficou gerando enquanto este nó
        // estava desmontado (fora da viewport ou troca de projeto) — sem isto, o beam só
        // acenderia no PRÓXIMO chunk que chegasse depois do re-attach.
        if (attached.buffer) term.write(attached.buffer, scheduleGeneratingScan)
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

    // Arrastar arquivos para o terminal insere seus caminhos, como num terminal nativo. Duas
    // origens: (a) arquivos do Finder (dataTransfer.files, resolvidos via getPathForFile do
    // preload) e (b) uma linha de arquivo da própria árvore do canvas (FileTreeNode marca o
    // caminho no MIME ORKESTRA_PATH_MIME). dragover.preventDefault habilita o drop E impede o
    // Chromium de navegar para o arquivo; readDroppedPaths unifica as duas origens e
    // pathsToTerminalInput aspa cada caminho (seguro p/ espaços/unicode) antes de escrever no pty.
    const onDragOver = (e: DragEvent): void => {
      const types = e.dataTransfer?.types
      if (types && (types.includes('Files') || types.includes(ORKESTRA_PATH_MIME))) {
        e.preventDefault()
        e.dataTransfer!.dropEffect = 'copy'
      }
    }
    const onDrop = (e: DragEvent): void => {
      if (!e.dataTransfer) return
      const hasInternal = e.dataTransfer.types.includes(ORKESTRA_PATH_MIME)
      if (!hasInternal && e.dataTransfer.files.length === 0) return
      e.preventDefault()
      if (!ptyId) return
      const paths = readDroppedPaths(e.dataTransfer, (f) => window.orkestra.getPathForFile(f))
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
      if (nodeId) unregisterTerminalPty(nodeId)
      // Fase 31: NÃO matar o pty aqui. Ao trocar de projeto, o TerminalNode desmonta mas o
      // processo deve continuar rodando — ele é reconectado (attach) quando o nó reaparece. O
      // pty só morre ao REMOVER o terminal (× -> pty.killForNode) ou ao fechar o app (killAll).
      // Sinal "generating" (tentativa 3): zera aqui SEMPRE, ao contrário da versão anterior
      // (que deliberadamente preservava o beam porque o sinal vinha do AgentBus, independente
      // deste componente). Agora a varredura é por CONTEÚDO do buffer deste xterm específico —
      // sem um xterm montado não há como saber se a marca ainda está na tela, então zerar é a
      // única opção segura (nunca preso ligado). Isto inclui o caso de suspensão de visibilidade
      // (Otimização Bloco 4: o nó sai da viewport, o pty segue vivo em segundo plano): o beam
      // apaga enquanto suspenso e a varredura pós-attach (ver `start` acima) o reacende
      // corretamente ao reconectar, se a marca ainda estiver no buffer restaurado.
      if (scanThrottleTimer) clearTimeout(scanThrottleTimer)
      if (nodeId) useCanvasStore.getState().setGenerating(nodeId, false)
      term.dispose()
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
