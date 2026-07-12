# Orkestra — Fase 26 (Papéis Ricos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** O "papel" de um terminal-agente deixa de ser só um texto livre e ganha **papéis prontos** (Líder, Dev, Revisor, Testador) com **cor própria** e uma **dica** (hint), exibidos como um **badge colorido** no header do terminal. Um seletor oferece os papéis prontos + "Personalizado…" (mantendo o texto livre). Continua sendo só metadado (nomenclatura/visual) — sem LLM, sem injeção automática de instruções.

**Architecture:** Um módulo puro `src/shared/roles.ts` define `PRESET_ROLES` (`{id,label,color,hint}[]`) e `roleMeta(role): {label,color,hint}` — que resolve um papel (por id ou label, case-insensitive) para sua cor/dica, com fallback neutro para papéis personalizados. O `TerminalFlowNode` passa a exibir um badge colorido (`roleMeta(role).color`) e troca o input de papel por um `<select>` (papéis prontos + "Sem papel" + "Personalizado…"); em modo personalizado, revela o input de texto atual. O `data.role` continua uma string (o label do preset, ou o texto livre) — sem mudança de persistência nem no espelho `orq`.

**Tech Stack:** React 18, tokens de tema (`--accent`/`--ok`/`--warn`/`--err`/`--text-2`). Vitest (`*.test.ts`) — a lógica de papéis é um módulo puro.

## Global Constraints

- **`data.role` continua string** (o label do preset ou texto livre) — nada muda em serialize/hydrate nem no `useOrchestrationSync` (que espelha `role` ao main). `updateTerminalRole(id, role)` já existe — só é chamado com valores novos.
- **Só metadado/visual:** o papel não injeta prompt no pty nem depende de LLM (copiloto cortado). A `hint` é informativa (tooltip), o usuário decide se a usa.
- Renderer não importa `fs`/`http`/`node-pty`/`child_process`. **Seletores do store derivados exigem `useShallow`** (zustand v5) — nesta fase não há seletor derivado novo (só leitura de `data` do próprio nó via props), mas atenção se algum for adicionado.
- Zero regressão a terminais/atenção/`orq`/palette. PT-BR, sem marcas de terceiros.

---

### Task 1: Módulo puro `roles.ts` — TDD

**Files:**
- Create: `src/shared/roles.ts` (+ `.test.ts` colocado em `src/shared/roles.test.ts`)

**Interfaces:**
- Produces:
  ```ts
  export interface Role { id: string; label: string; color: string; hint: string }
  export const PRESET_ROLES: Role[]
  export function roleMeta(role: string): { label: string; color: string; hint: string }
  ```

- [ ] **Step 1: Teste (falha primeiro)**

`src/shared/roles.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { PRESET_ROLES, roleMeta } from './roles'

describe('PRESET_ROLES', () => {
  it('tem os quatro papéis prontos com campos completos', () => {
    const ids = PRESET_ROLES.map((r) => r.id)
    expect(ids).toEqual(['lider', 'dev', 'revisor', 'testador'])
    for (const r of PRESET_ROLES) {
      expect(r.label.length).toBeGreaterThan(0)
      expect(r.color).toMatch(/^var\(--/)
      expect(r.hint.length).toBeGreaterThan(0)
    }
  })
})

describe('roleMeta', () => {
  it('resolve um preset pelo label (case-insensitive)', () => {
    expect(roleMeta('Líder').color).toBe('var(--accent)')
    expect(roleMeta('revisor').color).toBe('var(--warn)')
    expect(roleMeta('DEV').label).toBe('Dev')
  })
  it('resolve um preset pelo id', () => {
    expect(roleMeta('testador').color).toBe('var(--err)')
  })
  it('papel personalizado tem cor neutra e mantém o texto como label', () => {
    const m = roleMeta('Arquiteto')
    expect(m.color).toBe('var(--text-2)')
    expect(m.label).toBe('Arquiteto')
    expect(m.hint).toBe('')
  })
  it('papel vazio é neutro', () => {
    expect(roleMeta('').color).toBe('var(--text-2)')
  })
})
```

- [ ] **Step 2: Rodar → falha** (`npm test -- roles`).

- [ ] **Step 3: Implementar `roles.ts`**
```ts
export interface Role {
  id: string
  label: string
  color: string
  hint: string
}

export const PRESET_ROLES: Role[] = [
  { id: 'lider', label: 'Líder', color: 'var(--accent)', hint: 'Coordena os demais agentes e decide a estratégia.' },
  { id: 'dev', label: 'Dev', color: 'var(--ok)', hint: 'Implementa o código conforme o plano.' },
  { id: 'revisor', label: 'Revisor', color: 'var(--warn)', hint: 'Revisa o código em busca de bugs e melhorias.' },
  { id: 'testador', label: 'Testador', color: 'var(--err)', hint: 'Escreve e executa os testes.' }
]

export function roleMeta(role: string): { label: string; color: string; hint: string } {
  const norm = role.trim().toLowerCase()
  const p = PRESET_ROLES.find((r) => r.id === norm || r.label.toLowerCase() === norm)
  if (p) return { label: p.label, color: p.color, hint: p.hint }
  return { label: role, color: 'var(--text-2)', hint: '' }
}
```

