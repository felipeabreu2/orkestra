import { describe, it, expect, vi, afterEach } from 'vitest'
import { PortalActionRegistry } from './portalActionRegistry'

// T1 (round-trip do booleano de portal click/fill): a ponte main->renderer é unidirecional
// (webContents.send), então o resultado da ação volta por um canal separado (IPC portal:result).
// Este registry PURO correlaciona cada ação por requestId a uma promise pendente, e cobre o caso
// do webview morrer entre o send e o reply com um timeout que resolve {ok:false} (nunca pendura o
// agente) e limpa a entrada (sem vazamento de memória — mesmo cuidado do teto de waitForIdle).
describe('PortalActionRegistry', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('register devolve uma Promise que resolve com o resultado passado a resolve(id, ...)', async () => {
    const reg = new PortalActionRegistry()
    const p = reg.register('id-1')
    reg.resolve('id-1', { ok: true })
    await expect(p).resolves.toEqual({ ok: true })
    expect(reg.size).toBe(0)
  })

  it('resolve de um requestId desconhecido é no-op (não lança, não afeta outras pendências)', () => {
    const reg = new PortalActionRegistry()
    const p = reg.register('id-real')
    expect(() => reg.resolve('id-fantasma', { ok: true })).not.toThrow()
    expect(reg.size).toBe(1)
    void p
  })

  it('após o timeout a Promise resolve {ok:false} e a entrada é limpa (sem vazamento)', async () => {
    vi.useFakeTimers()
    const reg = new PortalActionRegistry(5000)
    const p = reg.register('id-2')
    expect(reg.size).toBe(1)
    vi.advanceTimersByTime(5000)
    await expect(p).resolves.toEqual({ ok: false })
    expect(reg.size).toBe(0)
  })

  it('resolve antes do timeout cancela o timer e limpa a entrada (avançar o tempo não re-resolve)', async () => {
    vi.useFakeTimers()
    const reg = new PortalActionRegistry(5000)
    const p = reg.register('id-3')
    reg.resolve('id-3', { ok: false })
    await expect(p).resolves.toEqual({ ok: false })
    expect(reg.size).toBe(0)
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
  })
})
