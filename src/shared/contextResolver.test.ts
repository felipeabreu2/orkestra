import { describe, it, expect } from 'vitest'
import { resolveContextNodes, formatContextBlocks } from './contextResolver'
import type { CanvasMirror, MirrorNode } from './orchestration'

// Helpers de construção — mantêm os casos legíveis (id = name por padrão).
function note(id: string, content = ''): MirrorNode {
  return { id, type: 'note', name: id, content }
}
function terminal(id: string): MirrorNode {
  return { id, type: 'terminal', name: id }
}
function file(id: string, content = ''): MirrorNode {
  return { id, type: 'file', name: id, content }
}
function portal(id: string, content = ''): MirrorNode {
  return { id, type: 'portal', name: id, content }
}
function edge(source: string, target: string): CanvasMirror['edges'][number] {
  return { source, target }
}
const ids = (nodes: MirrorNode[]): string[] => nodes.map((n) => n.id)

describe('resolveContextNodes — travessia transitiva da cadeia de notas', () => {
  it('cadeia linear A→B→C com terminal T ligado a A devolve [A, B, C] (raiz primeiro)', () => {
    const mirror: CanvasMirror = {
      nodes: [terminal('T'), note('A'), note('B'), note('C')],
      edges: [edge('T', 'A'), edge('A', 'B'), edge('B', 'C')]
    }
    expect(ids(resolveContextNodes(mirror, 'T'))).toEqual(['A', 'B', 'C'])
  })

  it('não inclui o próprio nó de origem nem terminais', () => {
    const mirror: CanvasMirror = {
      nodes: [terminal('T'), note('A')],
      edges: [edge('T', 'A')]
    }
    const out = resolveContextNodes(mirror, 'T')
    expect(ids(out)).toEqual(['A'])
    expect(out.some((n) => n.id === 'T')).toBe(false)
  })

  it('ciclo A↔B (chain) com T→A não faz loop infinito e não duplica', () => {
    const mirror: CanvasMirror = {
      nodes: [terminal('T'), note('A'), note('B')],
      edges: [edge('T', 'A'), edge('A', 'B'), edge('B', 'A')]
    }
    expect(ids(resolveContextNodes(mirror, 'T'))).toEqual(['A', 'B'])
  })

  it('ciclo profundo A→B→C→A com T→A visita cada nota uma vez', () => {
    const mirror: CanvasMirror = {
      nodes: [terminal('T'), note('A'), note('B'), note('C')],
      edges: [edge('T', 'A'), edge('A', 'B'), edge('B', 'C'), edge('C', 'A')]
    }
    expect(ids(resolveContextNodes(mirror, 'T'))).toEqual(['A', 'B', 'C'])
  })

  it('trata o grafo como não-direcional: aresta guardada {source:B, target:A} ainda é percorrida', () => {
    const mirror: CanvasMirror = {
      nodes: [terminal('T'), note('A'), note('B')],
      // T→A normal, mas B→A invertida
      edges: [edge('T', 'A'), edge('B', 'A')]
    }
    expect(ids(resolveContextNodes(mirror, 'T'))).toEqual(['A', 'B'])
  })

  it('atravessa uma nota-índice de conteúdo vazio (a travessia é estrutural)', () => {
    const mirror: CanvasMirror = {
      nodes: [terminal('T'), note('A', ''), note('B', 'conteúdo da filha')],
      edges: [edge('T', 'A'), edge('A', 'B')]
    }
    const out = resolveContextNodes(mirror, 'T')
    // A (vazia) e B ambas incluídas — o filtro de vazio é do formatador, não do resolver.
    expect(ids(out)).toEqual(['A', 'B'])
  })

  it('vizinhos não-nota (file/portal) entram como folha de 1 salto e não são atravessados', () => {
    const mirror: CanvasMirror = {
      nodes: [terminal('T'), note('A'), file('F'), portal('P'), note('D')],
      // T ligado a A, F, P. F ligado a D (nota) — mas F não é nota, então D não deve ser alcançada por F.
      edges: [edge('T', 'A'), edge('T', 'F'), edge('T', 'P'), edge('F', 'D')]
    }
    const out = resolveContextNodes(mirror, 'T')
    expect(out.map((n) => n.id).sort()).toEqual(['A', 'F', 'P'])
    expect(out.some((n) => n.id === 'D')).toBe(false)
  })

  it('um terminal na cadeia quebra a travessia (não atravessa além dele)', () => {
    const mirror: CanvasMirror = {
      nodes: [terminal('T'), note('A'), terminal('T2'), note('D')],
      // D só é alcançável passando por outro terminal T2 → não deve entrar.
      edges: [edge('T', 'A'), edge('A', 'T2'), edge('T2', 'D')]
    }
    const out = resolveContextNodes(mirror, 'T')
    expect(ids(out)).toEqual(['A'])
    expect(out.some((n) => n.id === 'D')).toBe(false)
  })

  it('isola contexto entre terminais distintos no mesmo mirror', () => {
    const mirror: CanvasMirror = {
      nodes: [terminal('T1'), note('A'), note('B'), terminal('T2'), note('C'), note('D')],
      edges: [edge('T1', 'A'), edge('A', 'B'), edge('T2', 'C'), edge('C', 'D')]
    }
    expect(ids(resolveContextNodes(mirror, 'T1'))).toEqual(['A', 'B'])
    expect(ids(resolveContextNodes(mirror, 'T2'))).toEqual(['C', 'D'])
  })

  it('nó de origem sem arestas devolve []', () => {
    const mirror: CanvasMirror = {
      nodes: [terminal('T'), note('A'), note('B')],
      edges: [edge('A', 'B')]
    }
    expect(resolveContextNodes(mirror, 'T')).toEqual([])
  })

  it('respeita maxDepth: cadeia mais longa que o teto é truncada no limite, sem loop', () => {
    // T→A→B→C→D→E ; com maxDepth=2, alcança só A (nível 1) e B (nível 2).
    const mirror: CanvasMirror = {
      nodes: [terminal('T'), note('A'), note('B'), note('C'), note('D'), note('E')],
      edges: [edge('T', 'A'), edge('A', 'B'), edge('B', 'C'), edge('C', 'D'), edge('D', 'E')]
    }
    expect(ids(resolveContextNodes(mirror, 'T', { maxDepth: 2 }))).toEqual(['A', 'B'])
    // default (64) alcança a cadeia toda.
    expect(ids(resolveContextNodes(mirror, 'T'))).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('ignora arestas apontando para ids inexistentes (não são nota → folha ignorada na travessia)', () => {
    const mirror: CanvasMirror = {
      nodes: [terminal('T'), note('A')],
      edges: [edge('T', 'A'), edge('A', 'FANTASMA')]
    }
    expect(ids(resolveContextNodes(mirror, 'T'))).toEqual(['A'])
  })
})

describe('formatContextBlocks — formato byte-a-byte do /context', () => {
  it('formata bloco por nó no formato [contexto — <label>: <name>]\\n<content>', () => {
    const nodes: MirrorNode[] = [{ id: 'A', type: 'note', name: 'Raiz', content: 'texto raiz' }]
    expect(formatContextBlocks(nodes)).toBe('[contexto — nota: Raiz]\ntexto raiz')
  })

  it('mapeia label por tipo (note→nota, file→arquivo, portal→site, senão o próprio type)', () => {
    const nodes: MirrorNode[] = [
      { id: 'A', type: 'note', name: 'N', content: 'a' },
      { id: 'F', type: 'file', name: 'src/x.ts', content: 'b' },
      { id: 'P', type: 'portal', name: 'Site', content: 'c' },
      { id: 'X', type: 'outro', name: 'Y', content: 'd' }
    ]
    const out = formatContextBlocks(nodes)
    expect(out).toBe(
      '[contexto — nota: N]\na\n\n' +
        '[contexto — arquivo: src/x.ts]\nb\n\n' +
        '[contexto — site: Site]\nc\n\n' +
        '[contexto — outro: Y]\nd'
    )
  })

  it('filtra nós de conteúdo vazio (ou só espaços) e aplica trim ao conteúdo', () => {
    const nodes: MirrorNode[] = [
      { id: 'A', type: 'note', name: 'Vazia', content: '' },
      { id: 'B', type: 'note', name: 'Espaços', content: '   ' },
      { id: 'C', type: 'note', name: 'Cheia', content: '  conteúdo  ' }
    ]
    expect(formatContextBlocks(nodes)).toBe('[contexto — nota: Cheia]\nconteúdo')
  })

  // T9 (notas .md em disco): nota vinculada a arquivo expõe o CAMINHO no cabeçalho do bloco — o
  // agente pode ler/editar o arquivo com as próprias ferramentas (é a memória durável de fato).
  it('nota com filePath ganha o caminho no cabeçalho; sem filePath o formato é byte-idêntico ao de sempre', () => {
    const nodes: MirrorNode[] = [
      { id: 'A', type: 'note', name: 'Plano', content: 'corpo', filePath: '/proj/plano.md' },
      { id: 'B', type: 'note', name: 'Solta', content: 'x' }
    ]
    expect(formatContextBlocks(nodes)).toBe(
      '[contexto — nota: Plano — arquivo: /proj/plano.md]\ncorpo\n\n' + '[contexto — nota: Solta]\nx'
    )
  })

  it('filePath em nó não-nota é ignorado no formato (o vínculo é conceito de nota)', () => {
    const nodes: MirrorNode[] = [{ id: 'F', type: 'file', name: 'x.ts', content: 'c', filePath: '/y' }]
    expect(formatContextBlocks(nodes)).toBe('[contexto — arquivo: x.ts]\nc')
  })

  it('devolve string vazia para lista vazia', () => {
    expect(formatContextBlocks([])).toBe('')
  })

  it('junta múltiplos blocos com \\n\\n', () => {
    const nodes: MirrorNode[] = [
      { id: 'A', type: 'note', name: 'A', content: 'um' },
      { id: 'B', type: 'note', name: 'B', content: 'dois' }
    ]
    expect(formatContextBlocks(nodes)).toBe('[contexto — nota: A]\num\n\n[contexto — nota: B]\ndois')
  })
})
