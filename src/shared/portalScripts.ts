// Geradores PURos de scripts a executar dentro de um <webview> (Fase 9). Cada função retorna
// uma string de JS-source (uma IIFE) — nunca é executada aqui, só montada. Todo valor injetado
// (selector/text) passa por JSON.stringify, nunca concatenação crua: garante que aspas/caracteres
// especiais no valor não escapem do literal de string gerado (sem injeção de script).

export function clickScript(selector: string): string {
  return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) { el.click(); return true } return false })()`
}

export function fillScript(selector: string, text: string): string {
  return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`
}

export function snapshotScript(): string {
  return `(() => ({ url: location.href, title: document.title, text: (document.body ? document.body.innerText : '').slice(0, 4000) }))()`
}
