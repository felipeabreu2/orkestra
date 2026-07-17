// Resiliência · T1 — reset de FOCO, puro (DOM apenas; nada de store/IPC). O canvas hospeda xterms
// e webviews que capturam o teclado; quando um deles "prende" o foco (bug a eliminar, não
// contornar — isto é o paliativo de 1 gesto), os atalhos do app param de responder e o usuário
// acha que o app travou. O reset solta o elemento ativo e devolve o foco ao pane do React Flow —
// e NÃO toca em nós/edges: é puramente foco, nunca custa trabalho.

// O elemento ativo é de um tipo que captura teclado? (xterm, webview, input, contenteditable)
function isFocusTrap(el: Element): boolean {
  if (el.closest('.xterm')) return true
  const tag = el.tagName
  if (tag === 'WEBVIEW' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el instanceof HTMLElement && el.isContentEditable) return true
  return false
}

export function resetFocus(pane: HTMLElement | null): void {
  const active = document.activeElement
  if (active instanceof HTMLElement && active !== document.body && isFocusTrap(active)) {
    active.blur()
  }
  pane?.focus({ preventScroll: true })
}
