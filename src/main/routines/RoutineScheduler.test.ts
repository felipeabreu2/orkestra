import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RoutineScheduler } from './RoutineScheduler'
import type { Routine } from '../../shared/routines'

const at = (h: number, mi: number): Date => new Date(2026, 6, 10, h, mi, 0, 0)

// persist() é fire-and-forget (`void this.persist()`) e faz mkdir+writeFile+rename encadeados
// (várias voltas no event loop). Um único tick não é suficiente de forma confiável; faz polling
// limitado em vez de contar ticks fixos, o que evita flakiness entre máquinas/CI.
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout esperando condição em waitFor')
    await new Promise((r) => setTimeout(r, 5))
  }
}

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

  it('isola erro por rotina no tick: uma rotina cujo onFire lança não derruba o tick nem impede as demais', () => {
    const fired: Routine[] = []
    const onFire = (r: Routine): void => {
      if (r.name === 'bad') throw new Error('boom')
      fired.push(r)
    }
    const s = new RoutineScheduler({ onFire, now: () => at(9, 30) })
    s.add({ name: 'bad', schedule: '* * * * *', target: 'D', command: 'x', enabled: true })
    s.add({ name: 'good', schedule: '* * * * *', target: 'D', command: 'x', enabled: true })

    expect(() => s.tick()).not.toThrow()
    expect(fired).toHaveLength(1)
    expect(fired[0]).toMatchObject({ name: 'good' })
  })

  it('add valida campos obrigatórios e lança em rotina inválida', () => {
    const s = new RoutineScheduler({ onFire: vi.fn(), now: () => at(9, 30) })
    expect(() =>
      s.add({ name: 'x', schedule: undefined as any, target: 'D', command: 'c', enabled: true })
    ).toThrow()
    expect(() =>
      s.add({ name: 'x', schedule: '* * * * *', target: 'D', command: 'c', enabled: true })
    ).not.toThrow()
  })

  it('loadPersisted descarta rotina malformada e mantém a válida; tick subsequente não lança', async () => {
    let dir = ''
    try {
      dir = mkdtempSync(join(tmpdir(), 'orkestra-'))
      const file = join(dir, 'routines.json')
      const valid = { id: 'valid-1', name: 'Good', schedule: '* * * * *', target: 'D', command: 'x', enabled: true }
      const malformed = { id: 'bad-1', name: 'Bad', target: 'D', command: 'x', enabled: true } // sem schedule
      writeFileSync(file, JSON.stringify([valid, malformed]))

      const onFire = vi.fn()
      const s = new RoutineScheduler({ onFire, now: () => at(9, 30), persistPath: file })
      await s.loadPersisted()

      expect(s.list()).toHaveLength(1)
      expect(s.list()[0]).toMatchObject({ id: 'valid-1' })
      expect(() => s.tick()).not.toThrow()
      expect(onFire).toHaveBeenCalledTimes(1)
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })

  it('persist grava routines.json atomicamente (tmp+rename): arquivo válido, sem .tmp residual, e round-trip via loadPersisted', async () => {
    let dir = ''
    try {
      dir = mkdtempSync(join(tmpdir(), 'orkestra-routines-'))
      const file = join(dir, 'routines.json')
      const s = new RoutineScheduler({ onFire: vi.fn(), now: () => at(9, 30), persistPath: file })
      const r = s.add({ name: 'R', schedule: '* * * * *', target: 'D', command: 'echo oi', enabled: true })

      // add() dispara persist() como fire-and-forget (void this.persist()); espera a escrita
      // assíncrona (mkdir+writeFile+rename) terminar em disco.
      await waitFor(() => existsSync(file))

      expect(existsSync(file)).toBe(true)
      const raw = readFileSync(file, 'utf8')
      expect(() => JSON.parse(raw)).not.toThrow()
      expect(Array.isArray(JSON.parse(raw))).toBe(true)
      expect(existsSync(`${file}.tmp`)).toBe(false) // escrita bem-sucedida não deixa .tmp para trás

      const fresh = new RoutineScheduler({ onFire: vi.fn(), now: () => at(9, 30), persistPath: file })
      await fresh.loadPersisted()
      expect(fresh.list()).toHaveLength(1)
      expect(fresh.list()[0]).toMatchObject({ id: r.id, name: 'R' })
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })
})
