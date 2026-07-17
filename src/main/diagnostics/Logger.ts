import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Resiliência · T2 — logger com arquivo ROTATIVO, dependência zero (sem electron-log: node:fs puro,
// injetável e testável — a disciplina do projeto). Até aqui a observabilidade do main vivia só em
// console.error, que morre com o processo; o diagnóstico (T3/T4) precisa das últimas linhas de uma
// sessão real.
//
// Duas camadas, com papéis distintos:
//  · RING em memória (MAX_LINES): o que o export de diagnóstico coleta (recent()). Sempre funciona,
//    mesmo com o disco falhando.
//  · ARQUIVO app.log em `<baseDir>` (esperado: userData/logs — SUBPASTA própria; nunca varrer o
//    userData, que é compartilhado com o Cache do Chromium — lição do cleanupTmp/INT-7), com
//    rotação por tamanho: passou de maxBytes → app.log vira app.log.1 (1 geração) e recomeça.
//
// NUNCA lança (princípio do writeJson/backup do ProjectManager): falha de I/O não pode derrubar o
// boot nem o caminho que só queria logar. Falha degrada para "só ring".
const MAX_LINES = 500
const DEFAULT_MAX_BYTES = 512 * 1024

export class Logger {
  private lines: string[] = []
  private readonly file: string
  private readonly maxBytes: number
  private dirReady = false

  constructor(
    private readonly baseDir: string,
    opts: { maxBytes?: number } = {}
  ) {
    this.file = join(baseDir, 'app.log')
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  }

  path(): string {
    return this.file
  }

  write(msg: string): void {
    const line = `${new Date().toISOString()} ${msg}`
    this.lines.push(line)
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES)
    try {
      if (!this.dirReady) {
        mkdirSync(this.baseDir, { recursive: true })
        this.dirReady = true
      }
      try {
        if (statSync(this.file).size > this.maxBytes) {
          renameSync(this.file, `${this.file}.1`)
        }
      } catch {
        /* arquivo ainda não existe — nada a rotacionar */
      }
      appendFileSync(this.file, line + '\n')
    } catch {
      /* disco falhou — o ring em memória segue valendo; nunca propaga */
    }
  }

  // Últimas `n` linhas do ring (default: tudo que o ring guarda, já capado em MAX_LINES).
  recent(n = MAX_LINES): string[] {
    return this.lines.slice(-n)
  }
}
