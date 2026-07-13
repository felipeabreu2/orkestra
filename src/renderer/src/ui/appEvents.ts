// Comandos de UI globais disparados de um ponto da árvore e tratados em outro (ex.: o "+" da
// Topbar, dentro do Canvas, pede à ProjectsSidebar — sua irmã — para criar um projeto). Segue o
// padrão de window-events que o Canvas já usa para atalhos/drag. Nome em constante p/ não divergir
// entre o emissor e o ouvinte.
export const NEW_PROJECT_EVENT = 'orkestra:new-project'

export function emitNewProject(): void {
  window.dispatchEvent(new CustomEvent(NEW_PROJECT_EVENT))
}
