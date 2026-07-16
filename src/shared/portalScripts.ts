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

// T3 — rolagem dedicada. Este é o ÚNICO script novo que injeta valores vindos do agente (x/y), então
// a barreira anti-injeção é a coerção numérica (Number + Number.isFinite): o valor entra na fonte como
// um LITERAL numérico, nunca como string crua concatenada — é o análogo do JSON.stringify de
// click/fill. Um argumento hostil como "0); alert(1)//" vira Number(...) === NaN → 0, então o pior
// caso é um scroll de 0px, jamais execução de código. Rolagem relativa (scrollBy) — casa com o modelo
// "role N px a partir daqui" do `orq portal scroll`.
export function scrollScript(x: number, y: number): string {
  const nx = Number(x)
  const ny = Number(y)
  const sx = Number.isFinite(nx) ? nx : 0
  const sy = Number.isFinite(ny) ? ny : 0
  return `(() => { window.scrollBy(${sx}, ${sy}); return true })()`
}

// T4 — snapshot do DOM interativo. Gera uma fonte PURA que, rodando no <webview>, coleta os elementos
// com que um agente interage (links/botões/campos/[role=button]/[onclick]) e devolve UMA STRING de
// linhas "[tag] <seletor sugerido> — <rótulo curto>". O seletor sugerido (tag#id / tag[name="…"] /
// tag.classe) é reutilizável direto em `orq portal click`/`fill`, eliminando o "adivinhar seletor".
//
// Segurança: (a) o único valor do agente é maxChars, coerido a inteiro finito e embutido como literal
// (mesma barreira do scrollScript) — a fonte nunca concatena string crua do agente; (b) o resultado é
// TEXTO no terminal (não é renderizado) → sem XSS; (c) cap de tamanho evita despejar uma página
// gigante; (d) o value de campos type=password é omitido (não vaza senha digitada). Os seletores/
// rótulos são lidos do DOM em runtime dentro do webview e só voltam como texto — sem superfície de
// injeção de volta.
export function domSnapshotScript(maxChars = 8000): string {
  const n = Number(maxChars)
  const cap = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 8000
  return `(() => {
    const els = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role=button],[onclick]'));
    const lines = [];
    for (const el of els) {
      const tag = el.tagName.toLowerCase();
      let sel = tag;
      if (el.id) sel = tag + '#' + el.id;
      else if (el.getAttribute && el.getAttribute('name')) sel = tag + '[name="' + el.getAttribute('name') + '"]';
      else if (typeof el.className === 'string' && el.className.trim()) sel = tag + '.' + el.className.trim().split(/\\s+/)[0];
      let label = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('placeholder'))) || el.innerText || el.value || '';
      if (el.type === 'password') label = '';
      label = String(label).replace(/\\s+/g, ' ').trim().slice(0, 80);
      lines.push('[' + tag + '] ' + sel + (label ? ' — ' + label : ''));
    }
    return lines.join('\\n').slice(0, ${cap});
  })()`
}
