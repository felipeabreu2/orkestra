// SEC-3 (auditoria 2026-07-14): um portal é um navegador web embutido — só deve carregar http/https
// quando a URL vem de uma fonte NÃO confiável (um agente via `orq portal open/navigate`). Sem esta
// checagem, `orq portal open X "file:///Users/.../.ssh/id_rsa"` carregava o arquivo local no portal
// e `orq portal snapshot` devolvia o conteúdo; `javascript:`/`data:` executariam script no contexto
// (potencialmente autenticado) do portal. Aceita URL SEM esquema (o webview resolve p/ http/https),
// mas nunca um esquema não-web explícito. Espelha o isSafeHref do markdown, porém sem `mailto`
// (irrelevante para um portal navegável).
export function isSafePortalUrl(url: string): boolean {
  // Remove caracteres de controle (código < 0x20 ou 0x7F) usados para ofuscar o esquema
  // (ex.: "java\tscript:"), sem embutir bytes de controle no próprio fonte.
  const clean = Array.from(url)
    .filter((c) => {
      const code = c.charCodeAt(0)
      return code > 0x1f && code !== 0x7f
    })
    .join('')
    .trim()
  if (!clean) return false
  const m = clean.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
  if (!m) return true // sem esquema → host/relativo, o webview normaliza para http(s)
  const scheme = m[1].toLowerCase()
  return scheme === 'http' || scheme === 'https'
}
