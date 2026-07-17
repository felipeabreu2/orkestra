import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerFileTreeIpc } from './registerFileTreeIpc'
import { FileTreeService } from './FileTreeService'
import { FileTreeWatcher } from './FileTreeWatcher'

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
  // Watcher REAL, pelo mesmo motivo (o comportamento tem cobertura em FileTreeWatcher.test.ts).
  // Recriado por teste e encerrado no afterEach: um watcher vazado aqui seguraria FDs pela suíte
  // inteira — o mesmo vazamento que a tarefa manda evitar em produção.
  let watcher: FileTreeWatcher
  let watchEvents: unknown[]

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ork-ft-ipc-'))
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'README.md'), '# hi\n')
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1\n')
    watchEvents = []
    watcher = new FileTreeWatcher((ev) => watchEvents.push(ev))
  })
  afterEach(() => {
    watcher.closeAll()
    rmSync(dir, { recursive: true, force: true })
  })

  it('filetree:list chama svc.list(dir) e devolve as entradas ordenadas', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc, watcher)

    const result = await ipc.handlers.get('filetree:list')!({}, dir)

    expect(result.some((e: any) => e.name === 'src' && e.isDir === true)).toBe(true)
    expect(result.some((e: any) => e.name === 'README.md' && e.isDir === false)).toBe(true)
  })

  it('filetree:list propaga a rejeicao p/ um dir inexistente', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc, watcher)

    await expect(ipc.handlers.get('filetree:list')!({}, join(dir, 'nao-existe'))).rejects.toBeTruthy()
  })

  it('filetree:read chama svc.read(path) e devolve o conteudo', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc, watcher)

    const result = await ipc.handlers.get('filetree:read')!({}, join(dir, 'README.md'))

    expect(result.content).toContain('# hi')
    expect(result.binary).toBe(false)
    expect(result.truncated).toBe(false)
  })

  it('filetree:gitStatus devolve {} para um dir sem repo git', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc, watcher)

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
    registerFileTreeIpc(ipc as any, svc, watcher)
    const result = await ipc.handlers.get('filetree:gitStatus')!({}, dir)

    // Repo no toplevel → prefix vazio; a chave do entries é o path relativo à raiz.
    expect(result.prefix).toBe('')
    expect(result.entries['README.md']).toBeTruthy()
  })

  // Onda 3 · T8 — wiring de gitBranch/gitDiff (comportamento fica em FileTreeService.test.ts).
  it('filetree:gitBranch e filetree:gitDiff devolvem vazio fora de repo git', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc, watcher)

    expect(await ipc.handlers.get('filetree:gitBranch')!({}, dir)).toBe('')
    expect(await ipc.handlers.get('filetree:gitDiff')!({}, dir)).toEqual({
      text: '',
      truncated: false
    })
  })

  it('filetree:gitBranch/gitDiff refletem um repo git real (branch + hunk do modificado)', async () => {
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: dir })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
    g(['checkout', '-qb', 'topico'])
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\n')

    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc, watcher)

    expect(await ipc.handlers.get('filetree:gitBranch')!({}, dir)).toBe('topico')
    const diff = await ipc.handlers.get('filetree:gitDiff')!({}, dir)
    expect(diff.text).toContain('+export const a = 2')
    expect(diff.truncated).toBe(false)
    // O `path` opcional atravessa o handler (2º argumento do invoke).
    const only = await ipc.handlers.get('filetree:gitDiff')!({}, dir, join(dir, 'README.md'))
    expect(only.text).toBe('')
  })

  // Onda 3 · T11 — wiring do git de ESCRITA (o comportamento fica em FileTreeService.test.ts).
  it('filetree:gitCommit/gitCreateBranch/gitCheckout mutam um repo git REAL pelo handler', async () => {
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: dir })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    g(['add', '.'])
    g(['commit', '-qm', 'i'])

    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc, watcher)
    const head = (): string =>
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim()

    // commit: HEAD muda de verdade
    const before = head()
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\n')
    const r = await ipc.handlers.get('filetree:gitCommit')!({}, dir, 'pelo ipc')
    expect(r.head).toBe(head())
    expect(r.head).not.toBe(before)

    // branch nova + checkout: gitBranch acompanha
    await ipc.handlers.get('filetree:gitCreateBranch')!({}, dir, 'feat/ipc')
    await ipc.handlers.get('filetree:gitCheckout')!({}, dir, 'feat/ipc')
    expect(await ipc.handlers.get('filetree:gitBranch')!({}, dir)).toBe('feat/ipc')
  })

  it('filetree:gitCommit/gitCreateBranch REJEITAM (erro chega ao renderer, não vira silêncio)', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc, watcher)

    // fora de repo: ao contrário do gitBranch/gitDiff (que devolvem vazio), escrever tem que falhar
    await expect(ipc.handlers.get('filetree:gitCommit')!({}, dir, 'x')).rejects.toBeTruthy()
    // nome hostil barrado no MAIN, não só na UI (o renderer é privilegiado — tem pty.spawn)
    await expect(
      ipc.handlers.get('filetree:gitCreateBranch')!({}, dir, '-D')
    ).rejects.toThrow(/inválido/i)
    await expect(ipc.handlers.get('filetree:gitCheckout')!({}, dir, '--force')).rejects.toThrow(
      /inválido/i
    )
  })

  // Onda 3 · T9 — wiring de watch/unwatch (o comportamento fica em FileTreeWatcher.test.ts).
  it('filetree:watch assina os dirs pedidos e devolve o resultado ao renderer', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc, watcher)

    const r = await ipc.handlers.get('filetree:watch')!({}, 's1', [dir, join(dir, 'src')], 'proj-a')

    expect(r).toMatchObject({ ok: true, watching: 2 })
    expect(watcher.activeWatcherCount()).toBe(2)
  })

  it('filetree:unwatch encerra a assinatura (o cleanup do renderer chega ate o watcher)', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc, watcher)
    await ipc.handlers.get('filetree:watch')!({}, 's1', [dir], null)
    expect(watcher.activeWatcherCount()).toBe(1)

    await ipc.handlers.get('filetree:unwatch')!({}, 's1')

    // Este é o caminho REAL do unmount do FileTreeNode: se o canal não chegasse ao watcher, cada
    // nó fechado vazaria um FD e ninguém veria.
    expect(watcher.activeWatcherCount()).toBe(0)
  })

  it('filetree:watch propaga a falha (ok:false) em vez de fingir que observa', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc, watcher)

    const r = await ipc.handlers.get('filetree:watch')!({}, 's1', [join(dir, 'nao-existe')], null)

    expect(r.ok).toBe(false)
    expect(r.watching).toBe(0)
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('filetree:watch atravessa o projectId (escopo de projeto) ate o push', async () => {
    const ipc = fakeIpcMain()
    registerFileTreeIpc(ipc as any, svc, watcher)

    await ipc.handlers.get('filetree:watch')!({}, 's1', [dir], 'proj-a')
    writeFileSync(join(dir, 'README.md'), '# mudou\n')

    // Espera por CONDIÇÃO (não sleep fixo): o push carimbado tem que chegar.
    const deadline = Date.now() + 3000
    while (watchEvents.length === 0) {
      if (Date.now() > deadline) throw new Error('timeout esperando o push do watch')
      await new Promise((r) => setTimeout(r, 5))
    }
    // O carimbo tem que sobreviver ao trajeto renderer -> handler -> watcher -> push; é ele que
    // impede um watcher do projeto A de atualizar o canvas do projeto B.
    expect(watchEvents[0]).toMatchObject({ subscriptionId: 's1', projectId: 'proj-a' })
  })
})
