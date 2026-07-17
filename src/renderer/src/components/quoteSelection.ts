import type { Edge } from '@xyflow/react'

// Parte PURA (sem React/DOM) do fecho "citar seleção → agente conectado" (Onda 2 · T5): resolver o
// terminal-alvo a partir de nodes+edges e montar o rótulo da citação. A UI (botão na seleção,
// leitura de textarea.selectionStart/End, escrita no pty via terminalRegistry) fica no FileEditor;
// aqui vive só o que dá para testar sem montar componente. O bloco final ("[contexto — …]") é
// montado com buildContextBlock (context/contextBlock.ts, já testado) — não reimplementamos aqui.

/**
 * Resolve o PRIMEIRO terminal ligado por aresta ao nó `nodeId` (aresta em qualquer direção:
 * `nodeId` como source OU target). Filtra pelo conjunto `terminalIds` (ids de nós do tipo terminal)
 * porque uma árvore pode estar ligada também a notas/portais/outras árvores — e só um terminal tem
 * um pty onde injetar a citação. Auto-loops (aresta do nó para ele mesmo) são ignorados.
 *
 * Política p/ MÚLTIPLOS terminais ligados: retorna o primeiro na ordem das arestas — determinístico
 * e simples; um seletor explícito de destino fica para evolução futura. Sem terminal ligado →
 * `undefined` (a UI desabilita/avisa o botão de citar).
 *
 * Desvio deliberado do exemplo do plano (que passava só `edges`): recebemos também `terminalIds`.
 * Sem isso a função devolveria o outro lado da primeira aresta mesmo sendo uma NOTA/portal, e a
 * citação seria escrita num nó sem pty (ou no lugar errado). O filtro por tipo é obrigatório para o
 * comportamento correto — o custo é um `Set` já disponível no chamador (nodes do store).
 */
export function resolveConnectedTerminal(
  nodeId: string,
  edges: readonly Pick<Edge, 'source' | 'target'>[],
  terminalIds: ReadonlySet<string>
): string | undefined {
  for (const edge of edges) {
    let other: string
    if (edge.source === nodeId) other = edge.target
    else if (edge.target === nodeId) other = edge.source
    else continue
    if (other === nodeId) continue // auto-loop: não é vizinho
    if (terminalIds.has(other)) return other
  }
  return undefined
}

export interface LineRange {
  startLine: number
  endLine: number
}

/**
 * Intervalo de linhas (1-based) coberto por uma seleção `[start, end)` sobre `text` — para rotular a
 * citação (ex.: "a.ts:L12-20"). `start`/`end` são offsets de caractere (textarea.selectionStart/End).
 * A linha de um offset é 1 + (nº de `\n` antes dele). O `end` é EXCLUSIVO: quando a seleção termina
 * logo após um `\n`, a linha "vazia" seguinte não conta (usamos `end-1`, nunca antes de `start`).
 * Offsets fora de `[0, text.length]` são grampeados; `end < start` degrada para uma seleção pontual.
 */
export function selectionLineRange(text: string, start: number, end: number): LineRange {
  const s = Math.max(0, Math.min(start, text.length))
  const e = Math.max(s, Math.min(end, text.length))
  const lineAt = (offset: number): number => {
    let line = 1
    for (let i = 0; i < offset; i++) if (text[i] === '\n') line++
    return line
  }
  return { startLine: lineAt(s), endLine: lineAt(Math.max(s, e - 1)) }
}

// Último segmento não-vazio do path (POSIX e Windows) — mesmo critério do basename usado no
// FileTreeNode; duplicado aqui de propósito para manter o helper puro e sem import de componente.
function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/**
 * Rótulo legível da citação a partir do caminho + intervalo de linhas: "<arquivo>:L<n>" numa linha
 * só, ou "<arquivo>:L<a>-<b>" em várias. É o `label` passado a buildContextBlock.
 */
export function quoteLabel(path: string, range: LineRange): string {
  const base = basename(path)
  return range.startLine === range.endLine
    ? `${base}:L${range.startLine}`
    : `${base}:L${range.startLine}-${range.endLine}`
}
