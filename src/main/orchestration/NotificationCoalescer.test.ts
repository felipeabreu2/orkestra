import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  NotificationCoalescer,
  buildAggregateBody,
  aggregateClickTarget,
  type AttentionEvent
} from './NotificationCoalescer'

// Ombro T6 (docs/planejamento/ombro.md): coalescer anti-spam — junta os eventos de `onAttention`
// numa janela curta e emite UMA notificação ("2 agentes ficaram ociosos: Dev, Revisor"). Fake timers
// como AgentBus.test.ts. `buildAggregateBody` e `aggregateClickTarget` são puros e testados diretos.
const ev = (nodeId: string, agentName: string, bufferText = ''): AttentionEvent => ({
  nodeId,
  agentName,
  bufferText
})

describe('NotificationCoalescer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('coalesce dois push dentro da janela num único onFlush com os 2 eventos', () => {
    const onFlush = vi.fn()
    const c = new NotificationCoalescer(onFlush, 600)
    c.push(ev('a', 'Dev'))
    c.push(ev('b', 'Revisor'))
    expect(onFlush).not.toHaveBeenCalled() // ainda dentro da janela
    vi.advanceTimersByTime(600)
    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush.mock.calls[0][0]).toEqual([ev('a', 'Dev'), ev('b', 'Revisor')])
  })

  it('um único evento na janela → onFlush com 1 evento (degrada para a individual)', () => {
    const onFlush = vi.fn()
    const c = new NotificationCoalescer(onFlush, 600)
    c.push(ev('a', 'Dev'))
    vi.advanceTimersByTime(600)
    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush.mock.calls[0][0]).toEqual([ev('a', 'Dev')])
  })

  it('eventos em janelas separadas → dois onFlush', () => {
    const onFlush = vi.fn()
    const c = new NotificationCoalescer(onFlush, 600)
    c.push(ev('a', 'Dev'))
    vi.advanceTimersByTime(600)
    c.push(ev('b', 'Revisor'))
    vi.advanceTimersByTime(600)
    expect(onFlush).toHaveBeenCalledTimes(2)
    expect(onFlush.mock.calls[0][0]).toEqual([ev('a', 'Dev')])
    expect(onFlush.mock.calls[1][0]).toEqual([ev('b', 'Revisor')])
  })

  it('windowMs=0 → passthrough: cada push dispara onFlush na hora (desligável)', () => {
    const onFlush = vi.fn()
    const c = new NotificationCoalescer(onFlush, 0)
    c.push(ev('a', 'Dev'))
    c.push(ev('b', 'Revisor'))
    expect(onFlush).toHaveBeenCalledTimes(2)
    expect(onFlush.mock.calls[0][0]).toEqual([ev('a', 'Dev')])
    expect(onFlush.mock.calls[1][0]).toEqual([ev('b', 'Revisor')])
  })

  it('dispose cancela o timer pendente (sem vazamento, sem flush tardio)', () => {
    const onFlush = vi.fn()
    const c = new NotificationCoalescer(onFlush, 600)
    c.push(ev('a', 'Dev'))
    c.dispose()
    vi.advanceTimersByTime(5000)
    expect(onFlush).not.toHaveBeenCalled()
  })
})

describe('buildAggregateBody', () => {
  it('1 evento → delega para a notificação individual da T4 (título por status + prévia)', () => {
    const out = buildAggregateBody([ev('a', 'Revisor', 'oi\nDo you want to proceed? (y/n)')])
    expect(out).toEqual({ title: 'Revisor precisa de você', body: 'Do you want to proceed? (y/n)' })
  })

  it('2+ eventos → título com a contagem + corpo com os nomes', () => {
    const out = buildAggregateBody([ev('a', 'Dev'), ev('b', 'Revisor')])
    expect(out).toEqual({ title: '2 agentes ficaram ociosos', body: 'Dev, Revisor' })
  })

  it('2+ eventos com nome ausente → fallback "Agente" no corpo', () => {
    const out = buildAggregateBody([ev('a', 'Dev'), { nodeId: 'b', bufferText: '' }])
    expect(out.body).toBe('Dev, Agente')
  })
})

describe('aggregateClickTarget', () => {
  it('devolve o nodeId do primeiro evento', () => {
    expect(aggregateClickTarget([ev('a', 'Dev'), ev('b', 'Revisor')])).toBe('a')
  })
  it('lista vazia → undefined', () => {
    expect(aggregateClickTarget([])).toBeUndefined()
  })
})
