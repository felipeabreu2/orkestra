import { describe, it, expect } from 'vitest'
import { ropeSag, ropePath } from './ropePath'

describe('ropeSag', () => {
  it('cresce com a distância horizontal e respeita um mínimo', () => {
    expect(ropeSag(0, 0)).toBe(24) // mínimo
    expect(ropeSag(400, 0)).toBe(100) // 400 * 0.25
    expect(ropeSag(-400, 0)).toBe(100) // usa o módulo
  })
})

describe('ropePath', () => {
  it('gera um bezier quadrático com o ponto de controle abaixo do meio', () => {
    const [path, labelX, labelY] = ropePath(0, 0, 400, 0)
    // meio horizontal = 200; barriga = 100 abaixo do meio vertical (0) => cy = 100
    expect(path).toBe('M0,0 Q200,100 400,0')
    expect(labelX).toBe(200)
    // label no meio da quadrática (t=0.5): 0.25*0 + 0.5*100 + 0.25*0 = 50
    expect(labelY).toBe(50)
  })

  it('swingX desloca o ponto de controle na horizontal (balanço)', () => {
    const [path] = ropePath(0, 0, 400, 0, 30)
    expect(path).toBe('M0,0 Q230,100 400,0')
  })
})
