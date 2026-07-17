import type { IpcMain } from 'electron'
import { parseRoleSidecar, type RoleSidecar } from '../../shared/roleSidecar'
import { PRESET_ROLES } from '../../shared/roles'
import { mergeIntoPresets, mergeImports, type DiscoverResult } from '../../shared/discoverRoles'
import { scanRoleSidecars, readImportedRoles, writeImportedRoles, agentsDir, rolesFile } from './roleRegistry'

// T5 — IPC de "Descobrir Responsabilidades". O renderer não toca em `fs`: pergunta ao main quais
// papéis existem nos sidecars (~/.orkestra/agents/*/role.json) e manda importar os escolhidos.
// Os caminhos são injetáveis só para teste; em produção são os defaults de roleRegistry.
export function registerRolesIpc(
  ipcMain: IpcMain,
  paths: { agentsDir?: string; rolesFile?: string } = {}
): void {
  const agents = paths.agentsDir ?? agentsDir()
  const registry = paths.rolesFile ?? rolesFile()

  ipcMain.handle('roles:discover', async (): Promise<DiscoverResult> => {
    // scanRoleSidecars já degrada em falha de I/O (lista vazia) — descoberta nunca derruba o IPC.
    return { discovered: mergeIntoPresets(PRESET_ROLES, scanRoleSidecars(agents)), imported: readImportedRoles(registry) }
  })

  ipcMain.handle('roles:import', async (_e, chosen: unknown): Promise<RoleSidecar[]> => {
    // Boundary: o payload vem do renderer. Nada é confiado — cada entrada passa pelo parse
    // defensivo do sidecar (mesma validação de shape do disco) e o que não parseia some.
    if (!Array.isArray(chosen)) return readImportedRoles(registry)
    const parsed = chosen
      .map((entry) => parseRoleSidecar(JSON.stringify(entry)))
      .filter((s): s is RoleSidecar => s !== null)
    // Critério de aceite: importar NUNCA duplica um preset. O filtro é aqui (no main, dono do
    // registro), não só na UI — a UI é uma conveniência, não um gate.
    const importable = mergeIntoPresets(PRESET_ROLES, parsed)
      .filter((d) => d.status === 'new')
      .map((d) => d.sidecar)
    const existing = readImportedRoles(registry)
    if (importable.length === 0) return existing
    const merged = mergeImports(existing, importable)
    writeImportedRoles(merged, registry)
    return merged
  })
}
