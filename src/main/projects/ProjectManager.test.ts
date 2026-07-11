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
})
