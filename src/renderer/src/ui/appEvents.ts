// Comandos de UI globais disparados de um ponto da árvore e tratados em outro (ex.: o "+" da
// Topbar, dentro do Canvas, pede à ProjectsSidebar — sua irmã — para criar um projeto). Segue o
// padrão de window-events que o Canvas já usa para atalhos/drag. Nome em constante p/ não divergir
// entre o emissor e o ouvinte.
export const NEW_PROJECT_EVENT = 'orkestra:new-project'

export function emitNewProject(): void {
  window.dispatchEvent(new CustomEvent(NEW_PROJECT_EVENT))
}

// Batuta T5 (índice cross-projeto): a command palette pede à ProjectsSidebar — dona da troca de
// projeto (switchTo: flush + switch + hydrate) — para abrir OUTRO projeto e, quando o canvas do
// alvo estiver montado, focar um nó. Dois eventos porque a troca é assíncrona (recarrega o
// canvasStore) e o foco só pode rodar DEPOIS: a sidebar troca e então emite o frame; o Canvas —
// dono do React Flow — escuta o frame e enquadra/seleciona (mesmo caminho do onAgentFrame).
export const SWITCH_PROJECT_EVENT = 'orkestra:switch-project'
export const FRAME_NODE_EVENT = 'orkestra:frame-node'

export interface SwitchProjectDetail {
  projectId: string
  focusNodeId?: string
}

export function emitSwitchProject(projectId: string, focusNodeId?: string): void {
  window.dispatchEvent(new CustomEvent(SWITCH_PROJECT_EVENT, { detail: { projectId, focusNodeId } }))
}

export function emitFrameNode(nodeId: string): void {
  window.dispatchEvent(new CustomEvent(FRAME_NODE_EVENT, { detail: { nodeId } }))
}
