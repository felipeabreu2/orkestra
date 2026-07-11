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
})
