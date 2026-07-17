import { describe, it, expect } from 'vitest'
import {
  dedupeDiscoveredRoles,
  mergeIntoPresets,
  parseImportedRoles,
  serializeImportedRoles,
  mergeImports,
  resolveImportedPrompt
} from './discoverRoles'
import { serializeRoleSidecar, parseRoleSidecar, buildRoleSidecar, type RoleSidecar } from './roleSidecar'
import { PRESET_ROLES } from './roles'

// Fabricar o sidecar À MÃO nos testes seria um teste verde de mentira: o shape testado precisa ser
// o que a PRODUÇÃO grava. Por isso todo sidecar daqui nasce de buildRoleSidecar/serializeRoleSidecar
// (as mesmas funções que registerPtyIpc usa para escrever ~/.orkestra/agents/<nodeId>/role.json) ou
// do parse do texto que elas produzem.
function sidecarOf(role: string): RoleSidecar {
  const s = buildRoleSidecar(role)
  if (!s) throw new Error(`papel sem sidecar: ${role}`)
  return s
}

// Sidecar de papel refinado à mão/por `orq role write` — o caso REAL que a descoberta existe para
// achar: nome livre + prompt próprio. Passa pelo serializador de produção e volta pelo parser, de
// forma que o objeto testado seja byte-a-byte o que estaria em disco.
function customSidecar(name: string, prompt: string): RoleSidecar {
  const written = serializeRoleSidecar({ name, color: 'var(--text-2)', prompt })
  return parseRoleSidecar(written)!
}

describe('dedupeDiscoveredRoles', () => {
  it('deduplica por nome (case-insensitive) preferindo o primeiro e preservando a ordem', () => {
    const a = customSidecar('Arquiteto', 'primeiro')
    const b = customSidecar('arquiteto', 'segundo')
    const c = customSidecar('Auditor', 'terceiro')
    expect(dedupeDiscoveredRoles([a, b, c])).toEqual([a, c])
  })

  it('descarta null (lixo que parseRoleSidecar recusou)', () => {
    const a = customSidecar('Arquiteto', 'prompt')
    expect(dedupeDiscoveredRoles([null, a, null])).toEqual([a])
  })

  it('lista vazia → vazio', () => {
    expect(dedupeDiscoveredRoles([])).toEqual([])
  })

  it('descarta sidecar de papel LIVRE (prompt vazio) — não há configuração a importar', () => {
    // buildRoleSidecar('Arquiteto') é exatamente o que o spawn grava para um papel livre: prompt ''.
    // Importar isso criaria um papel indistinguível de digitar o nome na paleta (roleMeta já devolve
    // label + cor neutra para qualquer texto livre) — ruído sem ganho.
    const livre = sidecarOf('Arquiteto')
    expect(livre.prompt).toBe('')
    expect(dedupeDiscoveredRoles([livre])).toEqual([])
  })

  it('descarta sidecar sem nome utilizável', () => {
    expect(dedupeDiscoveredRoles([customSidecar('   ', 'prompt')])).toEqual([])
  })
})

describe('mergeIntoPresets', () => {
  it('marca como preset o descoberto que já existe (por label, case-insensitive)', () => {
    // Sidecar de um preset é o que o spawn grava para todo terminal com papel de preset — a
    // descoberta os vê o tempo todo e não pode oferecer duplicá-los.
    const dev = sidecarOf('dev')
    const novo = customSidecar('Auditor', 'Você audita a segurança.')
    expect(mergeIntoPresets(PRESET_ROLES, [dev, novo])).toEqual([
      { sidecar: dev, status: 'preset' },
      { sidecar: novo, status: 'new' }
    ])
  })

  it('marca como preset o descoberto que casa com o id do preset', () => {
    const s = customSidecar('lider', 'prompt qualquer')
    expect(mergeIntoPresets(PRESET_ROLES, [s])[0].status).toBe('preset')
  })

  it('lista vazia → vazio', () => {
    expect(mergeIntoPresets(PRESET_ROLES, [])).toEqual([])
  })
})

describe('parseImportedRoles / serializeImportedRoles', () => {
  it('round-trip do registro de papéis importados', () => {
    const roles = [customSidecar('Auditor', 'Você audita.'), customSidecar('Arquiteto', 'Você desenha.')]
    expect(parseImportedRoles(serializeImportedRoles(roles))).toEqual(roles)
  })

  it('lixo, JSON não-array e entradas malformadas → filtrados, nunca lança', () => {
    expect(parseImportedRoles('não é json')).toEqual([])
    expect(parseImportedRoles('{"roles":[]}')).toEqual([])
    expect(parseImportedRoles('[{"name":"X"},null,3]')).toEqual([])
    const bom = customSidecar('Auditor', 'Você audita.')
    expect(parseImportedRoles(`[{"name":"X"},${serializeRoleSidecar(bom)}]`)).toEqual([bom])
  })
})

describe('mergeImports', () => {
  it('acrescenta os novos ao registro preservando a ordem existente', () => {
    const a = customSidecar('Auditor', 'v1')
    const b = customSidecar('Arquiteto', 'v1')
    expect(mergeImports([a], [b])).toEqual([a, b])
  })

  it('re-importar o mesmo nome ATUALIZA no lugar (sem duplicar)', () => {
    const v1 = customSidecar('Auditor', 'v1')
    const v2 = customSidecar('auditor', 'v2')
    expect(mergeImports([v1], [v2])).toEqual([v2])
  })
})

describe('resolveImportedPrompt', () => {
  it('resolve o prompt pelo nome, case-insensitive e com trim (como roleMeta)', () => {
    const roles = [customSidecar('Auditor', 'Você audita.')]
    expect(resolveImportedPrompt(roles, '  AUDITOR ')).toBe('Você audita.')
  })

  it('nome desconhecido / vazio → string vazia', () => {
    expect(resolveImportedPrompt([customSidecar('Auditor', 'x')], 'Ninguém')).toBe('')
    expect(resolveImportedPrompt([], '')).toBe('')
  })
})
