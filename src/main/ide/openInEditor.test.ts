import { describe, it, expect, vi } from 'vitest'
import { openInEditor, EDITOR_CANDIDATES } from './openInEditor'

describe('openInEditor', () => {
  it('abre no primeiro editor candidato que funciona e para de tentar os demais', async () => {
    const tryExec = vi.fn(async (cmd: string) => cmd === 'cursor') // só o Cursor "existe"
    const res = await openInEditor('/proj', { tryExec, candidates: ['code', 'cursor', 'subl'] })
    expect(res).toEqual({ ok: true, editor: 'cursor' })
    // tentou 'code' (falhou) e 'cursor' (ok) — não deve tentar 'subl' depois do sucesso
    expect(tryExec).toHaveBeenCalledTimes(2)
    expect(tryExec).toHaveBeenNthCalledWith(1, 'code', ['/proj'])
    expect(tryExec).toHaveBeenNthCalledWith(2, 'cursor', ['/proj'])
  })

  // Onda 1 · T3: o duplo-clique na árvore manda um ARQUIVO (não a pasta do projeto). A lógica é a
  // mesma — este caso trava o contrato: o path chega intacto em tryExec, sem virar dirname.
  it('abre um ARQUIVO (não só a pasta do projeto) passando o caminho intacto', async () => {
    const tryExec = vi.fn(async (cmd: string) => cmd === 'code')
    const res = await openInEditor('/x/a.ts', { tryExec })
    expect(res).toEqual({ ok: true, editor: 'code' })
    expect(tryExec).toHaveBeenCalledWith('code', ['/x/a.ts'])
  })

  it('cai no gerenciador de arquivos quando nenhum editor funciona', async () => {
    const tryExec = vi.fn(async () => false)
    const openFiles = vi.fn(async () => true)
    const res = await openInEditor('/proj', { tryExec, openFiles, candidates: ['code'] })
    expect(res).toEqual({ ok: true, editor: 'files' })
    expect(openFiles).toHaveBeenCalledWith('/proj')
  })

  it('retorna ok:false quando nenhum editor funciona e não há fallback', async () => {
    const res = await openInEditor('/proj', { tryExec: async () => false, candidates: ['code'] })
    expect(res).toEqual({ ok: false })
  })

  it('retorna ok:false para caminho vazio sem tentar nada', async () => {
    const tryExec = vi.fn(async () => true)
    const res = await openInEditor('   ', { tryExec })
    expect(res).toEqual({ ok: false })
    expect(tryExec).not.toHaveBeenCalled()
  })

  it('usa a lista padrão de candidatos quando nenhuma é informada', async () => {
    const tried: string[] = []
    const tryExec = vi.fn(async (cmd: string) => {
      tried.push(cmd)
      return false
    })
    await openInEditor('/proj', { tryExec })
    expect(tried).toEqual([...EDITOR_CANDIDATES])
  })
})
