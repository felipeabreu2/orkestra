import type { IpcMain } from 'electron'
import { spawn } from 'node:child_process'
import { buildScpDrop, REMOTE_DROP_DIR } from '../../shared/scp'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// FORA DO MVP (registro, NÃO implementar aqui): túnel reverso / "workspace SSH" completo.
// O salto do Maestri — `ssh -R` (bind em 127.0.0.1:7433) + script helper instalado no remoto para
// o `orq`/agente remoto falar de volta com o servidor local — está DELIBERADAMENTE fora desta onda
// (ver docs/planejamento/ssh-remoto.md §"Fora do MVP"). Motivos: (1) abre um boundary de rede
// persistente inteiro (bind/ciclo de vida/reabertura/auth do callback); (2) traria agentes de OUTRA
// máquina para o barramento do `orq` ANTES de o escopo de projeto estar fechado (cf. memória
// incidente-corrupcao-cross-project) — risco amplificado pela rede; (3) instalar helper no host
// alheio; (4) ciclo de vida complexo (esforço L). Vale um plano dedicado depois de (a) escopo de
// projeto do orq auditado e (b) T1–T7 no ar. Este handler cobre só o degrau S/M: scp de arquivo.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// Runner injetável: roda um binário (file) com args separados (ARRAY, nunca string de shell) e
// resolve no fim / rejeita em código != 0 ou erro de spawn. Injetável para o teste substituir por
// um vi.fn() e NUNCA spawnar scp/ssh de verdade. Mesma disciplina do transporte de PTY: sem
// `shell: true`, file + args separados — a única defesa contra injeção é não passar por shell.
export type RunProcess = (file: string, args: string[]) => Promise<{ code: number }>

const defaultRunProcess: RunProcess = (file, args) =>
  new Promise((resolve, reject) => {
    // stdio ignorado: sem TTY. Se a auth exigir senha interativa (chave não está no agent), o
    // processo falha aqui (sem prompt possível) e o drop é rejeitado — o TerminalNode mostra o
    // erro no xterm. O caminho feliz pressupõe chave/agent, o mesmo ~/.ssh do transporte.
    const child = spawn(file, args, { stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ code })
      else reject(new Error(`${file} saiu com código ${code}`))
    })
  })

/**
 * Registra o handler `ssh:scpDrop` (Onda 2, Trilha B): recebe { host, localPath } do renderer,
 * constrói os argumentos via buildScpDrop (que revalida o host com isValidSshHost e sanitiza o
 * basename), roda `ssh mkdir -p <dir>` e depois `scp <local> <host:remoto>` — ambos SEM shell —
 * e devolve o caminho REMOTO absoluto. host inválido lança dentro de buildScpDrop e vira Promise
 * rejeitada (mesmo padrão de pty:spawn); falha do scp propaga como rejeição da invoke.
 *
 * Reusa ~/.ssh do SO (chaves/agent/config) exatamente como o `ssh` do transporte — sem gestão de
 * chaves própria. O diretório remoto é a constante REMOTE_DROP_DIR (nunca input do usuário).
 */
export function registerSshIpc(ipcMain: IpcMain, runProcess: RunProcess = defaultRunProcess): void {
  ipcMain.handle('ssh:scpDrop', async (_e, payload: { host: string; localPath: string }) => {
    const { host, localPath } = payload ?? { host: '', localPath: '' }
    // buildScpDrop lança (host inválido / basename inválido) ANTES de qualquer runProcess — o
    // throw síncrono vira rejeição da Promise (o handler é async).
    const { mkdirArgs, scpArgs, remotePath } = buildScpDrop({ localPath, host, remoteDir: REMOTE_DROP_DIR })
    await runProcess('ssh', mkdirArgs)
    await runProcess('scp', scpArgs)
    return remotePath
  })
}
