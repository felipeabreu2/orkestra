import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
})
