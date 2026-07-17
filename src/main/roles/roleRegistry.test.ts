import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  scanRoleSidecars,
  readImportedRoles,
  writeImportedRoles,
  importedPromptFor,
  agentsDir,
  rolesFile,
  MAX_SCAN_DIRS,
  MAX_SIDECAR_BYTES
} from './roleRegistry'
import { serializeRoleSidecar, buildRoleSidecar, type RoleSidecar } from '../../shared/roleSidecar'

// Todo sidecar em disco aqui é escrito com serializeRoleSidecar — o MESMO serializador que
// registerPtyIpc usa para gravar ~/.orkestra/agents/<nodeId>/role.json. Um teste que fabricasse o
// JSON à mão poderia ficar verde sobre um shape que a produção nunca produz.
function writeSidecar(base: string, nodeId: string, sidecar: RoleSidecar): void {
  const dir = join(base, nodeId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'role.json'), serializeRoleSidecar(sidecar), 'utf-8')
}

function custom(name: string, prompt: string): RoleSidecar {
  return { name, color: 'var(--text-2)', prompt }
}

let base: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'ork-agents-'))
})
afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('scanRoleSidecars', () => {
  it('lê os sidecars de <base>/<nodeId>/role.json e devolve os importáveis', () => {
    writeSidecar(base, 'terminal-1', custom('Auditor', 'Você audita a segurança.'))
    writeSidecar(base, 'terminal-2', custom('Arquiteto', 'Você desenha o sistema.'))
    const found = scanRoleSidecars(base)
    expect(found.map((r) => r.name).sort()).toEqual(['Arquiteto', 'Auditor'])
  })

  it('descarta lixo e sidecar incompleto sem lançar', () => {
    mkdirSync(join(base, 'terminal-lixo'), { recursive: true })
    writeFileSync(join(base, 'terminal-lixo', 'role.json'), 'isto não é json', 'utf-8')
    mkdirSync(join(base, 'terminal-parcial'), { recursive: true })
    writeFileSync(join(base, 'terminal-parcial', 'role.json'), '{"name":"X"}', 'utf-8')
    writeSidecar(base, 'terminal-ok', custom('Auditor', 'Você audita.'))
    expect(scanRoleSidecars(base).map((r) => r.name)).toEqual(['Auditor'])
  })

  it('descarta o sidecar de papel LIVRE (prompt vazio) que o spawn grava', () => {
    writeSidecar(base, 'terminal-livre', buildRoleSidecar('Arquiteto')!)
    expect(scanRoleSidecars(base)).toEqual([])
  })

  it('deduplica papéis repetidos entre vários agentes', () => {
    writeSidecar(base, 'terminal-a', custom('Auditor', 'v1'))
    writeSidecar(base, 'terminal-b', custom('auditor', 'v2'))
    expect(scanRoleSidecars(base)).toHaveLength(1)
  })

  it('ignora arquivo maior que o teto (MAX_SIDECAR_BYTES)', () => {
    writeSidecar(base, 'terminal-gordo', custom('Gordo', 'x'.repeat(MAX_SIDECAR_BYTES + 10)))
    writeSidecar(base, 'terminal-ok', custom('Auditor', 'Você audita.'))
    expect(scanRoleSidecars(base).map((r) => r.name)).toEqual(['Auditor'])
  })

  it('para no teto de diretórios (MAX_SCAN_DIRS) em vez de varrer sem limite', () => {
    for (let i = 0; i < MAX_SCAN_DIRS + 5; i++) {
      writeSidecar(base, `terminal-${String(i).padStart(4, '0')}`, custom(`Papel${i}`, 'prompt'))
    }
    expect(scanRoleSidecars(base)).toHaveLength(MAX_SCAN_DIRS)
  })

  it('diretório inexistente → lista vazia (degrada, não lança)', () => {
    expect(scanRoleSidecars(join(base, 'nao-existe'))).toEqual([])
  })

  it('ignora arquivos soltos na raiz (só varre subdiretórios de agente)', () => {
    writeFileSync(join(base, 'role.json'), serializeRoleSidecar(custom('Solto', 'prompt')), 'utf-8')
    expect(scanRoleSidecars(base)).toEqual([])
  })
})

describe('readImportedRoles / writeImportedRoles', () => {
  it('round-trip pelo disco', () => {
    const file = join(base, 'roles.json')
    const roles = [custom('Auditor', 'Você audita.')]
    writeImportedRoles(roles, file)
    expect(readImportedRoles(file)).toEqual(roles)
  })

  it('arquivo inexistente → lista vazia', () => {
    expect(readImportedRoles(join(base, 'nao-existe.json'))).toEqual([])
  })

  it('arquivo com lixo → lista vazia (nunca lança)', () => {
    const file = join(base, 'roles.json')
    writeFileSync(file, '}{ não é json', 'utf-8')
    expect(readImportedRoles(file)).toEqual([])
  })

  it('cria o diretório do registro se ainda não existe', () => {
    const file = join(base, 'sub', 'dir', 'roles.json')
    writeImportedRoles([custom('Auditor', 'Você audita.')], file)
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual([
      { name: 'Auditor', color: 'var(--text-2)', prompt: 'Você audita.' }
    ])
  })

  it('falha de escrita degrada em vez de lançar', () => {
    const dir = join(base, 'somente-leitura')
    mkdirSync(dir)
    chmodSync(dir, 0o500)
    expect(() => writeImportedRoles([custom('Auditor', 'x')], join(dir, 'roles.json'))).not.toThrow()
    chmodSync(dir, 0o700)
  })
})

describe('importedPromptFor', () => {
  it('resolve o prompt de um papel importado a partir do registro em disco', () => {
    const file = join(base, 'roles.json')
    writeImportedRoles([custom('Auditor', 'Você audita.')], file)
    expect(importedPromptFor('auditor', file)).toBe('Você audita.')
    expect(importedPromptFor('Ninguém', file)).toBe('')
  })
})

describe('caminhos padrão', () => {
  it('apontam para ~/.orkestra (fora do repositório do usuário)', () => {
    expect(agentsDir().endsWith(join('.orkestra', 'agents'))).toBe(true)
    expect(rolesFile().endsWith(join('.orkestra', 'roles.json'))).toBe(true)
  })
})
