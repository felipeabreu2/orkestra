const MAX_NAME = 40

/**
 * Normaliza o nome digitado no rename inline da nota (Notas #10 · T2): apara as pontas, colapsa
 * espaços internos e trunca em 40. String vazia (ou só espaços) → `''`, o sinal de "voltar à
 * nomeação automática pela 1ª linha" (o store apaga `data.name` nesse caso). Função pura.
 */
export function normalizeNoteName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME)
}
