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
  it('dia da semana: 7 no campo dow também casa domingo (dialeto alternativo)', () => {
    // 2026-07-12 é um domingo (dow=0); alguns dialetos de cron usam 7 como domingo alternativo
    expect(cronMatches('* * * * 7', at(2026, 7, 12, 0, 0))).toBe(true)
    // 2026-07-10 é sexta-feira (dow=5): 7 no campo dow não deve casar dias que não são domingo
    expect(cronMatches('* * * * 7', at(2026, 7, 10, 0, 0))).toBe(false)
  })
  it('expr malformada → false', () => {
    expect(cronMatches('nonsense', at(2026, 7, 10, 0, 0))).toBe(false)
    expect(cronMatches('* * *', at(2026, 7, 10, 0, 0))).toBe(false)
  })
  it('*/2 em dayOfMonth conta a partir de 1 (ímpares, não pares)', () => {
    expect(cronMatches('0 0 */2 * *', at(2026, 7, 3, 0, 0))).toBe(true)
    expect(cronMatches('0 0 */2 * *', at(2026, 7, 4, 0, 0))).toBe(false)
  })
  it('*/2 em month conta a partir de 1 (ímpares, não pares)', () => {
    expect(cronMatches('0 0 1 */2 *', at(2026, 3, 1, 0, 0))).toBe(true)
    expect(cronMatches('0 0 1 */2 *', at(2026, 4, 1, 0, 0))).toBe(false)
  })
  it('*/15 em minute continua casando 0,15,30,45 e não 16 (base 0 preservada)', () => {
    expect(cronMatches('*/15 * * * *', at(2026, 7, 10, 3, 0))).toBe(true)
    expect(cronMatches('*/15 * * * *', at(2026, 7, 10, 3, 15))).toBe(true)
    expect(cronMatches('*/15 * * * *', at(2026, 7, 10, 3, 30))).toBe(true)
    expect(cronMatches('*/15 * * * *', at(2026, 7, 10, 3, 45))).toBe(true)
    expect(cronMatches('*/15 * * * *', at(2026, 7, 10, 3, 16))).toBe(false)
  })
  it('vírgula solta não casa com val=0 (parte vazia deve ser ignorada)', () => {
    expect(cronMatches(',5 * * * *', at(2026, 7, 10, 0, 0))).toBe(false)
  })
})
