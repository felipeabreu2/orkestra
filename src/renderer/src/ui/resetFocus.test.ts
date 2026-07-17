// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { resetFocus } from './resetFocus'

describe('resetFocus', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('tira o foco de um xterm preso e o devolve ao pane do canvas', () => {
    document.body.innerHTML =
      '<div class="react-flow__pane" tabindex="-1"></div><div class="xterm"><textarea></textarea></div>'
    const pane = document.querySelector<HTMLElement>('.react-flow__pane')!
    const textarea = document.querySelector('textarea')!
    textarea.focus()
    expect(document.activeElement).toBe(textarea)
    resetFocus(pane)
    expect(document.activeElement).not.toBe(textarea)
    expect(document.activeElement).toBe(pane)
  })

  it('com nada preso (foco no body) é idempotente: não lança e foca o pane', () => {
    document.body.innerHTML = '<div class="react-flow__pane" tabindex="-1"></div>'
    const pane = document.querySelector<HTMLElement>('.react-flow__pane')!
    expect(() => resetFocus(pane)).not.toThrow()
    expect(document.activeElement).toBe(pane)
  })

  it('input/contenteditable soltos também são liberados', () => {
    document.body.innerHTML =
      '<div class="react-flow__pane" tabindex="-1"></div><input id="i"><div id="c" contenteditable="true" tabindex="0"></div>'
    const pane = document.querySelector<HTMLElement>('.react-flow__pane')!
    const input = document.querySelector<HTMLInputElement>('#i')!
    input.focus()
    resetFocus(pane)
    expect(document.activeElement).toBe(pane)
    const ce = document.querySelector<HTMLElement>('#c')!
    ce.focus()
    resetFocus(pane)
    expect(document.activeElement).toBe(pane)
  })

  it('sem pane (null) é no-op seguro: só solta o elemento ativo', () => {
    document.body.innerHTML = '<div class="xterm"><textarea></textarea></div>'
    const textarea = document.querySelector('textarea')!
    textarea.focus()
    expect(() => resetFocus(null)).not.toThrow()
    expect(document.activeElement).not.toBe(textarea)
  })
})
