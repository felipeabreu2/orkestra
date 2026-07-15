import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProjectManager } from './ProjectManager'

describe('ProjectManager', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'orkestra-proj-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('bootstrap cria um projeto default e migra o canvas.json legado', () => {
    writeFileSync(join(dir, 'canvas.json'), JSON.stringify({ version: 2, nodes: [{ id: 'n1' }], edges: [] }))
    const pm = new ProjectManager(dir); pm.bootstrap()
    const idx = pm.list()
    expect(idx.projects).toHaveLength(1)
    expect(idx.activeId).toBe(idx.projects[0].id)
    expect(pm.loadActiveCanvas()?.nodes).toHaveLength(1) // migrado
  })

  it('create adiciona um projeto (canvas vazio) sem trocar o ativo', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const first = pm.list().activeId
    const p = pm.create('Backend')
    expect(pm.list().projects.some((x) => x.id === p.id)).toBe(true)
    expect(pm.list().activeId).toBe(first) // create não troca
  })

  it('switch troca o ativo e devolve o canvas do novo projeto', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const p = pm.create('B')
    pm.saveActiveCanvas({ version: 2, nodes: [{ id: 'a' } as never], edges: [] }) // salva no projeto ATIVO (o default)
    const snap = pm.switch(p.id)
    expect(pm.list().activeId).toBe(p.id)
    expect(snap?.nodes ?? []).toHaveLength(0) // projeto B começa vazio
  })

  it('rename e remove funcionam; remover o ativo troca p/ outro', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const a = pm.list().activeId
    const b = pm.create('B')
    pm.rename(b.id, 'B2'); expect(pm.list().projects.find((x) => x.id === b.id)?.name).toBe('B2')
    const r = pm.remove(a) // remove o ativo
    expect(pm.list().projects.some((x) => x.id === a)).toBe(false)
    expect(r.activeId).toBe(b.id)
  })

  // Invariante documentada na decisão de design: "sempre >=1 projeto" — remover o único projeto
  // restante não pode deixar a app sem canvas nenhum para mostrar.
  it('remove do único projeto restante recria um default (nunca fica com zero projetos)', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const onlyId = pm.list().activeId
    const r = pm.remove(onlyId)
    expect(pm.list().projects).toHaveLength(1)
    expect(pm.list().projects[0].id).not.toBe(onlyId)
    expect(r.activeId).toBe(pm.list().projects[0].id)
    expect(r.snapshot?.nodes ?? []).toHaveLength(0)
  })

  it('switch com id inexistente não troca o ativo e retorna null', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const first = pm.list().activeId
    const snap = pm.switch('id-que-nao-existe')
    expect(snap).toBeNull()
    expect(pm.list().activeId).toBe(first)
  })

  // Bug de corrupção cross-project (2026-07-14): switch() gravava activeId=id no índice ANTES de
  // conseguir carregar o canvas. Com o arquivo ausente/corrompido, devolvia null com o efeito
  // colateral JÁ aplicado — o renderer tratava null como "id inválido" e não hidratava, deixando o
  // canvas do projeto ANTERIOR na tela enquanto o main já apontava para o NOVO. Cada autosave
  // seguinte gravava o conteúdo do projeto antigo por cima do arquivo do novo (comprovado em
  // produção: 3 projetos com arquivos byte-idênticos). Contrato novo: null SÓ quando o id não
  // existe (sem efeitos colaterais); arquivo ausente/corrompido → canvas VAZIO, e a troca acontece.
  it('switch para projeto com arquivo de canvas AUSENTE troca o ativo e devolve canvas vazio (não null)', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const b = pm.create('B')
    rmSync(join(dir, 'projects', `${b.id}.json`)) // simula arquivo perdido (disco/versão antiga)
    const snap = pm.switch(b.id)
    expect(snap).not.toBeNull()
    expect(snap?.nodes).toHaveLength(0)
    expect(pm.list().activeId).toBe(b.id)
  })

  it('switch para projeto com arquivo de canvas CORROMPIDO troca o ativo e devolve canvas vazio (não null)', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const b = pm.create('B')
    writeFileSync(join(dir, 'projects', `${b.id}.json`), 'não é json {')
    const snap = pm.switch(b.id)
    expect(snap).not.toBeNull()
    expect(snap?.nodes).toHaveLength(0)
    expect(pm.list().activeId).toBe(b.id)
  })

  // Fase 15 (Task 3): saveCanvas grava por id EXPLÍCITO — independe de qual projeto está ativo.
  // É o que permite ao renderer fazer flush do projeto que está SAINDO (o antigo) sem depender de
  // ordem entre o flush e a troca do ativo (ver switchTo em ProjectsSidebar.tsx).
  it('saveCanvas grava no projeto pelo id explícito (não no ativo) e não afeta o canvas do projeto ativo', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const activeId = pm.list().activeId
    const b = pm.create('B')
    pm.saveActiveCanvas({ version: 2, nodes: [{ id: 'active-node' } as never], edges: [] })

    pm.saveCanvas(b.id, { version: 2, nodes: [{ id: 'b-node' } as never], edges: [] })

    // não trocou o ativo nem tocou no canvas dele
    expect(pm.list().activeId).toBe(activeId)
    expect(pm.loadActiveCanvas()?.nodes.map((n) => n.id)).toEqual(['active-node'])

    // o projeto B recebeu o snapshot — só aparece ao trocar pra ele
    const snap = pm.switch(b.id)
    expect(snap?.nodes.map((n) => n.id)).toEqual(['b-node'])
  })

  // Trava o invariante do qual o remove-guard do renderer depende (ProjectsSidebar.handleRemove só
  // re-hidrata quando o activeId de fato muda): remover um projeto que NÃO é o ativo não pode
  // mexer nem no activeId nem no canvas do projeto que continua ativo.
  // Fase 17 (Task 1): cada projeto pode ser vinculado a uma pasta (cwd) — usada depois para
  // resolver o cwd do próximo terminal spawnado (ver registerPtyIpc/getProjectCwd).
  it('create aceita um cwd e getActive/switch o expõem; setCwd atualiza', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const p = pm.create('Web', '/Users/x/Documents/Apps')
    expect(pm.list().projects.find((x) => x.id === p.id)?.cwd).toBe('/Users/x/Documents/Apps')
    pm.switch(p.id)
    expect(pm.getActive()?.cwd).toBe('/Users/x/Documents/Apps')
    pm.setCwd(p.id, '/Users/x/outro')
    expect(pm.getActive()?.cwd).toBe('/Users/x/outro')
  })

  // Fase 18 (Task 4): ícone (emoji) por projeto, mesmo formato read-modify-write de rename()/
  // setCwd() — setIcon grava e list()/getActive() refletem; id desconhecido é no-op (não cria
  // projeto fantasma nem afeta os demais).
  it('setIcon grava o emoji e list()/getActive() refletem; id desconhecido é no-op', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const a = pm.list().activeId
    const b = pm.create('B')
    expect(pm.list().projects.find((x) => x.id === b.id)?.icon).toBeUndefined() // sem icon até setIcon

    pm.setIcon(b.id, '🚀')
    expect(pm.list().projects.find((x) => x.id === b.id)?.icon).toBe('🚀')

    pm.switch(b.id)
    expect(pm.getActive()?.icon).toBe('🚀')

    pm.setIcon('id-que-nao-existe', '📦')
    expect(pm.list().projects).toHaveLength(2) // no-op: não cria projeto novo
    expect(pm.list().projects.find((x) => x.id === a)?.icon).toBeUndefined() // não afetado
    expect(pm.list().projects.find((x) => x.id === b.id)?.icon).toBe('🚀') // não afetado
  })

  it('remove de um projeto NÃO ativo mantém activeId e o canvas do ativo intactos', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const activeId = pm.list().activeId
    const b = pm.create('B')
    pm.saveActiveCanvas({ version: 2, nodes: [{ id: 'active-node' } as never], edges: [] })

    const r = pm.remove(b.id) // remove o NÃO ativo

    expect(r.activeId).toBe(activeId)
    expect(pm.list().activeId).toBe(activeId)
    expect(pm.list().projects.some((x) => x.id === b.id)).toBe(false)
    expect(pm.loadActiveCanvas()?.nodes.map((n) => n.id)).toEqual(['active-node'])
    expect(r.snapshot?.nodes.map((n) => n.id)).toEqual(['active-node'])
  })

  // Bug de tela preta (2026-07-13): sem projeto ativo, o Canvas quebra o render inteiro. list() faz
  // self-heal — NUNCA devolve zero projetos, mesmo com índice ausente, VAZIO ou corrompido, e
  // conserta um activeId órfão. Cobre o boot após apagar os dados (onde bootstrap() não recria, pois
  // o arquivo de índice pode existir mas estar vazio/inválido).
  it('list() recria um projeto quando o índice está ausente (sem bootstrap)', () => {
    const pm = new ProjectManager(dir) // NÃO chama bootstrap()
    const idx = pm.list()
    expect(idx.projects).toHaveLength(1)
    expect(idx.activeId).toBe(idx.projects[0].id)
  })

  it('list() recria um projeto quando o índice existe mas está VAZIO', () => {
    writeFileSync(join(dir, 'projects.json'), JSON.stringify({ projects: [], activeId: '' }))
    const idx = new ProjectManager(dir).list()
    expect(idx.projects).toHaveLength(1)
    expect(idx.activeId).toBe(idx.projects[0].id)
  })

  it('list() recria um projeto quando o índice está corrompido', () => {
    writeFileSync(join(dir, 'projects.json'), 'isto não é json válido {')
    expect(new ProjectManager(dir).list().projects).toHaveLength(1)
  })

  it('list() conserta um activeId órfão apontando para o primeiro projeto', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const realId = pm.list().projects[0].id
    writeFileSync(
      join(dir, 'projects.json'),
      JSON.stringify({ projects: [{ id: realId, name: 'Projeto 1' }], activeId: 'orfao' })
    )
    expect(pm.list().activeId).toBe(realId)
  })

  // === INT-1/2/5 (auditoria 2026-07-14): robustez contra perda de dados ===

  // INT-1: índice corrompido não pode NUKAR tudo para um "Projeto 1" único — reconstrói a lista a
  // partir dos canvases órfãos em projects/ (o dado que importa é o canvas, não o índice).
  it('list() reconstrói projetos dos canvases órfãos quando o índice corrompe (não nuka)', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const b = pm.create('Backend', '/x')
    pm.saveCanvas(b.id, { version: 2, nodes: [{ id: 'keep' } as never], edges: [] })
    writeFileSync(join(dir, 'projects.json'), 'lixo {') // corrompe o índice
    const idx = pm.list()
    expect(idx.projects.length).toBeGreaterThanOrEqual(2) // re-adotou, não criou 1 só
    const snap = pm.switch(b.id) // o canvas do B sobrevive e é alcançável
    expect(snap?.nodes.map((n) => n.id)).toEqual(['keep'])
  })

  // INT-1: antes de curar um índice corrompido, preserva os bytes antigos (backup) — nunca destrói
  // dados em silêncio.
  it('list() faz backup do índice corrompido antes de curar', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    writeFileSync(join(dir, 'projects.json'), 'nao-json {')
    pm.list()
    const backups = readdirSync(dir).filter((f) => f.startsWith('projects.json.corrupt-'))
    expect(backups.length).toBe(1)
  })

  // INT-1: um erro de I/O TRANSITÓRIO (não corrupção) não pode reescrever o índice por cima. Aqui
  // simulamos trocando o arquivo por um diretório → readFileSync lança EISDIR (erro de I/O, não de
  // parse). list() deve reconstruir EM MEMÓRIA e NÃO tocar no arquivo — quando o I/O se recuperar,
  // a próxima leitura devolve o índice real intacto.
  it('erro de I/O ao ler o índice NÃO sobrescreve o arquivo; reconstrói em memória', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const b = pm.create('B')
    pm.saveCanvas(b.id, { version: 2, nodes: [{ id: 'survive' } as never], edges: [] })
    rmSync(join(dir, 'projects.json'))
    mkdirSync(join(dir, 'projects.json')) // agora ler o "arquivo" lança EISDIR
    const idx = pm.list()
    expect(idx.projects.some((p) => p.id === b.id)).toBe(true) // reconstruído em memória
    expect(statSync(join(dir, 'projects.json')).isDirectory()).toBe(true) // NÃO foi sobrescrito
  })

  // INT-2 (regressão do fix transacional de 07/14): trocar para um projeto com canvas CORROMPIDO
  // degrada para vazio (a troca acontece), mas faz BACKUP dos bytes antes — senão o autosave
  // seguinte gravaria o vazio por cima e o dado sumiria para sempre.
  it('switch para canvas corrompido faz backup do arquivo antes de degradar para vazio', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const b = pm.create('B')
    writeFileSync(join(dir, 'projects', `${b.id}.json`), 'nao-json {')
    const snap = pm.switch(b.id)
    expect(snap?.nodes).toHaveLength(0)
    const backups = readdirSync(join(dir, 'projects')).filter((f) => f.startsWith(`${b.id}.json.corrupt-`))
    expect(backups.length).toBe(1)
  })

  // PTY-1 (auditoria 2026-07-14): remover um projeto precisa devolver os nodeIds dos terminais dele
  // para o caller matar os ptys (sem isso, os agentes do projeto removido seguem vivos até o quit).
  it('remove devolve os nodeIds dos terminais do projeto removido', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const b = pm.create('B')
    pm.saveCanvas(b.id, {
      version: 2,
      nodes: [
        { id: 'terminal-1', type: 'terminal' } as never,
        { id: 'note-1', type: 'note' } as never,
        { id: 'terminal-2', type: 'terminal' } as never
      ],
      edges: []
    })
    const r = pm.remove(b.id)
    expect([...r.removedNodeIds].sort()).toEqual(['terminal-1', 'terminal-2'])
  })

  it('remove de projeto sem terminais (ou com canvas ausente) devolve lista vazia', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const b = pm.create('B')
    const r = pm.remove(b.id)
    expect(r.removedNodeIds).toEqual([])
  })

  // Badge da sidebar (2026-07-14): terminalCounts conta os nós type=terminal de cada projeto.
  it('terminalCounts conta os terminais de cada projeto (0 quando ausente)', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const a = pm.list().activeId
    const b = pm.create('B')
    pm.saveCanvas(a, {
      version: 2,
      nodes: [
        { id: 't1', type: 'terminal' } as never,
        { id: 'n1', type: 'note' } as never,
        { id: 't2', type: 'terminal' } as never
      ],
      edges: []
    })
    // projeto B fica com o canvas vazio (create) → 0 terminais
    const counts = pm.terminalCounts()
    expect(counts[a]).toBe(2)
    expect(counts[b.id]).toBe(0)
  })

  // INT-7: .tmp órfãos (crash entre write e rename) são limpos no bootstrap; backups .corrupt-* não.
  it('bootstrap limpa .tmp órfãos em projects/ e projects.json.tmp, sem tocar em .corrupt', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const activeId = pm.list().activeId
    writeFileSync(join(dir, 'projects', `${activeId}.json.tmp`), 'lixo')
    writeFileSync(join(dir, 'projects.json.tmp'), 'lixo')
    writeFileSync(join(dir, 'projects', `${activeId}.json.corrupt-123`), 'backup')
    pm.bootstrap() // roda de novo (índice já existe) → só limpa os .tmp
    expect(readdirSync(join(dir, 'projects')).some((f) => f.endsWith('.tmp'))).toBe(false)
    expect(statSync(join(dir, 'projects', `${activeId}.json.corrupt-123`)).isFile()).toBe(true) // backup preservado
    expect(readdirSync(dir).includes('projects.json.tmp')).toBe(false)
  })

  // INT-8: id de path traversal via projects:saveCanvas é recusado — nunca grava fora de projects/.
  it('saveCanvas recusa id com path traversal e não grava fora da pasta', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const before = readdirSync(dir).sort()
    const ok = pm.saveCanvas('../projects', { version: 2, nodes: [{ id: 'x' } as never], edges: [] })
    expect(ok).toBe(false)
    expect(readdirSync(dir).sort()).toEqual(before) // nada novo escrito no baseDir
  })

  // INT-3: pasta projects/ removida com o app aberto não pode virar "salvo de mentira" — writeJson
  // recria o diretório e reporta sucesso real.
  it('saveCanvas recria a pasta projects/ se ela sumir e reporta sucesso', () => {
    const pm = new ProjectManager(dir); pm.bootstrap()
    const activeId = pm.list().activeId
    rmSync(join(dir, 'projects'), { recursive: true, force: true })
    const ok = pm.saveCanvas(activeId, { version: 2, nodes: [{ id: 'x' } as never], edges: [] })
    expect(ok).toBe(true)
    expect(pm.loadActiveCanvas()?.nodes.map((n) => n.id)).toEqual(['x'])
  })
})
