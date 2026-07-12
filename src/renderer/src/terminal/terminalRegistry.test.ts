import { describe, it, expect, beforeEach } from 'vitest'
import { registerTerminalPty, unregisterTerminalPty, getTerminalPty } from './terminalRegistry'

describe('terminalRegistry', () => {
  beforeEach(() => {
    unregisterTerminalPty('n1')
    unregisterTerminalPty('n2')
  })
  it('register/get devolve o ptyId do nó', () => {
    registerTerminalPty('n1', 'pty-1')
    expect(getTerminalPty('n1')).toBe('pty-1')
    expect(getTerminalPty('n2')).toBeUndefined()
  })
  it('unregister remove o mapeamento', () => {
    registerTerminalPty('n1', 'pty-1')
    unregisterTerminalPty('n1')
    expect(getTerminalPty('n1')).toBeUndefined()
  })
  it('re-register sobrescreve', () => {
    registerTerminalPty('n1', 'pty-1')
    registerTerminalPty('n1', 'pty-2')
    expect(getTerminalPty('n1')).toBe('pty-2')
  })
})
