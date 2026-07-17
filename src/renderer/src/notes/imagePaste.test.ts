import { describe, it, expect } from 'vitest'
import { pickImageFile, isImageDataUri, MAX_IMAGE_BYTES } from './imagePaste'

// Itens fake no shape mínimo de DataTransferItem que o helper consome.
const item = (type: string, file: unknown = { name: 'f' }): { type: string; getAsFile: () => File | null } => ({
  type,
  getAsFile: () => file as File | null
})

describe('pickImageFile', () => {
  it('devolve o PRIMEIRO item de imagem da lista', () => {
    const png = { name: 'shot.png' }
    const found = pickImageFile([item('text/plain'), item('image/png', png), item('image/jpeg')])
    expect(found).toBe(png)
  })

  it('sem item de imagem -> null', () => {
    expect(pickImageFile([item('text/plain'), item('text/html')])).toBeNull()
    expect(pickImageFile([])).toBeNull()
  })

  it('item de imagem cujo getAsFile devolve null é pulado (tenta o próximo)', () => {
    const jpeg = { name: 'b.jpg' }
    const found = pickImageFile([item('image/png', null), item('image/jpeg', jpeg)])
    expect(found).toBe(jpeg)
  })
})

describe('isImageDataUri', () => {
  it('aceita os formatos raster comuns em base64', () => {
    expect(isImageDataUri('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isImageDataUri('data:image/jpeg;base64,/9j/4AAQ')).toBe(true)
    expect(isImageDataUri('data:image/webp;base64,UklGR')).toBe(true)
    expect(isImageDataUri('data:image/gif;base64,R0lGOD')).toBe(true)
  })

  it('recusa o que não é imagem raster em data URI', () => {
    expect(isImageDataUri('data:text/html;base64,PHNjcmlwdD4=')).toBe(false)
    expect(isImageDataUri('https://x/y.png')).toBe(false)
    expect(isImageDataUri('javascript:alert(1)')).toBe(false)
    expect(isImageDataUri('')).toBe(false)
  })

  it('recusa SVG (pode carregar script; screenshot colado é sempre raster)', () => {
    expect(isImageDataUri('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
  })
})

describe('MAX_IMAGE_BYTES', () => {
  it('é um teto positivo e finito (data URI infla o snapshot do projeto)', () => {
    expect(MAX_IMAGE_BYTES).toBeGreaterThan(100 * 1024)
    expect(Number.isFinite(MAX_IMAGE_BYTES)).toBe(true)
  })
})
