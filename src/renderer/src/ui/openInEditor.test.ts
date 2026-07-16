import { describe, it, expect, vi } from 'vitest'
import { openEntryInEditor } from './openInEditor'
import type { FileEntry } from '../../../shared/filetree'

const file = (path: string): FileEntry => ({ name: path.split('/').pop() ?? path, path, isDir: false })
const dir = (path: string): FileEntry => ({ name: path.split('/').pop() ?? path, path, isDir: true })

describe('openEntryInEditor', () => {
  it('abre o caminho do ARQUIVO no editor externo', async () => {
    const open = vi.fn(async () => ({ ok: true, editor: 'code' }))
    const opened = await openEntryInEditor(file('/x/a.ts'), open)
    expect(open).toHaveBeenCalledWith('/x/a.ts')
    expect(opened).toBe(true)
  })

  it('não abre PASTA (o duplo-clique numa pasta é do expandir/colapsar, não do editor)', async () => {
    const open = vi.fn(async () => ({ ok: true, editor: 'code' }))
    const opened = await openEntryInEditor(dir('/x/src'), open)
    expect(open).not.toHaveBeenCalled()
    expect(opened).toBe(false)
  })

  it('ignora entrada com caminho vazio sem chamar o IPC', async () => {
    const open = vi.fn(async () => ({ ok: true, editor: 'code' }))
    const opened = await openEntryInEditor({ name: '', path: '  ', isDir: false }, open)
    expect(open).not.toHaveBeenCalled()
    expect(opened).toBe(false)
  })

  it('devolve false quando nenhum editor abriu (ok:false), sem lançar', async () => {
    const open = vi.fn(async () => ({ ok: false }))
    await expect(openEntryInEditor(file('/x/a.ts'), open)).resolves.toBe(false)
  })

  it('engole a rejeição do IPC — duplo-clique nunca vira unhandled rejection', async () => {
    const open = vi.fn(async () => {
      throw new Error('ipc caiu')
    })
    await expect(openEntryInEditor(file('/x/a.ts'), open)).resolves.toBe(false)
  })
})
