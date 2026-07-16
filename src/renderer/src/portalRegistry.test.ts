import { describe, it, expect, vi } from 'vitest'
import {
  registerPortal,
  unregisterPortal,
  getPortal,
  subscribePortalDriving,
  notifyPortalDriving
} from './portalRegistry'
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

// T6: o pub/sub PURO de "agente dirigindo" (a janela de expiração/pulso vive no PortalNode; aqui só
// o roteamento nodeId → listeners). Sem DOM/Electron — só o mapa de listeners.
describe('portalRegistry — driving pub/sub (T6)', () => {
  it('notifyPortalDriving chama os listeners inscritos naquele nodeId', () => {
    const cb = vi.fn()
    const off = subscribePortalDriving('drive-1', cb)
    notifyPortalDriving('drive-1')
    expect(cb).toHaveBeenCalledTimes(1)
    off()
  })

  it('não vaza para outros nodeIds', () => {
    const cb = vi.fn()
    const off = subscribePortalDriving('drive-1', cb)
    notifyPortalDriving('drive-2')
    expect(cb).not.toHaveBeenCalled()
    off()
  })

  it('após unsubscribe o listener não é mais chamado', () => {
    const cb = vi.fn()
    const off = subscribePortalDriving('drive-3', cb)
    off()
    notifyPortalDriving('drive-3')
    expect(cb).not.toHaveBeenCalled()
  })

  it('notify em nodeId sem inscritos é no-op (não lança)', () => {
    expect(() => notifyPortalDriving('inexistente')).not.toThrow()
  })

  it('múltiplos listeners no mesmo nodeId são todos notificados', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = subscribePortalDriving('drive-4', a)
    const offB = subscribePortalDriving('drive-4', b)
    notifyPortalDriving('drive-4')
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    offA()
    offB()
  })
})
