import { describe, it, expect, vi } from 'vitest'
import { registerDiagnosticsIpc } from './registerDiagnosticsIpc'
import type { DiagnosticInput } from './collectDiagnostics'

function fakeIpcMain() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  return {
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn),
    handlers
  }
}

const input = (): DiagnosticInput => ({
  appVersion: '1.0.0',
  versions: { node: '20' },
  platform: 'darwin',
  arch: 'arm64',
  memory: { rssBytes: 1, freeBytes: 2, totalBytes: 3 },
  env: { PATH: '/bin', ORKESTRA_TOKEN: 'sk-vaza-nao' },
  knownSecrets: ['sk-vaza-nao'],
  logs: ['[BOOT] ok com token=sk-vaza-nao'],
  projectCount: 1,
  nodeCounts: { terminal: 2 }
})

describe('registerDiagnosticsIpc', () => {
  it('diagnostics:export coleta, REDIGE, grava no path do saveDialog e devolve {ok, path}', async () => {
    const ipc = fakeIpcMain()
    const written: Record<string, string> = {}
    registerDiagnosticsIpc(ipc as never, {
      gatherInput: () => input(),
      saveDialog: vi.fn().mockResolvedValue('/tmp/diag.json'),
      writeFile: (path, content) => {
        written[path] = content
      }
    })
    const result = await ipc.handlers.get('diagnostics:export')!()
    expect(result).toEqual({ ok: true, path: '/tmp/diag.json' })
    expect(written['/tmp/diag.json']).toBeTruthy()
    // o JSON gravado é o relatório REDIGIDO — o segredo não está lá, o contexto sim
    expect(written['/tmp/diag.json']).not.toContain('sk-vaza-nao')
    expect(written['/tmp/diag.json']).toContain('[BOOT] ok')
    expect(written['/tmp/diag.json']).toContain('«redigido»')
  })

  it('saveDialog cancelado (null) → {ok:false} e NADA é escrito', async () => {
    const ipc = fakeIpcMain()
    const writeFile = vi.fn()
    registerDiagnosticsIpc(ipc as never, {
      gatherInput: () => input(),
      saveDialog: vi.fn().mockResolvedValue(null),
      writeFile
    })
    const result = await ipc.handlers.get('diagnostics:export')!()
    expect(result).toEqual({ ok: false })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('falha de escrita vira {ok:false} — nunca um "ok" por algo que não foi gravado', async () => {
    const ipc = fakeIpcMain()
    registerDiagnosticsIpc(ipc as never, {
      gatherInput: () => input(),
      saveDialog: vi.fn().mockResolvedValue('/tmp/x.json'),
      writeFile: () => {
        throw new Error('disco cheio')
      }
    })
    const result = await ipc.handlers.get('diagnostics:export')!()
    expect(result).toEqual({ ok: false })
  })
})
