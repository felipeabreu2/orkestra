import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FileTreeService,
  gitCommitArgs,
  gitCreateBranchArgs,
  gitSwitchArgs,
  isInsideRoot,
  isSafeBranchName,
  MAX_DIFF_LINES
} from './FileTreeService'

describe('FileTreeService', () => {
  let dir: string
  const svc = new FileTreeService()
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ork-ft-'))
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'README.md'), '# hi\n')
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1\n')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('list devolve pastas antes de arquivos, ordenado, com isDir', async () => {
    const e = await svc.list(dir)
    expect(e[0]).toMatchObject({ name: 'src', isDir: true })
    expect(e.some((x) => x.name === 'README.md' && !x.isDir)).toBe(true)
  })

  it('list ordena alfabeticamente (case-insensitive) dentro de cada grupo', async () => {
    writeFileSync(join(dir, 'zebra.txt'), 'z\n')
    writeFileSync(join(dir, 'Apple.txt'), 'a\n')
    mkdirSync(join(dir, 'Zdir'))
    mkdirSync(join(dir, 'adir'))
    const e = await svc.list(dir)
    const dirs = e.filter((x) => x.isDir).map((x) => x.name)
    const files = e.filter((x) => !x.isDir).map((x) => x.name)
    expect(dirs).toEqual(['adir', 'src', 'Zdir'])
    expect(files).toEqual(['Apple.txt', 'README.md', 'zebra.txt'])
    // pastas sempre antes de arquivos, independente da ordem alfabética
    expect(e.findIndex((x) => !x.isDir)).toBeGreaterThan(e.map((x) => x.isDir).lastIndexOf(true))
  })

  it('list devolve o path absoluto (join de dir + name)', async () => {
    const e = await svc.list(dir)
    const readme = e.find((x) => x.name === 'README.md')
    expect(readme?.path).toBe(join(dir, 'README.md'))
  })

  it('list rejeita para um diretorio inexistente', async () => {
    await expect(svc.list(join(dir, 'nao-existe'))).rejects.toBeTruthy()
  })

  it('read devolve o conteudo de um arquivo de texto', async () => {
    const r = await svc.read(join(dir, 'README.md'))
    expect(r.content).toContain('# hi')
    expect(r.binary).toBe(false)
    expect(r.truncated).toBe(false)
  })

  it('read marca truncated quando excede o cap', async () => {
    writeFileSync(join(dir, 'big.txt'), 'x'.repeat(300 * 1024))
    const r = await svc.read(join(dir, 'big.txt'))
    expect(r.truncated).toBe(true)
    expect(r.content.length).toBeLessThanOrEqual(256 * 1024)
  })

  it('read detecta binario via byte NUL nos primeiros bytes', async () => {
    const buf = Buffer.concat([Buffer.from('abc'), Buffer.from([0]), Buffer.from('def')])
    writeFileSync(join(dir, 'bin.dat'), buf)
    const r = await svc.read(join(dir, 'bin.dat'))
    expect(r.binary).toBe(true)
    expect(r.content).toBe('')
    expect(r.truncated).toBe(false)
  })

  it('read de arquivo vazio nao quebra e nao marca binario', async () => {
    writeFileSync(join(dir, 'empty.txt'), '')
    const r = await svc.read(join(dir, 'empty.txt'))
    expect(r.content).toBe('')
    expect(r.binary).toBe(false)
    expect(r.truncated).toBe(false)
  })

  it('write grava o conteúdo e read devolve exatamente o que foi escrito (idempotente)', async () => {
    const p = join(dir, 'src', 'a.ts')
    await svc.write(p, 'export const a = 2\n', dir)
    const r1 = await svc.read(p)
    expect(r1.content).toBe('export const a = 2\n')
    // idempotente: gravar de novo o mesmo conteúdo mantém a leitura estável
    await svc.write(p, 'export const a = 2\n', dir)
    const r2 = await svc.read(p)
    expect(r2.content).toBe('export const a = 2\n')
  })

  it('write cria um arquivo NOVO dentro da raiz', async () => {
    const p = join(dir, 'src', 'novo.ts')
    await svc.write(p, 'const x = 1\n', dir)
    expect((await svc.read(p)).content).toBe('const x = 1\n')
  })

  it('write REJEITA um caminho fora da raiz (path traversal) e não deixa .orktmp', async () => {
    const outside = join(dir, '..', 'fora.txt')
    await expect(svc.write(outside, 'x', dir)).rejects.toThrow(/fora da raiz/)
    expect(existsSync(`${outside}.orktmp`)).toBe(false)
  })

  it('isInsideRoot: aceita dentro/igual, recusa traversal e prefixo-irmão', () => {
    expect(isInsideRoot('/r', '/r/a/b')).toBe(true)
    expect(isInsideRoot('/r', '/r')).toBe(true)
    expect(isInsideRoot('/r', '/r/../x')).toBe(false)
    expect(isInsideRoot('/r', '/r-outro/a')).toBe(false)
    expect(isInsideRoot('/r', '/outro')).toBe(false)
  })

  it('gitStatus vazio p/ dir sem git; reporta modificados num repo', async () => {
    expect(await svc.gitStatus(dir)).toEqual({ prefix: '', entries: {} })
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: dir })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
    writeFileSync(join(dir, 'README.md'), '# changed\n')
    const st = await svc.gitStatus(dir)
    expect(st.entries['README.md']).toBeTruthy() // 'M'
  })

  it('gitStatus reporta arquivo novo/nao rastreado como "??"', async () => {
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: dir })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
    writeFileSync(join(dir, 'novo.txt'), 'novo\n')
    const st = await svc.gitStatus(dir)
    expect(st.entries['novo.txt']).toBe('??')
  })

  it('gitStatus preserva nome de arquivo nao-ASCII (acentuado) como chave UTF-8 real', async () => {
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: dir })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    // git default `core.quotePath=true` escaparia isto em octal ("caf\303\251.txt") no --porcelain;
    // a chave precisa voltar como o nome UTF-8 real p/ casar com o path no renderer.
    const accented = 'café.txt'
    writeFileSync(join(dir, accented), 'a\n')
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
    writeFileSync(join(dir, accented), '# changed\n')
    const st = await svc.gitStatus(dir)
    expect(st.entries[accented]).toBeTruthy() // 'M', com a chave exatamente 'café.txt'
    expect(Object.keys(st.entries).some((k) => k.includes('café'))).toBe(true)
  })

  it('gitStatus resolve prefixo do subdiretório do repo (regressão: overlay em raiz ≠ toplevel)', async () => {
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: dir })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    mkdirSync(join(dir, 'sub', 'deep'), { recursive: true })
    writeFileSync(join(dir, 'sub', 'deep', 'a.txt'), 'a\n')
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
    writeFileSync(join(dir, 'sub', 'deep', 'a.txt'), '# changed\n')

    // Raiz da árvore = subdiretório: `git status --porcelain` devolve paths relativos ao TOPLEVEL
    // ('sub/deep/a.txt'), então o overlay só casa se soubermos o prefixo do subdir dentro do repo.
    const st = await svc.gitStatus(join(dir, 'sub'))
    expect(st.prefix).toBe('sub/')
    expect(st.entries['sub/deep/a.txt']).toBeTruthy() // 'M'

    // Raiz = toplevel: prefixo vazio, comportamento preservado.
    const top = await svc.gitStatus(dir)
    expect(top.prefix).toBe('')
    expect(top.entries['sub/deep/a.txt']).toBeTruthy()
  })

  // ── Onda 3 · T8: branch + diff (leitura pura) ──────────────────────────────────────────────
  // Helper local (mesmo idioma dos testes de gitStatus acima): repo git REAL num tmpdir. Sem
  // fabricar shape — o que o git de verdade imprime é exatamente o que o serviço parseia.
  const initRepo = (at: string): void => {
    const g = (a: string[]): void => {
      execFileSync('git', a, { cwd: at })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    g(['add', '.'])
    g(['commit', '-qm', 'i'])
  }

  it('gitBranch devolve "" fora de repo e o nome da branch dentro de um repo real', async () => {
    expect(await svc.gitBranch(dir)).toBe('')
    initRepo(dir)
    const branch = await svc.gitBranch(dir)
    expect(branch).toBeTruthy()
    // Não fixamos 'main' (depende do init.defaultBranch do ambiente/CI); fixamos que é um nome
    // de branch de verdade e que bate com o que o próprio git reporta.
    expect(branch).toBe(execFileSync('git', ['branch', '--show-current'], { cwd: dir }).toString().trim())
  })

  it('gitBranch acompanha a troca de branch (checkout -b)', async () => {
    initRepo(dir)
    execFileSync('git', ['checkout', '-qb', 'feat/acentuação'], { cwd: dir })
    expect(await svc.gitBranch(dir)).toBe('feat/acentuação')
  })

  it('gitBranch de um SUBdiretório do repo devolve a mesma branch (raiz ≠ toplevel)', async () => {
    initRepo(dir)
    execFileSync('git', ['checkout', '-qb', 'topico'], { cwd: dir })
    expect(await svc.gitBranch(join(dir, 'src'))).toBe('topico')
  })

  it('gitDiff devolve vazio fora de repo e sem alterações', async () => {
    expect(await svc.gitDiff(dir)).toEqual({ text: '', truncated: false })
    initRepo(dir)
    expect(await svc.gitDiff(dir)).toEqual({ text: '', truncated: false })
  })

  it('gitDiff inclui o hunk (+/-) de um arquivo modificado', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\n')
    const d = await svc.gitDiff(dir)
    expect(d.truncated).toBe(false)
    expect(d.text).toContain('src/a.ts')
    expect(d.text).toContain('@@')
    expect(d.text).toContain('-export const a = 1')
    expect(d.text).toContain('+export const a = 2')
  })

  it('gitDiff inclui alterações JÁ EM STAGE (diff vs HEAD, não só working tree)', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 3\n')
    execFileSync('git', ['add', 'src/a.ts'], { cwd: dir })
    const d = await svc.gitDiff(dir)
    expect(d.text).toContain('+export const a = 3')
  })

  it('gitDiff com `path` limita o diff àquele arquivo', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\n')
    writeFileSync(join(dir, 'README.md'), '# outro\n')
    const only = await svc.gitDiff(dir, join(dir, 'src', 'a.ts'))
    expect(only.text).toContain('src/a.ts')
    expect(only.text).not.toContain('README.md')
  })

  it('gitDiff preserva nome não-ASCII (core.quotePath=false)', async () => {
    const accented = 'café.txt'
    writeFileSync(join(dir, accented), 'a\n')
    initRepo(dir)
    writeFileSync(join(dir, accented), 'b\n')
    const d = await svc.gitDiff(dir)
    expect(d.text).toContain('café.txt')
    expect(d.text).not.toContain('\\303')
  })

  it('gitDiff trunca diff gigante no teto de linhas e marca truncated', async () => {
    writeFileSync(join(dir, 'grande.txt'), Array.from({ length: 5000 }, (_, i) => `l${i}`).join('\n'))
    initRepo(dir)
    writeFileSync(join(dir, 'grande.txt'), Array.from({ length: 5000 }, (_, i) => `L${i}`).join('\n'))
    const d = await svc.gitDiff(dir)
    expect(d.truncated).toBe(true)
    expect(d.text.split('\n').length).toBeLessThanOrEqual(MAX_DIFF_LINES)
  })

  it('gitDiff de um arquivo NOVO (untracked) não quebra e devolve vazio p/ ele', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'novo.txt'), 'novo\n')
    const d = await svc.gitDiff(dir)
    // `git diff HEAD` ignora untracked — o que importa é não lançar; o overlay da árvore (??) é
    // quem sinaliza arquivo novo.
    expect(d.truncated).toBe(false)
    expect(d.text).not.toContain('novo.txt')
  })

  it('gitBranch/gitDiff NÃO escrevem no repo (leitura pura): status intacto antes/depois', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\n')
    const before = execFileSync('git', ['status', '--porcelain'], { cwd: dir }).toString()
    const headBefore = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString()
    await svc.gitBranch(dir)
    await svc.gitDiff(dir)
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: dir }).toString()).toBe(before)
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString()).toBe(headBefore)
  })

  // ── Onda 3 · T11: git de ESCRITA (commit / branch / checkout) ──────────────────────────────
  // Primeira coisa da árvore que muta o REPOSITÓRIO do usuário. Todo teste roda contra um repo
  // git REAL (mesmo helper `initRepo` acima) — nada de fixture com shape fabricado.
  const head = (at: string): string =>
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: at }).toString().trim()

  it('isSafeBranchName: recusa vazio, `-` inicial, espaço e caracteres de controle', () => {
    expect(isSafeBranchName('feat/nova')).toBe(true)
    expect(isSafeBranchName('acentuação')).toBe(true)
    expect(isSafeBranchName('')).toBe(false)
    expect(isSafeBranchName('   ')).toBe(false)
    // ── vetor hostil: option injection. O git faz getopt no PRÓPRIO argv, então `execFile` com
    // array NÃO protege — um nome começando com `-` viraria FLAG (`-D` = deletar branch).
    expect(isSafeBranchName('-D')).toBe(false)
    expect(isSafeBranchName('--force')).toBe(false)
    expect(isSafeBranchName('-d outra')).toBe(false)
    // whitespace nas pontas e controle: o git recusaria, mas recusamos antes p/ erro legível
    expect(isSafeBranchName(' feat')).toBe(false)
    expect(isSafeBranchName('feat ')).toBe(false)
    expect(isSafeBranchName('a\nb')).toBe(false)
    expect(isSafeBranchName('a\tb')).toBe(false)
  })

  // ── SEGUNDA camada da defesa de option injection, testada SOZINHA ────────────────────────────
  // A primeira camada (isSafeBranchName) barra o vetor hostil antes de o git rodar, o que MASCARA
  // o `--` nos testes de ponta a ponta: removê-lo do argv não quebrava teste nenhum (descoberto
  // mutando o código). Estes testes exercitam o argv diretamente, então a defesa em profundidade
  // não pode ser removida em silêncio.
  it('gitCreateBranchArgs/gitSwitchArgs põem `--` IMEDIATAMENTE antes do posicional', () => {
    const b = gitCreateBranchArgs('/repo', 'feat/x')
    expect(b).toEqual(['-C', '/repo', 'branch', '--', 'feat/x'])
    expect(b[b.length - 2]).toBe('--') // o `--` encosta no nome: nada pode se meter no meio
    const s = gitSwitchArgs('/repo', 'feat/x')
    expect(s).toEqual(['-C', '/repo', 'switch', '--', 'feat/x'])
    expect(s[s.length - 2]).toBe('--')
    // `switch`, jamais `checkout`: `git checkout -- <x>` RESTAURA o arquivo <x> (destrutivo).
    expect(s).toContain('switch')
    expect(s).not.toContain('checkout')
  })

  it('args de escrita: `--` neutraliza nome hostil, e NENHUM comando destrutivo é montado', () => {
    // Mesmo se a validação afrouxasse e um `-D` chegasse até aqui, o `--` já encerrou o getopt:
    // o git lê '-D' como NOME de branch (e o recusa), nunca como a flag de deletar.
    for (const hostil of ['-D', '--force', '-f']) {
      expect(gitCreateBranchArgs('/repo', hostil).indexOf('--')).toBeLessThan(
        gitCreateBranchArgs('/repo', hostil).lastIndexOf(hostil)
      )
      expect(gitSwitchArgs('/repo', hostil).indexOf('--')).toBeLessThan(
        gitSwitchArgs('/repo', hostil).lastIndexOf(hostil)
      )
    }
    // Nenhum argv desta tarefa pode conter algo que descarte trabalho do usuário.
    const todos = [
      gitCommitArgs('/repo', 'msg'),
      gitCreateBranchArgs('/repo', 'x'),
      gitSwitchArgs('/repo', 'x')
    ]
    for (const args of todos) {
      for (const proibido of ['--force', '-f', '-D', '--hard', 'reset', 'clean', '--discard-changes', 'push', 'pull', 'fetch']) {
        expect(args).not.toContain(proibido)
      }
    }
  })

  it('gitCommitArgs: `-a` (não `add -A`), mensagem como VALOR de -m, e `--` no fim', () => {
    expect(gitCommitArgs('/repo', 'minha msg')).toEqual([
      '-c',
      'core.quotePath=false',
      '-C',
      '/repo',
      'commit',
      '-a',
      '-m',
      'minha msg',
      '--'
    ])
    // mensagem hostil vai como valor de `-m` (o argv seguinte), não como flag solta
    const a = gitCommitArgs('/repo', '--amend')
    expect(a[a.indexOf('-m') + 1]).toBe('--amend')
    expect(a).not.toContain('-A')
  })

  it('gitCommit cria um commit novo (HEAD muda) com a mensagem dada e limpa o status', async () => {
    initRepo(dir)
    const before = head(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\n')
    const r = await svc.gitCommit(dir, 'muda a')
    const after = head(dir)
    expect(after).not.toBe(before)
    expect(r.head).toBe(after)
    expect(execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd: dir }).toString().trim()).toBe(
      'muda a'
    )
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: dir }).toString()).toBe('')
  })

  it('gitCommit inclui TRACKED modificado e NÃO inclui untracked (semântica commit -a)', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\n')
    writeFileSync(join(dir, '.env'), 'SECRET=nao-commitar\n')
    await svc.gitCommit(dir, 'só o tracked')
    const files = execFileSync('git', ['show', '--name-only', '--pretty=', 'HEAD'], { cwd: dir })
      .toString()
      .trim()
      .split('\n')
    expect(files).toContain('src/a.ts')
    expect(files).not.toContain('.env')
    // o untracked continua lá, fora do commit — é isso que impede um `add -A` cego de varrer
    // segredo/artefato para dentro do histórico do usuário.
    expect((await svc.gitStatus(dir)).entries['.env']).toBe('??')
  })

  it('gitCommit inclui o que o usuário JÁ tinha em stage (inclusive untracked adicionado à mão)', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'novo.txt'), 'novo\n')
    execFileSync('git', ['add', 'novo.txt'], { cwd: dir })
    await svc.gitCommit(dir, 'com stage manual')
    const files = execFileSync('git', ['show', '--name-only', '--pretty=', 'HEAD'], { cwd: dir })
      .toString()
    expect(files).toContain('novo.txt')
  })

  it('gitCommit com nada a commitar reporta erro LEGÍVEL (não engole em silêncio)', async () => {
    initRepo(dir)
    await expect(svc.gitCommit(dir, 'nada')).rejects.toThrow(/nothing to commit/i)
    // o `nothing to commit` do git sai em STDOUT (não stderr) com exit≠0 — se o erro só olhasse
    // stderr, a mensagem voltaria vazia e o usuário veria um "falhou" mudo.
  })

  it('gitCommit recusa mensagem vazia/só-espaço com erro legível, sem tocar no HEAD', async () => {
    initRepo(dir)
    const before = head(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\n')
    await expect(svc.gitCommit(dir, '   ')).rejects.toThrow(/mensagem/i)
    expect(head(dir)).toBe(before)
  })

  it('gitCommit aceita mensagem começando com `-` como MENSAGEM (não como flag)', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\n')
    await svc.gitCommit(dir, '--force')
    expect(execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd: dir }).toString().trim()).toBe(
      '--force'
    )
  })

  it('gitCommit NÃO injeta nada na mensagem (sem Co-Authored-By, autor = config do usuário)', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 2\n')
    await svc.gitCommit(dir, 'mensagem limpa')
    const body = execFileSync('git', ['log', '-1', '--pretty=%B'], { cwd: dir }).toString()
    expect(body.trim()).toBe('mensagem limpa')
    expect(body).not.toMatch(/Co-Authored-By/i)
    expect(execFileSync('git', ['log', '-1', '--pretty=%an <%ae>'], { cwd: dir }).toString().trim()).toBe(
      't <t@t>'
    )
  })

  it('gitCreateBranch cria a branch e gitCheckout a torna a atual (gitBranch acompanha)', async () => {
    initRepo(dir)
    const original = await svc.gitBranch(dir)
    await svc.gitCreateBranch(dir, 'feat/nova')
    // criar NÃO troca: quem está na branch antiga continua nela até pedir o checkout.
    expect(await svc.gitBranch(dir)).toBe(original)
    await svc.gitCheckout(dir, 'feat/nova')
    expect(await svc.gitBranch(dir)).toBe('feat/nova')
    expect(await svc.gitCheckout(dir, original)).toBeUndefined()
    expect(await svc.gitBranch(dir)).toBe(original)
  })

  it('gitCreateBranch aceita nome acentuado (projeto em português)', async () => {
    initRepo(dir)
    await svc.gitCreateBranch(dir, 'feat/acentuação')
    await svc.gitCheckout(dir, 'feat/acentuação')
    expect(await svc.gitBranch(dir)).toBe('feat/acentuação')
  })

  it('gitCreateBranch recusa nome inválido para o git (erro legível, branch não nasce)', async () => {
    initRepo(dir)
    await expect(svc.gitCreateBranch(dir, 'com espaço')).rejects.toThrow(/inválido/i)
    await expect(svc.gitCreateBranch(dir, 'x..y')).rejects.toThrow(/inválido/i)
    await expect(svc.gitCreateBranch(dir, 'x.lock')).rejects.toThrow(/inválido/i)
    expect(execFileSync('git', ['branch', '--list'], { cwd: dir }).toString()).not.toContain('x')
  })

  it('gitCheckout com working tree SUJO reporta o erro do git (não força, não descarta trabalho)', async () => {
    initRepo(dir)
    await svc.gitCreateBranch(dir, 'outra')
    // conflito real: o arquivo difere entre as branches E está sujo no working tree
    writeFileSync(join(dir, 'src', 'a.ts'), 'na outra\n')
    await svc.gitCommit(dir, 'commit na atual')
    await svc.gitCheckout(dir, 'outra')
    writeFileSync(join(dir, 'src', 'a.ts'), 'trabalho nao salvo\n')
    const original = execFileSync('git', ['branch', '--list'], { cwd: dir })
      .toString()
      .split('\n')
      .map((l) => l.replace(/^[*+ ]+/, '').trim())
      .filter((b) => b && b !== 'outra')[0]
    await expect(svc.gitCheckout(dir, original)).rejects.toThrow(/would be overwritten|local changes/i)
    // o trabalho NÃO commitado continua intacto: nada de -f/reset --hard por baixo dos panos
    expect(readFileSync(join(dir, 'src', 'a.ts')).toString()).toBe('trabalho nao salvo\n')
    expect(await svc.gitBranch(dir)).toBe('outra')
  })

  // ── VETOR HOSTIL (option injection) — espelha o caso `-oProxyCommand` de scp.test.ts ──────────
  // `execFile` com array não protege: quem faz getopt é o git, nos próprios argumentos. Um nome de
  // branch `-D` sem defesa viraria `git branch -D <alvo>` = DELETAR branch (trabalho do usuário no
  // lixo). Defesa dupla: isSafeBranchName barra o `-` inicial ANTES, e o `--` antes de todo
  // posicional encerra o getopt do git.
  it('gitCreateBranch RECUSA nome hostil (-D, --force, -d) sem executar o git', async () => {
    initRepo(dir)
    await svc.gitCreateBranch(dir, 'vitima')
    const antes = execFileSync('git', ['branch', '--list'], { cwd: dir }).toString()
    for (const hostil of ['-D', '--force', '-d', '-D vitima', '--delete=vitima']) {
      await expect(svc.gitCreateBranch(dir, hostil)).rejects.toThrow(/inválido/i)
    }
    // a branch-vítima continua existindo: nenhum `-D` chegou a virar flag
    expect(execFileSync('git', ['branch', '--list'], { cwd: dir }).toString()).toBe(antes)
    expect(execFileSync('git', ['branch', '--list'], { cwd: dir }).toString()).toContain('vitima')
  })

  it('gitCheckout RECUSA nome hostil (-f, --force) sem executar o git', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'src', 'a.ts'), 'sujo\n')
    for (const hostil of ['-f', '--force', '-D', '--discard-changes']) {
      await expect(svc.gitCheckout(dir, hostil)).rejects.toThrow(/inválido/i)
    }
    // e o working tree sujo continua sujo: nenhum `--force`/`--discard-changes` foi executado
    expect(readFileSync(join(dir, 'src', 'a.ts')).toString()).toBe('sujo\n')
  })

  it('gitCheckout NÃO restaura arquivo (um nome de ARQUIVO não é branch: `checkout -- file` é destrutivo)', async () => {
    initRepo(dir)
    writeFileSync(join(dir, 'README.md'), '# alterado, nao salvo\n')
    // 'README.md' é um nome de branch LEGAL para o check-ref-format, mas aqui é um arquivo com
    // trabalho não salvo. Se a implementação usasse `git checkout -- README.md`, o arquivo seria
    // RESTAURADO (trabalho perdido). Usando `git switch`, o pior caso é um erro.
    await expect(svc.gitCheckout(dir, 'README.md')).rejects.toBeTruthy()
    expect(readFileSync(join(dir, 'README.md')).toString()).toBe('# alterado, nao salvo\n')
  })

  it('git de escrita fora de um repo REPORTA o erro (não devolve vazio como o read-only faz)', async () => {
    // gitStatus/gitBranch/gitDiff devolvem vazio fora de repo porque "sem git" não é erro p/ um
    // file-explorer. Escrever, sim: pedir commit onde não há repo PRECISA falhar visível.
    await expect(svc.gitCommit(dir, 'x')).rejects.toBeTruthy()
    await expect(svc.gitCreateBranch(dir, 'x')).rejects.toBeTruthy()
    await expect(svc.gitCheckout(dir, 'x')).rejects.toBeTruthy()
  })
})
