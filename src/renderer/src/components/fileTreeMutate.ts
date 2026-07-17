// Onda 3 · T13 — lógica pura do menu de mutação da árvore (validação-espelho da UI, extraída de
// FileTreeNode.tsx porque o vitest não coleta `.tsx`). A AUTORIDADE é o MAIN (pathGuard resolve
// symlinks e revalida tudo); isto aqui existe para o erro aparecer ENQUANTO o usuário digita, não
// depois do clique. Mesmo padrão da dupla branchNameError (renderer) / isSafeBranchName (main).

// Controle (C0 + DEL) em nome/caminho de arquivo é sempre acidente — rejeitado nas duas validações.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

// Diretório-pai de um path POSIX ('/a/b.txt' -> '/a'). Tolerante a barra final; o app é
// macOS-primeiro (mesma premissa do relativeToRoot em fileTreeGit.ts).
export function parentDir(path: string): string {
  const trimmed = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  const idx = trimmed.lastIndexOf('/')
  if (idx <= 0) return '/'
  return trimmed.slice(0, idx)
}

// Valida um NOME SIMPLES (novo arquivo / nova pasta). '' = ok; senão, a mensagem para a UI.
// Separador é rejeitado de propósito: o campo nomeia UMA entrada no diretório-alvo — quem quer
// criar em outra pasta clica na outra pasta (e mover é o gesto de renomear).
export function nameError(name: string): string {
  if (name.trim().length === 0) return 'informe um nome'
  if (/[/\\]/.test(name)) return 'o nome não pode conter separador (/ ou \\)'
  if (name === '.' || name === '..') return `"${name}" não é um nome válido`
  if (CONTROL_CHARS.test(name)) return 'o nome contém caracteres de controle'
  return ''
}

// Valida o destino RELATIVO à raiz do renomear/mover. Aceita subpastas ('src/novo.ts'); rejeita
// absoluto e qualquer traversal — a raiz é o teto por construção já na UI (o main revalida com
// symlinks resolvidos).
export function relTargetError(rel: string): string {
  if (rel.trim().length === 0) return 'informe o destino (relativo à raiz da árvore)'
  if (rel.startsWith('/')) return 'use um caminho relativo à raiz da árvore, não absoluto'
  if (CONTROL_CHARS.test(rel)) return 'o destino contém caracteres de controle'
  const segments = rel.split('/')
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    return 'o destino não pode ter segmentos vazios, "." ou ".."'
  }
  return ''
}

// Junta raiz absoluta + caminho relativo com exatamente uma barra.
export function joinUnderRoot(root: string, rel: string): string {
  const base = root.endsWith('/') ? root.slice(0, -1) : root
  return `${base}/${rel}`
}
