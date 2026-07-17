// Template de "esquadrão" (Modo Maestro · T8): compõe, de forma PURA, a sequência de operações que
// montam uma fábrica de software canônica — Dev + Revisor + Testador + Docs, cada um conectado à
// nota-spec. Recrutar SEMPRE antes de conectar (o alvo precisa existir antes da aresta). O `orq`
// executa essas operações em SEQUÊNCIA (nunca em paralelo, como `ask --batch`), cada uma sujeita ao
// gating de Maestro (403 no servidor). Manter puro facilita o teste e reusa em outros contextos.

export type SquadOp =
  | { op: 'recruit'; name: string; preset: string; role: string }
  | { op: 'connect'; source: string; target: string }

const SQUAD_MEMBERS: ReadonlyArray<{ name: string; role: string }> = [
  { name: 'Dev', role: 'dev' },
  { name: 'Revisor', role: 'revisor' },
  { name: 'Testador', role: 'testador' },
  { name: 'Docs', role: 'docs' }
]

export function planSquad(opts: { preset: string; spec: string }): SquadOp[] {
  const ops: SquadOp[] = []
  for (const m of SQUAD_MEMBERS) {
    ops.push({ op: 'recruit', name: m.name, preset: opts.preset, role: m.role })
  }
  for (const m of SQUAD_MEMBERS) {
    ops.push({ op: 'connect', source: m.name, target: opts.spec })
  }
  return ops
}
