// Resiliência · T3 — o CORAÇÃO testável do "Reportar um Problema": monta o relatório de diagnóstico
// a partir de um input INJETADO (nenhuma leitura de process/disco aqui — determinístico), aplicando
// as duas regras que são gate de merge:
//   1. NENHUM segredo no output — nem em campos, nem DENTRO das linhas de log (redact varre tudo:
//      valores conhecidos + padrões genéricos token=/Bearer/…_API_KEY=);
//   2. NENHUM conteúdo do usuário — nada de canvas/nota/saída de terminal; só metadados e CONTAGENS
//      (o shape do DiagnosticReport nem tem onde carregar conteúdo).
// O `env` é ALLOWLIST explícito (PATH/LANG/SHELL) — o process.env inteiro nunca chega aqui inteiro,
// e o que chega ainda passa pelo filtro. Alinha com a postura "totalmente anônimo" do Maestri.

export interface DiagnosticInput {
  appVersion: string
  versions: { electron?: string; chrome?: string; node?: string }
  platform: string
  arch: string
  memory: { rssBytes: number; freeBytes: number; totalBytes: number }
  // Ambiente CRU do chamador — filtrado por allowlist aqui dentro (defesa no core, não no caller).
  env: Record<string, string | undefined>
  // Valores sensíveis CONHECIDOS no momento da coleta (ex.: o ORKESTRA_TOKEN desta sessão, que é
  // aleatório por boot) — redigidos por VALOR exato, cobrindo o caso que regex nenhuma pega.
  knownSecrets: string[]
  logs: string[]
  projectCount: number
  nodeCounts: Record<string, number>
}

export interface DiagnosticReport {
  appVersion: string
  versions: { electron?: string; chrome?: string; node?: string }
  platform: string
  arch: string
  memory: { rssBytes: number; freeBytes: number; totalBytes: number }
  env: Record<string, string>
  logs: string[]
  projectCount: number
  nodeCounts: Record<string, number>
}

const ENV_ALLOWLIST = ['PATH', 'LANG', 'SHELL'] as const
const REDACTED = '«redigido»'

// Padrões GENÉRICOS de segredo dentro de texto livre (linhas de log). Cada um captura o VALOR a
// substituir, preservando o resto da linha (o contexto é o que tem valor de diagnóstico).
const SECRET_PATTERNS: RegExp[] = [
  /\b(?:token|secret|password|senha)\s*[=:]\s*([^\s"']+)/gi,
  /\bBearer\s+([A-Za-z0-9._~+/=-]+)/gi,
  /\b[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET)[A-Z0-9_]*\s*[=:]\s*([^\s"']+)/gi
]

function redactLine(line: string, knownSecrets: string[]): string {
  let out = line
  for (const secret of knownSecrets) {
    if (secret.length > 0) out = out.split(secret).join(REDACTED)
  }
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match, value: string) => match.replace(value, REDACTED))
  }
  return out
}

export function buildDiagnosticReport(input: DiagnosticInput): DiagnosticReport {
  const env: Record<string, string> = {}
  for (const key of ENV_ALLOWLIST) {
    const v = input.env[key]
    if (typeof v === 'string') env[key] = redactLine(v, input.knownSecrets)
  }
  return {
    appVersion: input.appVersion,
    versions: {
      electron: input.versions.electron,
      chrome: input.versions.chrome,
      node: input.versions.node
    },
    platform: input.platform,
    arch: input.arch,
    memory: input.memory,
    env,
    logs: input.logs.map((l) => redactLine(l, input.knownSecrets)),
    projectCount: input.projectCount,
    nodeCounts: input.nodeCounts
  }
}
