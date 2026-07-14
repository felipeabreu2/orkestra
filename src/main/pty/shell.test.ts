import { describe, it, expect } from 'vitest'
import { defaultShell } from './shell'

describe('defaultShell', () => {
  it('POSIX usa $SHELL, com fallback /bin/bash', () => {
    expect(defaultShell('darwin', { SHELL: '/bin/zsh' })).toBe('/bin/zsh')
    expect(defaultShell('linux', {})).toBe('/bin/bash')
  })
  it('Windows usa ComSpec, com fallback cmd.exe', () => {
    expect(defaultShell('win32', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' })).toBe(
      'C:\\Windows\\System32\\cmd.exe'
    )
    expect(defaultShell('win32', {})).toBe('cmd.exe')
  })
})
