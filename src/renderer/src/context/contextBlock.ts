// Bloco de contexto injetado no prompt do agente quando um nó (nota/arquivo/site) é ligado a um
// terminal. Rotulado para o agente saber a origem. NÃO termina com um Enter que dispare o comando:
// o \n final é só a quebra do texto — o usuário revisa o prompt e envia quando quiser.
export function buildContextBlock(label: string, content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return ''
  return `[contexto — ${label}]\n${trimmed}\n`
}

// Texto simples a partir do HTML da nota (TipTap). Usa o DOM (renderer/jsdom); colapsa quebras
// excessivas e apara as pontas.
export function htmlToText(html: string): string {
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}
