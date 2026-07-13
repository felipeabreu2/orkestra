import { describe, it, expect } from 'vitest'
import { NEW_PROJECT_EVENT } from './appEvents'

describe('appEvents', () => {
  it('o nome do evento de novo projeto é estável', () => {
    expect(NEW_PROJECT_EVENT).toBe('orkestra:new-project')
  })
})
