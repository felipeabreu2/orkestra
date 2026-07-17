// Formatação de uma linha do `orq list` (Terminais · T3b). O espelho SEMPRE carregou o papel de
// cada nó (MirrorNode.role), mas a linha só imprimia type/name/id — o agente nunca via com quem
// estava falando. O papel entra como 4ª coluna, DEPOIS do id: as três primeiras seguem idênticas,
// então quem já consome a saída (por prefixo/colunas) não quebra.
//
// Omitido quando ausente ou em branco: o buildMirror do renderer normaliza nós sem papel para
// role: '' (não undefined), e uma coluna vazia pendurada só faria ruído para o agente.
export function formatListLine(node: { type: string; name: string; id: string; role?: string }): string {
  const base = `${node.type}\t${node.name}\t${node.id}`
  const role = node.role?.trim()
  return role ? `${base}\t${role}` : base
}
