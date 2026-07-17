import { describe, it, expect } from 'vitest'
import { commitPreview, canCommit, commitConfirmText, branchNameError } from './fileTreeGitWrite'

// Onda 3 · T11. O shape de `entries` aqui NÃO é inventado: é o que FileTreeService.gitStatus
// produz a partir de um `git status --porcelain` real (chaves relativas ao toplevel, valor =
// os 2 chars de status já trimados) — ver os testes de gitStatus em FileTreeService.test.ts.
describe('commitPreview (o que a confirmação promete = semântica do `git commit -a`)', () => {
  it('inclui tracked modificado e EXCLUI untracked (??)', () => {
    const r = commitPreview({ 'src/a.ts': 'M', '.env': '??', 'README.md': 'M' })
    expect(r.included).toEqual(['README.md', 'src/a.ts'])
    // o caso que justifica `-a` em vez de `add -A`: um .env não ignorado NÃO pode entrar sozinho
    expect(r.excluded).toEqual(['.env'])
  })

  it('inclui o que o usuário já pôs em stage à mão (A = untracked que recebeu `git add`)', () => {
    // `git add novo.txt` num untracked muda o status de '??' p/ 'A' — e o `commit -a` o inclui.
    const r = commitPreview({ 'novo.txt': 'A', 'outro.txt': '??' })
    expect(r.included).toEqual(['novo.txt'])
    expect(r.excluded).toEqual(['outro.txt'])
  })

  it('inclui removido (D) e renomeado (R) — tudo que já é rastreado', () => {
    const r = commitPreview({ 'sumiu.ts': 'D', 'novo-nome.ts': 'R', 'mudou.ts': 'MM' })
    expect(r.included).toEqual(['mudou.ts', 'novo-nome.ts', 'sumiu.ts'])
    expect(r.excluded).toEqual([])
  })

  it('status vazio -> nada a commitar', () => {
    expect(commitPreview({})).toEqual({ included: [], excluded: [] })
    expect(canCommit({})).toBe(false)
    // só untracked também não dá commit: o `-a` não os pegaria e o git diria "nothing to commit"
    expect(canCommit({ 'a.txt': '??' })).toBe(false)
    expect(canCommit({ 'a.txt': 'M' })).toBe(true)
  })

  it('commitConfirmText LISTA o que entra e diz explicitamente o que fica de fora', () => {
    const t = commitConfirmText({ 'src/a.ts': 'M', '.env': '??' })
    expect(t).toContain('Commitar 1 arquivo')
    expect(t).toContain('src/a.ts')
    // o usuário precisa VER que o .env ficou de fora de propósito
    expect(t).toContain('Fora do commit')
    expect(t).toContain('.env')
    expect(t).toContain('git add')
  })

  it('commitConfirmText sem untracked não fala em exclusão (não inventa preocupação)', () => {
    const t = commitConfirmText({ 'src/a.ts': 'M', 'b.ts': 'M' })
    expect(t).toContain('Commitar 2 arquivos')
    expect(t).not.toContain('Fora do commit')
  })
})

describe('branchNameError (espelho de UX; a autoridade é o main)', () => {
  it('aceita nome válido, inclusive acentuado e com barra', () => {
    expect(branchNameError('feat/nova')).toBe('')
    expect(branchNameError('feat/acentuação')).toBe('')
    expect(branchNameError('fix-123')).toBe('')
  })

  it('recusa o vetor hostil (option injection) com mensagem específica', () => {
    // mesmo vetor coberto no main (FileTreeService.test.ts): aqui é só feedback imediato no input
    expect(branchNameError('-D')).toMatch(/começar com/i)
    expect(branchNameError('--force')).toMatch(/começar com/i)
    expect(branchNameError('-d outra')).toMatch(/começar com/i)
  })

  it('recusa vazio, espaço, .. e .lock (o que o git recusaria)', () => {
    expect(branchNameError('')).toMatch(/digite/i)
    expect(branchNameError('com espaço')).toBeTruthy()
    expect(branchNameError(' feat')).toBeTruthy()
    expect(branchNameError('x..y')).toMatch(/\.\./)
    expect(branchNameError('x.lock')).toMatch(/lock/)
    expect(branchNameError('x~1')).toBeTruthy()
    expect(branchNameError('a\nb')).toBeTruthy()
  })
})
