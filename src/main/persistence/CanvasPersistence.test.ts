import { describe, it, expect, afterEach } from 'vitest'
import { CanvasPersistence } from './CanvasPersistence'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let dir: string
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })
function tmpFile(): string {
  dir = mkdtempSync(join(tmpdir(), 'orkestra-'))
  return join(dir, 'canvas.json')
}

describe('CanvasPersistence', () => {
  it('load retorna null quando o arquivo não existe', () => {
    const p = new CanvasPersistence(tmpFile())
    expect(p.load()).toBeNull()
  })

  it('save depois load faz round-trip do snapshot', () => {
    const p = new CanvasPersistence(tmpFile())
    const snap = { version: 1 as const, nodes: [{ id: 'a', type: 'terminal', position: { x: 1, y: 2 }, width: 300, height: 200, data: {} }] }
    p.save(snap)
    expect(p.load()).toEqual(snap)
  })

  it('load retorna null (sem crash) quando o JSON é inválido', () => {
    const file = tmpFile()
    const p = new CanvasPersistence(file)
    writeFileSync(file, '{ not valid json')
    expect(p.load()).toBeNull()
  })
})
