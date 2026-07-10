import { describe, it, expect } from 'vitest'
import { registerPortal, unregisterPortal, getPortal } from './portalRegistry'
import type { WebviewTag } from 'electron'

describe('portalRegistry', () => {
  it('registra um webview e resolve pelo nodeId', () => {
    const el = {} as WebviewTag
    registerPortal('node-1', el)
    expect(getPortal('node-1')).toBe(el)
    unregisterPortal('node-1')
  })

  it('retorna undefined para um nodeId nunca registrado', () => {
    expect(getPortal('nunca-registrado')).toBeUndefined()
  })

  it('unregisterPortal remove o webview do registry', () => {
    const el = {} as WebviewTag
    registerPortal('node-2', el)
    unregisterPortal('node-2')
    expect(getPortal('node-2')).toBeUndefined()
  })

  it('registrar um novo elemento no mesmo nodeId substitui o anterior', () => {
    const first = {} as WebviewTag
    const second = {} as WebviewTag
    registerPortal('node-3', first)
    registerPortal('node-3', second)
    expect(getPortal('node-3')).toBe(second)
    unregisterPortal('node-3')
  })
})
