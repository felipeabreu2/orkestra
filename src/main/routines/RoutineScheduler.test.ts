import { describe, it, expect, vi } from 'vitest'
import { RoutineScheduler } from './RoutineScheduler'

const at = (h: number, mi: number): Date => new Date(2026, 6, 10, h, mi, 0, 0)

describe('RoutineScheduler', () => {
  it('dispara quando o cron casa e reporta a rotina', () => {
    let clock = at(9, 30)
    const onFire = vi.fn()
    const s = new RoutineScheduler({ onFire, now: () => clock })
    s.add({ name: 'R', schedule: '30 9 * * *', target: 'Dev', command: 'echo oi', enabled: true })
    s.tick()
    expect(onFire).toHaveBeenCalledTimes(1)
    expect(onFire.mock.calls[0][0]).toMatchObject({ target: 'Dev', command: 'echo oi' })
  })
  it('não dispara duas vezes no mesmo minuto (dedupe)', () => {
    const onFire = vi.fn()
    const s = new RoutineScheduler({ onFire, now: () => at(9, 30) })
    s.add({ name: 'R', schedule: '30 9 * * *', target: 'D', command: 'x', enabled: true })
    s.tick(); s.tick()
    expect(onFire).toHaveBeenCalledTimes(1)
  })
  it('não dispara rotina desabilitada', () => {
    const onFire = vi.fn()
    const s = new RoutineScheduler({ onFire, now: () => at(9, 30) })
    const r = s.add({ name: 'R', schedule: '* * * * *', target: 'D', command: 'x', enabled: true })
    s.setEnabled(r.id, false)
    s.tick()
    expect(onFire).not.toHaveBeenCalled()
  })
  it('remove tira a rotina da lista', () => {
    const s = new RoutineScheduler({ onFire: vi.fn(), now: () => at(1, 0) })
    const r = s.add({ name: 'R', schedule: '* * * * *', target: 'D', command: 'x', enabled: true })
    s.remove(r.id)
    expect(s.list()).toHaveLength(0)
  })
})
