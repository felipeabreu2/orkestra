import { describe, it, expect } from 'vitest'
import { isPathDrop, isDropOnNode, fileNodeDropPositions } from './canvasDrop'
import { ORKESTRA_PATH_MIME } from '../terminal/dropPaths'

// T6 — roteamento do drop no canvas. Os shapes usados aqui são os REAIS: `types` é o que o
// Chromium expõe em DataTransfer.types (inclui 'Files' em drop externo do Finder e o nosso
// MIME quando o drag nasce numa linha do FileTreeNode), e `closest` é a API real de Element,
// que é o que `e.target` de um evento de drop sempre é.

describe('isPathDrop', () => {
  it('aceita o MIME interno da árvore (o que FileTreeNode.onDragStart escreve)', () => {
    expect(isPathDrop([ORKESTRA_PATH_MIME])).toBe(true)
  })
  it('aceita quando o MIME vem junto de outros tipos', () => {
    expect(isPathDrop(['text/plain', ORKESTRA_PATH_MIME])).toBe(true)
  })
  it('recusa drop externo do Finder (só "Files") — não vira FileNode', () => {
    expect(isPathDrop(['Files'])).toBe(false)
  })
  it('recusa seleção de texto arrastada', () => {
    expect(isPathDrop(['text/plain', 'text/html'])).toBe(false)
  })
  it('recusa drag sem tipo nenhum', () => {
    expect(isPathDrop([])).toBe(false)
  })
})

// Sonda mínima com a mesma semântica do Element.closest: sobe a cadeia até achar a classe.
function el(classes: string[], parent?: { closest: (s: string) => unknown }): { closest: (s: string) => unknown } {
  const self = {
    closest: (sel: string): unknown => {
      if (classes.includes(sel.replace('.', ''))) return self
      return parent ? parent.closest(sel) : null
    }
  }
  return self
}

describe('isDropOnNode', () => {
  it('drop dentro de um nó do React Flow (ex.: xterm do TerminalNode) → true', () => {
    // xterm-screen vive dentro do .react-flow__node do TerminalNode; o alvo real do evento é
    // um descendente, por isso o closest precisa subir.
    const target = el(['xterm-screen'], el(['react-flow__node']))
    expect(isDropOnNode(target)).toBe(true)
  })
  it('o próprio nó como alvo → true', () => {
    expect(isDropOnNode(el(['react-flow__node']))).toBe(true)
  })
  it('drop no painel vazio (só o .react-flow__pane) → false', () => {
    expect(isDropOnNode(el(['react-flow__pane'], el(['react-flow'])))).toBe(false)
  })
  it('alvo nulo → false (nunca lança)', () => {
    expect(isDropOnNode(null)).toBe(false)
  })
})

describe('fileNodeDropPositions', () => {
  it('um arquivo nasce exatamente onde foi solto', () => {
    expect(fileNodeDropPositions({ x: 120, y: 40 }, 1)).toEqual([{ x: 120, y: 40 }])
  })
  it('vários arquivos empilham em cascata a partir do ponto do drop', () => {
    expect(fileNodeDropPositions({ x: 0, y: 0 }, 3)).toEqual([
      { x: 0, y: 0 },
      { x: 24, y: 24 },
      { x: 48, y: 48 }
    ])
  })
  it('nenhum arquivo → nenhuma posição', () => {
    expect(fileNodeDropPositions({ x: 10, y: 10 }, 0)).toEqual([])
  })
})
