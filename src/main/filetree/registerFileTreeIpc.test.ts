import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerFileTreeIpc } from './registerFileTreeIpc'
import { FileTreeService } from './FileTreeService'

// Mesmo padrão de fake usado em registerProjectIpc.test.ts: registra os handlers num Map em vez
// de subir um ipcMain de verdade (não precisamos do Electron real p/ testar o wiring).
function fakeIpcMain(): { handle: (ch: string, fn: (...a: any[]) => any) => void; handlers: Map<string, (...a: any[]) => any> } {
  const handlers = new Map<string, (...a: any[]) => any>()
  return {
    handle: (ch: string, fn: (...a: any[]) => any): void => {
      handlers.set(ch, fn)
    },
    handlers
  }
}

describe('registerFileTreeIpc', () => {
  let dir: string
  // Serviço REAL (não mock) — este teste verifica o wiring ipcMain.handle -> svc.*, a cobertura
  // de comportamento fica em FileTreeService.test.ts.
  const svc = new FileTreeService()

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ork-ft-ipc-'))
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'README.md'), '# hi\n')
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1\n')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('filetree:list chama svc.list(dir) e devolve as entradas ordenadas', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc)

    const result = await ipc.handlers.get('filetree:list')!({}, dir)

    expect(result.some((e: any) => e.name === 'src' && e.isDir === true)).toBe(true)
    expect(result.some((e: any) => e.name === 'README.md' && e.isDir === false)).toBe(true)
  })

  it('filetree:list propaga a rejeicao p/ um dir inexistente', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc)

    await expect(ipc.handlers.get('filetree:list')!({}, join(dir, 'nao-existe'))).rejects.toBeTruthy()
  })

  it('filetree:read chama svc.read(path) e devolve o conteudo', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc)

    const result = await ipc.handlers.get('filetree:read')!({}, join(dir, 'README.md'))

    expect(result.content).toContain('# hi')
    expect(result.binary).toBe(false)
    expect(result.truncated).toBe(false)
  })

  it('filetree:gitStatus devolve {} para um dir sem repo git', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc)

    const result = await ipc.handlers.get('filetree:gitStatus')!({}, dir)

    // Novo shape (fix do relativeToRoot, #11): { prefix, entries } — fora de repo, ambos vazios.
    expect(result).toEqual({ prefix: '', entries: {} })
  })

  it('filetree:gitStatus reporta arquivos modificados num repo git real', async () => {
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: dir })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
    writeFileSync(join(dir, 'README.md'), '# changed\n')

    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc)
    const result = await ipc.handlers.get('filetree:gitStatus')!({}, dir)

    // Repo no toplevel → prefix vazio; a chave do entries é o path relativo à raiz.
    expect(result.prefix).toBe('')
    expect(result.entries['README.md']).toBeTruthy()
  })
})
