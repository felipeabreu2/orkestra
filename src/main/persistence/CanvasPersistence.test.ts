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
    const snap = { version: 1 as const, nodes: [{ id: 'a', type: 'terminal', position: { x: 1, y: 2 }, width: 300, height: 200, data: {} }], edges: [] }
    p.save(snap)
    expect(p.load()).toEqual(snap)
  })

  it('load retorna null (sem crash) quando o JSON é inválido', () => {
    const file = tmpFile()
    const p = new CanvasPersistence(file)
    writeFileSync(file, '{ not valid json')
    expect(p.load()).toBeNull()
  })

  it('load retorna null quando o JSON é válido mas é um objeto vazio (sem nodes)', () => {
    const file = tmpFile()
    const p = new CanvasPersistence(file)
    writeFileSync(file, '{}')
    expect(p.load()).toBeNull()
  })

  it('load retorna null quando o JSON tem version mas não tem nodes', () => {
    const file = tmpFile()
    const p = new CanvasPersistence(file)
    writeFileSync(file, '{"version":1}')
    expect(p.load()).toBeNull()
  })

  it('load retorna null quando o JSON é válido mas de formato errado (número)', () => {
    const file = tmpFile()
    const p = new CanvasPersistence(file)
    writeFileSync(file, '42')
    expect(p.load()).toBeNull()
  })

  it('save não lança quando a escrita falha (diretório pai inexistente)', () => {
    tmpFile() // popula `dir` (limpo no afterEach) sem usar o arquivo em si
    const p = new CanvasPersistence(join(dir, 'does-not-exist-subdir', 'canvas.json'))
    expect(() => p.save({ version: 1, nodes: [], edges: [] })).not.toThrow()
  })
})
