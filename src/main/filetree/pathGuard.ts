// Onda 3 · T13 — guard de caminho das MUTAÇÕES da árvore (criar/renomear/mover/excluir). É a
// promessa registrada na T4: o guard lexical (isInsideRoot, usado pelo write) não resolve
// symlinks; para as mutações isso vira vetor real — um symlink `<root>/link -> /etc` faria
// `<root>/link/passwd` parecer "dentro da raiz" lexicalmente, com o alvo REAL fora dela. O
// renderer é privilegiado (pty.spawn), então esta defesa vive no MAIN, nunca só na UI.

import { realpath } from 'node:fs/promises'
import { basename, dirname, resolve, sep } from 'node:path'

// Camada 1 — LEXICAL, pura e síncrona (movida de FileTreeService.ts; o `write` da T4 continua
// usando-a via re-export). Normaliza os dois lados com `resolve` (colapsa `..`/`.`) e compara o
// prefixo terminado em separador: `/r/a` casa, `/r-outro` e `/r/../x` NÃO. Não toca o disco — e
// por isso não vê symlinks.
export function isInsideRoot(root: string, target: string): boolean {
  const nRoot = resolve(root)
  const nTarget = resolve(target)
  return nTarget === nRoot || nTarget.startsWith(nRoot + sep)
}

// Camada 2 — REAL (assíncrona): valida que o alvo de uma MUTAÇÃO vive de fato sob a raiz, com
// symlinks resolvidos. Regras, e os porquês:
//
//  · realpath na RAIZ também: no macOS a raiz frequentemente já vem atravessando symlinks do
//    sistema (/tmp -> /private/tmp, /var -> /private/var); sem normalizar os DOIS lados, nada
//    jamais estaria "dentro".
//  · resolve o PAI do alvo, não a folha: excluir/renomear um symlink que aponta para fora é
//    operação LEGÍTIMA (rm/rename agem no link, nunca no destino dele). O que não pode é o
//    CAMINHO até o alvo passar por um symlink que escapa da raiz — daí realpath(dirname).
//  · o pai precisa EXISTIR: toda operação daqui exige isso de todo jeito (criar dentro de pasta
//    inexistente falharia no fs), e realpath falhando é o erro legível mais cedo.
//  · a PRÓPRIA raiz é imutável por aqui: a árvore não se auto-exclui/renomeia — remover a raiz
//    embaixo do nó que a exibe é um estado sem volta para a UI.
//
// Lança com mensagem legível; não devolve nada (as operações seguem usando o path original —
// o realpath aqui é só juiz, não reescreve o alvo).
export async function assertMutableTarget(root: string, target: string): Promise<void> {
  const nTarget = resolve(target)
  // Pré-checagem lexical: barra o óbvio (../, vizinho com prefixo) antes de tocar o disco e
  // garante mensagem estável mesmo quando o pai nem existe.
  if (!isInsideRoot(root, nTarget)) {
    throw new Error(`Operação recusada: caminho fora da raiz permitida (${target})`)
  }
  const realRoot = await realpath(resolve(root))
  let realParent: string
  try {
    realParent = await realpath(dirname(nTarget))
  } catch {
    throw new Error(`Operação recusada: a pasta de destino não existe (${dirname(nTarget)})`)
  }
  const realTarget = realParent + sep + basename(nTarget)
  if (realTarget === realRoot) {
    throw new Error('Operação recusada: a raiz da árvore não pode ser alterada por aqui.')
  }
  if (!realTarget.startsWith(realRoot + sep)) {
    throw new Error(
      `Operação recusada: caminho fora da raiz permitida após resolver symlinks (${target})`
    )
  }
}
