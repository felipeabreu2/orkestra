// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import { buildMirror } from './useOrchestrationSync'

const edges: Edge[] = []

// Notas #10 · T1 — o nome da nota no espelho (o que o `orq list` mostra) tem que sair de
// `deriveNoteName`, a REGRA ÚNICA testada em notes/noteName.ts. O mirror reimplementava a regra
// inline e divergia do helper: o helper corta na 1ª linha, o inline mandava o texto inteiro
// truncado em 40 (juntando linhas).
describe('buildMirror — nome da nota (deriveNoteName)', () => {
  // Conteúdo multi-linha real: bloco de código (markdownToHtml emite <pre><code>, e o StarterKit do
  // TipTap também) — é onde o texto extraído tem \n de verdade e as duas regras divergem.
  it('usa só a 1ª linha do conteúdo (não o texto inteiro truncado)', () => {
    const nodes = [
      {
        id: 'n1',
        type: 'note',
        position: { x: 0, y: 0 },
        data: { html: '<pre><code>Primeira linha\nsegunda linha</code></pre>' }
      }
    ] as unknown as Node[]
    expect(buildMirror(nodes, edges).nodes[0].name).toBe('Primeira linha')
  })

  it('data.name (nome personalizado) vence o conteúdo', () => {
    const nodes = [
      { id: 'n1', type: 'note', position: { x: 0, y: 0 }, data: { name: 'Roadmap', html: '<p>outra coisa</p>' } }
    ] as unknown as Node[]
    expect(buildMirror(nodes, edges).nodes[0].name).toBe('Roadmap')
  })

  it('nota vazia cai no fallback estável "Nota"', () => {
    const nodes = [
      { id: 'n1', type: 'note', position: { x: 0, y: 0 }, data: { html: '', color: undefined } }
    ] as unknown as Node[]
    expect(buildMirror(nodes, edges).nodes[0].name).toBe('Nota')
  })

  it('mantém o teto de 40 chars do orq list', () => {
    const nodes = [
      { id: 'n1', type: 'note', position: { x: 0, y: 0 }, data: { html: `<p>${'a'.repeat(60)}</p>` } }
    ] as unknown as Node[]
    expect(buildMirror(nodes, edges).nodes[0].name).toHaveLength(40)
  })
})
