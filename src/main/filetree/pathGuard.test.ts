import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isInsideRoot, assertMutableTarget } from './pathGuard'

describe('isInsideRoot (lexical)', () => {
  it('aceita descendentes e a própria raiz', () => {
    expect(isInsideRoot('/r', '/r/a/b')).toBe(true)
    expect(isInsideRoot('/r', '/r')).toBe(true)
  })

  it('rejeita traversal e vizinhos com prefixo parecido', () => {
    expect(isInsideRoot('/r', '/r/../x')).toBe(false)
    expect(isInsideRoot('/r', '/r-outro/x')).toBe(false)
    expect(isInsideRoot('/r', '/x')).toBe(false)
  })
})

describe('assertMutableTarget (resolve symlinks)', () => {
  let dir: string
  let fora: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ork-guard-'))
    fora = mkdtempSync(join(tmpdir(), 'ork-fora-'))
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'a.txt'), 'a\n')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(fora, { recursive: true, force: true })
  })

  it('aceita alvo direto na raiz e em subpasta (mesmo com a raiz vinda de /tmp symlinkado)', async () => {
    // tmpdir() no macOS passa por symlinks (/var -> /private/var): o guard precisa realpath-ar a
    // RAIZ também, senão nada jamais estaria "dentro".
    await expect(assertMutableTarget(dir, join(dir, 'a.txt'))).resolves.toBeUndefined()
    await expect(assertMutableTarget(dir, join(dir, 'sub', 'novo.txt'))).resolves.toBeUndefined()
  })

  it('rejeita traversal (..) mesmo que o caminho comece com a raiz', async () => {
    await expect(assertMutableTarget(dir, join(dir, '..', 'x'))).rejects.toThrow(/fora da raiz/i)
  })

  it('rejeita alvo cujo PAI é symlink para fora da raiz (o vetor que o guard lexical não via)', async () => {
    symlinkSync(fora, join(dir, 'link-fora'))
    // Lexicalmente `<root>/link-fora/x` parece dentro; resolvido, o pai vive FORA. Escrever ali
    // seria escapar da raiz por symlink.
    await expect(assertMutableTarget(dir, join(dir, 'link-fora', 'x.txt'))).rejects.toThrow(
      /fora da raiz/i
    )
  })

  it('PERMITE mutar um symlink-FOLHA que aponta para fora (remove o link, não o alvo)', async () => {
    symlinkSync(fora, join(dir, 'leaf-link'))
    // O guard resolve o PAI, não a folha: excluir/renomear o próprio link é operação legítima
    // dentro da raiz (rm/rename agem no link, nunca no destino dele).
    await expect(assertMutableTarget(dir, join(dir, 'leaf-link'))).resolves.toBeUndefined()
  })

  it('rejeita a PRÓPRIA raiz (a árvore não se auto-exclui/renomeia)', async () => {
    await expect(assertMutableTarget(dir, dir)).rejects.toThrow(/raiz/i)
  })

  it('rejeita alvo com pai inexistente (criar dentro de pasta que não existe)', async () => {
    await expect(assertMutableTarget(dir, join(dir, 'nao-existe', 'x.txt'))).rejects.toBeTruthy()
  })
})
