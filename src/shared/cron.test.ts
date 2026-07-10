import { describe, it, expect } from 'vitest'
import { cronMatches } from './cron'

// Datas locais fixas (o matcher usa getHours/getMinutes/... locais)
const at = (y: number, mo: number, d: number, h: number, mi: number): Date => new Date(y, mo - 1, d, h, mi, 0, 0)

describe('cronMatches', () => {
  it('* * * * * casa qualquer minuto', () => {
    expect(cronMatches('* * * * *', at(2026, 7, 10, 3, 7))).toBe(true)
  })
  it('minuto/hora exatos', () => {
    expect(cronMatches('30 9 * * *', at(2026, 7, 10, 9, 30))).toBe(true)
    expect(cronMatches('30 9 * * *', at(2026, 7, 10, 9, 31))).toBe(false)
    expect(cronMatches('30 9 * * *', at(2026, 7, 10, 10, 30))).toBe(false)
  })
  it('*/15 casa múltiplos', () => {
    expect(cronMatches('*/15 * * * *', at(2026, 7, 10, 3, 0))).toBe(true)
    expect(cronMatches('*/15 * * * *', at(2026, 7, 10, 3, 15))).toBe(true)
    expect(cronMatches('*/15 * * * *', at(2026, 7, 10, 3, 16))).toBe(false)
  })
  it('intervalo e lista', () => {
    expect(cronMatches('0 9-17 * * *', at(2026, 7, 10, 13, 0))).toBe(true)
    expect(cronMatches('0 9-17 * * *', at(2026, 7, 10, 18, 0))).toBe(false)
    expect(cronMatches('0 0 * * 1,3,5', at(2026, 7, 10, 0, 0))).toBe(cronMatches('0 0 * * 5', at(2026, 7, 10, 0, 0)))
  })
  it('dia da semana (0=domingo)', () => {
    // 2026-07-10 é uma sexta-feira (dow=5)
    expect(cronMatches('* * * * 5', at(2026, 7, 10, 0, 0))).toBe(true)
    expect(cronMatches('* * * * 1', at(2026, 7, 10, 0, 0))).toBe(false)
  })
  it('expr malformada → false', () => {
    expect(cronMatches('nonsense', at(2026, 7, 10, 0, 0))).toBe(false)
    expect(cronMatches('* * *', at(2026, 7, 10, 0, 0))).toBe(false)
  })
})
