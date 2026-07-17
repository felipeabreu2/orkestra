import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerRolesIpc } from './registerRolesIpc'
import { readImportedRoles } from './roleRegistry'
import { serializeRoleSidecar, buildRoleSidecar, type RoleSidecar } from '../../shared/roleSidecar'

// IpcMain falso — mesmo padrão dos demais testes de IPC do main (registerPtyIpc.test.ts): guarda os
// handlers por canal para o teste invocá-los direto, sem Electron.
function fakeIpcMain(): { handlers: Map<string, (...a: unknown[]) => unknown>; handle: unknown } {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  return { handlers, handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn) }
}

function custom(name: string, prompt: string): RoleSidecar {
  return { name, color: 'var(--text-2)', prompt }
}

// Sidecar escrito pelo serializador de PRODUÇÃO (o mesmo de registerPtyIpc) — o teste lê o que o app
// de verdade grava.
function writeSidecar(base: string, nodeId: string, sidecar: RoleSidecar): void {
  mkdirSync(join(base, nodeId), { recursive: true })
  writeFileSync(join(base, nodeId, 'role.json'), serializeRoleSidecar(sidecar), 'utf-8')
}

let base: string
let agents: string
let roles: string

function register(): Map<string, (...a: unknown[]) => unknown> {
  const ipc = fakeIpcMain()
  registerRolesIpc(ipc as never, { agentsDir: agents, rolesFile: roles })
  return ipc.handlers
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'ork-roles-ipc-'))
  agents = join(base, 'agents')
  roles = join(base, 'roles.json')
  mkdirSync(agents, { recursive: true })
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('roles:discover', () => {
  it('devolve os descobertos classificados contra os presets e o registro atual', async () => {
    writeSidecar(agents, 'terminal-1', custom('Auditor', 'Você audita.'))
    writeSidecar(agents, 'terminal-2', buildRoleSidecar('dev')!) // preset → não importável
    const h = register()
    const res = (await h.get('roles:discover')!({})) as {
      discovered: { sidecar: RoleSidecar; status: string }[]
      imported: RoleSidecar[]
    }
    expect(res.discovered).toEqual([
      { sidecar: custom('Auditor', 'Você audita.'), status: 'new' },
      { sidecar: buildRoleSidecar('dev')!, status: 'preset' }
    ])
    expect(res.imported).toEqual([])
  })

  it('degrada para vazio quando não há nada em disco', async () => {
    rmSync(agents, { recursive: true, force: true })
    const h = register()
    expect(await h.get('roles:discover')!({})).toEqual({ discovered: [], imported: [] })
  })
})

describe('roles:import', () => {
  it('persiste os escolhidos no registro e os devolve', async () => {
    const h = register()
    const res = await h.get('roles:import')!({}, [custom('Auditor', 'Você audita.')])
    expect(res).toEqual([custom('Auditor', 'Você audita.')])
    expect(readImportedRoles(roles)).toEqual([custom('Auditor', 'Você audita.')])
  })

  it('RECUSA importar um papel que já é preset (não duplica)', async () => {
    const h = register()
    expect(await h.get('roles:import')!({}, [buildRoleSidecar('dev')!, custom('Auditor', 'x')])).toEqual([
      custom('Auditor', 'x')
    ])
    expect(readImportedRoles(roles).map((r) => r.name)).toEqual(['Auditor'])
  })

  it('re-importar o mesmo nome atualiza no lugar', async () => {
    const h = register()
    await h.get('roles:import')!({}, [custom('Auditor', 'v1')])
    await h.get('roles:import')!({}, [custom('auditor', 'v2')])
    expect(readImportedRoles(roles)).toEqual([custom('auditor', 'v2')])
  })

  it('payload inválido do renderer não escreve nada nem lança', async () => {
    const h = register()
    expect(await h.get('roles:import')!({}, 'não é lista')).toEqual([])
    expect(await h.get('roles:import')!({}, [{ name: 'X' }, null, 3])).toEqual([])
    expect(readImportedRoles(roles)).toEqual([])
  })
})
