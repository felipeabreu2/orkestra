export function isValidSshHost(host: string): boolean {
  if (typeof host !== 'string') return false
  const h = host.trim()
  if (h.length === 0 || h.length > 255) return false
  if (h.startsWith('-')) return false // evita que o ssh trate o destino como opção
  return /^[a-zA-Z0-9]([a-zA-Z0-9._@-]*[a-zA-Z0-9])?$/.test(h)
}
