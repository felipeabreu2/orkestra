import { ORKESTRA_PATH_MIME } from '../terminal/dropPaths'

// T6 — regras de roteamento do drop no canvas, isoladas do Canvas.tsx para serem testáveis
// (o vitest deste projeto coleta src/**/*.test.ts e NÃO .tsx).

/** true quando o drag carrega o payload interno da árvore de arquivos (ORKESTRA_PATH_MIME) —
    único caso em que o canvas cria um FileNode. Drop externo do Finder (só 'Files') e texto
    arrastado são deliberadamente ignorados: o Finder não tem um caminho no dataTransfer.types,
    só um File a resolver, e o canvas não é (ainda) uma zona de importação. O drop externo já é
    neutralizado pelo handler global de App.tsx (impede o Chromium de navegar p/ file://). */
export function isPathDrop(types: readonly string[]): boolean {
  return types.includes(ORKESTRA_PATH_MIME)
}

// Só a parte de Element que interessa aqui — mantém o módulo puro/testável sem DOM.
interface ClosestLike {
  closest: (selector: string) => unknown
}

/** true quando o alvo do evento está DENTRO de um nó do React Flow. É o guard que impede a T6
    de roubar o drop da T2: soltar um arquivo em cima de um TerminalNode tem que continuar indo
    para o pty (o TerminalNode escuta drop no próprio elemento) e NÃO pode criar um FileNode por
    baixo. O drop borbulha até o wrapper do React Flow de qualquer forma — daí desambiguar pelo
    alvo, e não pela propagação. Vale para qualquer nó (nota, portal, árvore), não só terminal:
    "criar aqui" é uma ação de área vazia. */
export function isDropOnNode(target: ClosestLike | null | undefined): boolean {
  if (!target || typeof target.closest !== 'function') return false
  return target.closest('.react-flow__node') != null
}

// Deslocamento da cascata quando um drop traz vários arquivos — o suficiente para o header de
// cada nó ficar clicável (os nós têm 240x160), sem espalhá-los para longe do ponto do drop.
const CASCADE_STEP = 24

/** Posições dos N nós de um único drop. O primeiro nasce EXATAMENTE onde o mouse soltou (é a
    promessa da tarefa); os demais cascateiam a partir dali para não empilharem 100% sobrepostos
    e virarem um nó só na tela. Hoje um drag da árvore carrega sempre 1 caminho, mas
    readDroppedPaths devolve lista — tratar N aqui custa nada e evita perder arquivos em silêncio
    se a árvore ganhar seleção múltipla. */
export function fileNodeDropPositions(
  origin: { x: number; y: number },
  count: number
): { x: number; y: number }[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({
    x: origin.x + i * CASCADE_STEP,
    y: origin.y + i * CASCADE_STEP
  }))
}
