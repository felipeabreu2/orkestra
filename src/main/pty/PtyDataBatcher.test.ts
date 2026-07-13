import { describe, it, expect } from 'vitest'
import { PtyDataBatcher } from './PtyDataBatcher'

const fakeTimer = 1 as unknown as ReturnType<typeof setTimeout>

// Captura os callbacks agendados num array (evita problemas de control-flow do TS com `let`).
function makeBatcher(flushFn: (id: string, data: string) => void): {
  batcher: PtyDataBatcher
  run: () => void
} {
  const scheduled: Array<() => void> = []
  const batcher = new PtyDataBatcher(
    flushFn,
    16,
    (cb) => {
      scheduled.push(cb)
      return fakeTimer
    },
    () => {}
  )
  return { batcher, run: () => scheduled.forEach((cb) => cb()) }
}

describe('PtyDataBatcher', () => {
  it('acumula chunks por pty e faz flush concatenado no timer', () => {
    const flushed: Array<[string, string]> = []
    const { batcher, run } = makeBatcher((id, data) => flushed.push([id, data]))
    batcher.push('a', 'ola ')
    batcher.push('a', 'mundo')
    batcher.push('b', 'x')
    expect(flushed).toEqual([]) // nada antes do flush
    run()
    expect(flushed).toEqual([
      ['a', 'ola mundo'],
      ['b', 'x']
    ])
  })

  it('flushOne envia imediatamente o pendente de um pty (ex.: no exit) e não repete', () => {
    const flushed: Array<[string, string]> = []
    const { batcher } = makeBatcher((id, data) => flushed.push([id, data]))
    batcher.push('a', 'fim')
    batcher.flushOne('a')
    expect(flushed).toEqual([['a', 'fim']])
    batcher.flushAll()
    expect(flushed).toEqual([['a', 'fim']]) // não re-envia
  })

  it('preserva a ordem de chegada por pty', () => {
    const flushed: string[] = []
    const { batcher, run } = makeBatcher((_id, data) => flushed.push(data))
    batcher.push('a', '1')
    batcher.push('a', '2')
    batcher.push('a', '3')
    run()
    expect(flushed).toEqual(['123'])
  })
})
