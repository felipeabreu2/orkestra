import { describe, it, expect } from 'vitest'
import { partitionForPortal } from './portalPartition'

describe('partitionForPortal', () => {
  it('portal isolado usa o próprio nodeId (persistente)', () => {
    expect(partitionForPortal('portal-1')).toBe('persist:portal-portal-1')
  })
  it('portal linkado usa a partition do portal-fonte', () => {
    expect(partitionForPortal('portal-2', 'portal-1')).toBe('persist:portal-portal-1')
  })
  it('linkedTo vazio/undefined cai no próprio', () => {
    expect(partitionForPortal('portal-3', '')).toBe('persist:portal-portal-3')
    expect(partitionForPortal('portal-3', undefined)).toBe('persist:portal-portal-3')
  })
})
