import { describe, it, expect } from 'vitest'
import { PRESETS, presetById } from './presets'

describe('presets', () => {
  it('inclui shell puro (command null) e ao menos um agente CLI', () => {
    const shell = PRESETS.find((p) => p.id === 'shell')
    expect(shell?.command).toBeNull()
    expect(PRESETS.some((p) => typeof p.command === 'string')).toBe(true)
  })
  it('presetById resolve por id e retorna undefined para desconhecido', () => {
    expect(presetById('shell')?.id).toBe('shell')
    expect(presetById('nao-existe')).toBeUndefined()
  })
})
