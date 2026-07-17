// T7 (Onda 3 dos Portais) — nome do arquivo de screenshot de portal, como funções PURAS.
//
// O screenshot atravessa a ponte renderer→main como base64 e vira um PNG em os.tmpdir(); o que
// chega aqui como `name` é o NOME DO PORTAL vindo do renderer — texto de UI, não confiável como
// pedaço de path. A sanitização abaixo é a defesa: tudo que não for [A-Za-z0-9._-] vira '-', o que
// elimina separadores ('/', '\\'), '..' funcional (vira '..', mas sem separador não sobe nada — e
// ainda assim colapsamos pontos repetidos), espaços e controle. O timestamp diferencia capturas.
//
// isScreenshotOf existe para a LIMPEZA: a cada captura nova, o main apaga as anteriores DO MESMO
// portal (best-effort) — tmpdir não vira cemitério de PNG. O casamento é pelo prefixo completo
// `orkestra-portal-<sanitizado>-` + timestamp numérico + `.png`, nunca prefixo parcial: capturas
// de "Pesquisa" não podem ser apagadas por quem limpa "Pes".

const PREFIX = 'orkestra-portal-'

// Sanitiza o nome do portal para uso em filename. Nunca devolve vazio: nome que só tinha lixo
// cai no fallback 'portal' (um filename `orkestra-portal--123.png` com "nome vazio" seria
// indistinguível entre portais — pior para a limpeza).
function sanitizePortalName(name: string): string {
  const safe = name
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
  return safe.length > 0 ? safe : 'portal'
}

export function screenshotFilename(name: string, ts: number): string {
  return `${PREFIX}${sanitizePortalName(name)}-${ts}.png`
}

// Este `filename` é uma captura do portal `name`? Usado pela limpeza de capturas antigas.
export function isScreenshotOf(name: string, filename: string): boolean {
  const prefix = `${PREFIX}${sanitizePortalName(name)}-`
  if (!filename.startsWith(prefix) || !filename.endsWith('.png')) return false
  const middle = filename.slice(prefix.length, -'.png'.length)
  return /^\d+$/.test(middle)
}
