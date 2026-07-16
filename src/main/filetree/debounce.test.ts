import { describe, it, expect, vi, afterEach } from 'vitest'
import { debounce } from './debounce'

describe('debounce', () => {
  afterEach(() => vi.useRealTimers())

  it('coalesce uma rajada de 3 chamadas num unico disparo', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 50)

    d()
    d()
    d()
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('reagenda a cada chamada (so dispara depois de waitMs de silencio)', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 50)

    d()
    vi.advanceTimersByTime(40)
    d() // reinicia a janela
    vi.advanceTimersByTime(40)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('rajadas separadas por silencio disparam uma vez cada', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 50)

    d()
    d()
    vi.advanceTimersByTime(50)
    d()
    d()
    vi.advanceTimersByTime(50)

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('cancel impede o disparo pendente (nada de flush tardio depois do unwatch)', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 50)

    d()
    d.cancel()
    vi.advanceTimersByTime(1000)

    expect(fn).not.toHaveBeenCalled()
  })

  it('cancel nao mata o debounce: uma chamada posterior volta a agendar', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 50)

    d()
    d.cancel()
    d()
    vi.advanceTimersByTime(50)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('waitMs<=0 e passthrough: cada chamada dispara na hora', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 0)

    d()
    d()

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('maxWaitMs limita a fome: rajada CONTINUA ainda dispara dentro do teto', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    // Sem o teto, este loop reagendaria para sempre e `fn` NUNCA seria chamado (a tempestade
    // contínua de um build congelaria a árvore) — é exatamente o que maxWait existe para evitar.
    const d = debounce(fn, 50, 200)

    for (let i = 0; i < 20; i++) {
      d()
      vi.advanceTimersByTime(40) // sempre < waitMs => trailing puro nunca chegaria
    }

    expect(fn.mock.calls.length).toBeGreaterThan(0)
  })

  it('maxWaitMs dispara no teto contado do INICIO da rajada, nao da ultima chamada', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 50, 200)

    d() // t=0: inicio da rajada
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(40) // t=40,80,120,160,200
      d()
    }
    // t=200 = exatamente o teto: já disparou (e só uma vez — as 6 chamadas foram coalescidas).
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('sem maxWaitMs (padrao) o trailing puro nao dispara durante a rajada continua', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 50)

    for (let i = 0; i < 20; i++) {
      d()
      vi.advanceTimersByTime(40)
    }
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50) // silêncio => trailing

    expect(fn).toHaveBeenCalledTimes(1)
  })
})