- [ ] **Step 4: Rodar → verde** + `npm run typecheck` limpo.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: roles.ts (papeis prontos + roleMeta) (Fase 26)"`

---

### Task 2: Badge colorido + seletor de papel no `TerminalFlowNode` (+ checkpoint)

**Files:**
- Modify: `src/renderer/src/components/TerminalFlowNode.tsx`, `src/renderer/src/components/nodes.css`

**Interfaces:**
- Consumes: `PRESET_ROLES`, `roleMeta` de `../../../shared/roles` (ajustar o caminho relativo real); store `updateTerminalRole` (já usado no arquivo).

- [ ] **Step 1: READ `TerminalFlowNode.tsx`** — entender a estrutura atual: o header (dot, nome, badge de atenção da Fase 20, botões), o input de papel existente (hoje um `<input>` que chama `updateTerminalRole(id, ...)`), o `data.role`/`data.name` reads. Preservar tudo exceto a edição de papel, que será substituída.

- [ ] **Step 2: Badge colorido do papel** — no header, quando `role` não-vazio, exibir um badge com a cor do papel:
```tsx
import { PRESET_ROLES, roleMeta } from '<caminho>/shared/roles'
// ...
const role = (data?.role as string) ?? ''
const rmeta = roleMeta(role)
// no header, perto do nome:
{role.trim() !== '' && (
  <span
    className="ork-role-badge"
    style={{ color: rmeta.color, borderColor: rmeta.color }}
    title={rmeta.hint || undefined}
  >
    {rmeta.label}
  </span>
)}
```

- [ ] **Step 3: Seletor de papel (presets + personalizado)** — substituir o input de papel atual por um `<select>` que oferece os prontos e um modo personalizado (que revela o input de texto). Estado local para o modo personalizado:
```tsx
import { useState } from 'react' // se ainda não importado
// ...
const isPreset = PRESET_ROLES.some((r) => r.label === role)
const [customRole, setCustomRole] = useState(role.trim() !== '' && !isPreset)

<select
  className="nodrag ork-role-select"
  value={customRole ? '__custom__' : role}
  onChange={(e) => {
    const v = e.target.value
    if (v === '__custom__') {
      setCustomRole(true)
      return
    }
    setCustomRole(false)
    updateTerminalRole(id, v)
  }}
  title="Papel do agente"
>
  <option value="">Sem papel</option>
  {PRESET_ROLES.map((r) => (
    <option key={r.id} value={r.label}>
      {r.label}
    </option>
  ))}
  <option value="__custom__">Personalizado…</option>
</select>
{customRole && (
  <input
    className="nodrag ork-role-input"
    value={role}
    placeholder="Papel personalizado"
    onChange={(e) => updateTerminalRole(id, e.target.value)}
  />
)}
```
(Se o arquivo já tinha um `<input>` de papel com uma classe própria, reusar/renomear a classe conforme fizer sentido. Manter o input de NOME do terminal como está.)

- [ ] **Step 4: CSS em `nodes.css`** — badge + seletor:
```css
.ork-role-badge {
  font-size: 10px;
  line-height: 1.4;
  padding: 0 6px;
  border: 1px solid;
  border-radius: 999px;
  white-space: nowrap;
}
.ork-role-select {
  font-size: 11px;
  color: var(--text-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 1px 4px;
  max-width: 130px;
}
.ork-role-select:hover {
  border-color: var(--border-strong);
}
.ork-role-input {
  font-size: 11px;
  color: var(--text-1);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  max-width: 130px;
}
```

- [ ] **Step 5: Testes + typecheck + build + lint** — `npm test` (verde), `npm run typecheck`, `npm run build`, `npm run lint` — limpos.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: badge colorido + seletor de papeis prontos no terminal (Fase 26)"`

- [ ] **Step 7: CHECKPOINT VISUAL (humano)** — `npm run dev`. Num terminal, abrir o seletor de papel → escolher "Revisor" → o header mostra um badge amarelo "Revisor" (tooltip com a dica); escolher "Líder" → badge roxo; "Personalizado…" → revela o input, digitar "Arquiteto" → badge neutro "Arquiteto"; "Sem papel" → badge some. Fechar/reabrir → o papel persiste. Confirmar que `orq` continua espelhando o `role` (metadado) sem erro.

---

## Notas de risco
- **Papel é só metadado/visual:** não injeta instruções no agente (sem LLM). A `hint` é um tooltip informativo — expandir para "colar a instrução no terminal" seria um refinamento futuro (fora do escopo, já que o copiloto foi cortado).
- **Preset por label:** guardamos o `label` do preset em `data.role` (legível, e o que o `orq` espelha). `roleMeta` resolve por id OU label, então tanto `'Líder'` quanto `'lider'` funcionam; um label de preset digitado à mão vira o preset. Colisão improvável (labels são distintos e específicos).
- **Modo personalizado:** o estado local `customRole` decide mostrar o input; ao recarregar, é derivado de `role` não ser um preset — consistente.
- **auto-detect `role.json` / subdir com CLAUDE.md próprio** (do mapa): fora do escopo deste MVP — depende de leitura de FS por terminal e convenções que não temos; fica como refinamento futuro se o usuário pedir.
- Sem seletor de store derivado novo → sem risco de loop `useShallow` (ver [[reference_orkestra_zustand_v5]]); o badge/seletor leem `data` do próprio nó via props.
