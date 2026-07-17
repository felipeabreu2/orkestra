import { describe, it, expect, vi } from 'vitest'
import { registerSshIpc } from './registerSshIpc'
import { REMOTE_DROP_DIR } from '../../shared/scp'

// Mesmo padrão de fake do registerPtyIpc.test.ts — mapa de handlers registrados via .handle().
function fakeIpcMain() {
  const handlers = new Map<string, (...a: any[]) => any>()
  return {
    handle: (ch: string, fn: (...a: any[]) => any) => handlers.set(ch, fn),
    on: () => {},
    handlers
  }
}

describe('registerSshIpc', () => {
  it('ssh:scpDrop com host válido roda mkdir (ssh) e scp com args de array e devolve o caminho remoto', async () => {
    const runProcess = vi.fn(async () => ({ code: 0 }))
    const ipc = fakeIpcMain()
    registerSshIpc(ipc as any, runProcess)

    const remotePath = await ipc.handlers.get('ssh:scpDrop')!({}, {
      host: 'user@h',
      localPath: '/tmp/a.png'
    })

    // ordem: primeiro garante o diretório remoto (ssh mkdir -p), depois envia (scp) — sem shell.
    expect(runProcess).toHaveBeenNthCalledWith(1, 'ssh', ['user@h', 'mkdir', '-p', REMOTE_DROP_DIR])
    // `--` encerra o getopt do scp antes dos posicionais (nenhum caminho vira opção).
    expect(runProcess).toHaveBeenNthCalledWith(2, 'scp', [
      '--',
      '/tmp/a.png',
      `user@h:${REMOTE_DROP_DIR}/a.png`
    ])
    expect(remotePath).toBe(`${REMOTE_DROP_DIR}/a.png`)
  })

  it('ssh:scpDrop com host inválido rejeita e não roda nada (barrado por buildScpDrop/isValidSshHost)', async () => {
    const runProcess = vi.fn(async () => ({ code: 0 }))
    const ipc = fakeIpcMain()
    registerSshIpc(ipc as any, runProcess)

    await expect(
      ipc.handlers.get('ssh:scpDrop')!({}, { host: 'a; rm -rf /', localPath: '/tmp/a' })
    ).rejects.toThrow()
    expect(runProcess).not.toHaveBeenCalled()
  })

  it('ssh:scpDrop sanitiza o basename hostil no destino remoto', async () => {
    const runProcess = vi.fn(async () => ({ code: 0 }))
    const ipc = fakeIpcMain()
    registerSshIpc(ipc as any, runProcess)

    const remotePath = await ipc.handlers.get('ssh:scpDrop')!({}, {
      host: 'user@h',
      localPath: '/tmp/foo;$(rm -rf ~).png'
    })

    expect(remotePath).toBe(`${REMOTE_DROP_DIR}/foo___rm_-rf___.png`)
    expect(runProcess).toHaveBeenNthCalledWith(2, 'scp', [
      '--',
      '/tmp/foo;$(rm -rf ~).png',
      `user@h:${REMOTE_DROP_DIR}/foo___rm_-rf___.png`
    ])
  })

  // O main NÃO confia no payload do renderer (mesma premissa do registerPtyIpc): um localPath
  // hostil é barrado por buildScpDrop antes de qualquer spawn — nem o `ssh mkdir` roda.
  it('ssh:scpDrop com localPath de injeção de opção rejeita e não roda nada', async () => {
    const runProcess = vi.fn(async () => ({ code: 0 }))
    const ipc = fakeIpcMain()
    registerSshIpc(ipc as any, runProcess)

    await expect(
      ipc.handlers.get('ssh:scpDrop')!({}, {
        host: 'user@h',
        localPath: '-oProxyCommand=touch /tmp/pwned'
      })
    ).rejects.toThrow('Caminho local inválido')
    expect(runProcess).not.toHaveBeenCalled()
  })

  it('ssh:scpDrop propaga falha do processo (code != 0) como rejeição', async () => {
    // o mkdir passa, o scp falha (ex.: sem chave/agent, sem TTY) — a invoke rejeita.
    const runProcess = vi
      .fn()
      .mockResolvedValueOnce({ code: 0 })
      .mockRejectedValueOnce(new Error('scp saiu com código 1'))
    const ipc = fakeIpcMain()
    registerSshIpc(ipc as any, runProcess)

    await expect(
      ipc.handlers.get('ssh:scpDrop')!({}, { host: 'user@h', localPath: '/tmp/a.png' })
    ).rejects.toThrow()
  })
})
