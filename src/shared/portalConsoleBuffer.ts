// T8 (Onda 3 dos Portais) — ring-buffer do console do portal, puro e compartilhado.
//
// O `console-message` de um site verborrágico é uma mangueira aberta: sem teto, o buffer de um
// portal esquecido numa página com log em loop cresceria sem limite (no renderer E no main, que
// guarda uma cópia por nome). Dois tetos, ambos exportados porque os testes e os DOIS lados da
// ponte precisam concordar com eles:
//  · CONSOLE_CAP — nº máximo de linhas retidas (as ÚLTIMAS N; os erros recentes valem mais que o
//    histórico antigo — mesmo raciocínio do read() da árvore: o que a UI/agente consome é o agora).
//  · CONSOLE_LINE_MAX — teto POR LINHA (um console.log de 1MB não pode inflar o buffer nem o IPC).
export const CONSOLE_CAP = 200
export const CONSOLE_LINE_MAX = 500

// Empurra uma entrada no buffer, mutando `lines` in-place (o chamador é dono do array — no
// renderer ele vive num ref por portal; devolver um array novo a cada log seria churn inútil).
// Entrada não-string vira String(...) — o evento do webview é conteúdo do SITE, não confiável.
export function pushConsole(lines: string[], entry: string, cap: number = CONSOLE_CAP): void {
  const text = typeof entry === 'string' ? entry : String(entry)
  lines.push(text.length > CONSOLE_LINE_MAX ? text.slice(0, CONSOLE_LINE_MAX) : text)
  if (lines.length > cap) lines.splice(0, lines.length - cap)
}
