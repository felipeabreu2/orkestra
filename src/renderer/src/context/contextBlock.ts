// Bloco de contexto injetado no prompt do agente quando um nó (nota/arquivo/site) é ligado a um
// terminal. Rotulado para o agente saber a origem. NÃO termina com um Enter que dispare o comando:
// o \n final é só a quebra do texto — o usuário revisa o prompt e envia quando quiser.
export function buildContextBlock(label: string, content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return ''
  return `[contexto — ${label}]\n${trimmed}\n`
}

// Texto simples a partir do HTML da nota (TipTap). Colapsa quebras excessivas e apara as pontas.
//
// SEC-1 (auditoria 2026-07-14): usa DOMParser (documento INERTE), NÃO `el.innerHTML = html`. Este
// html vem do snapshot em disco sem sanitização; atribuí-lo a innerHTML num elemento do documento
// vivo dispara `<img onerror>` e carrega recursos — e esta função roda em TODO hydrate (mirror de
// orquestração), sem interação do usuário, no renderer privilegiado (com window.orkestra ⇒
// pty.spawn). Uma nota envenenada gravada direto no <id>.json (contornando o escape do orq) viraria
// execução de comando arbitrário. parseFromString cria um documento desconectado que não executa
// scripts nem carrega recursos: extraímos só o texto.
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}
