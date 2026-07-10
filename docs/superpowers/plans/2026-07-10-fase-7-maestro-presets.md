# Orkestra — Fase 7 (Modo Maestro + Roles/Presets) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Um agente "maestro" **monta e coordena uma equipe**: cria terminais a partir de **presets** de agente (Claude Code / Codex / Gemini / Shell), atribui **papéis (roles)**, e via `orq` **recruta** (`orq recruit`), **conecta** (`orq connect`) e **dispensa** (`orq dismiss`) outros agentes — tudo refletido no canvas.

**Architecture:** Um **catálogo de presets** compartilhado (`src/shared/presets.ts`) define cada perfil de agente (`id`, `label`, `command`). Ao criar um terminal a partir de um preset, o PTY spawna o shell e **auto-executa o comando do preset** (escrito uma única vez após o shell emitir seu primeiro output, garantindo que o rc já carregou). Terminais ganham um **papel** editável (`node.data.role`). Os comandos de equipe (`recruit`/`dismiss`/`connect`) viajam como **`OrchestrationCommand`s** (estendendo o mecanismo `onCommand` da Fase 5/6): o `orq` faz POST a novos endpoints do `OrchestrationServer`, o main faz `webContents.send`, e o renderer (`useOrchestrationSync`) **aplica** — criando, removendo ou conectando nós.

**Tech Stack:** sem deps novas. Vitest.

## Global Constraints

- Renderer NÃO importa `fs`/`http`/`node-pty`. Segurança do servidor inalterada (127.0.0.1 + token, gate antes do routing).
- `recruit`/`dismiss`/`connect` são fire-and-forget (como `updateNote`): o `orq` recebe 200 e o efeito aparece no canvas de forma assíncrona.
- Presets rodam o comando **no shell** (auto-run), não como o shell do PTY — assim um CLI ausente vira "command not found" visível, não um PTY morto.
- O comando inicial é escrito **uma única vez**, após o primeiro output do shell (rc já carregado).
- Nomenclatura: **não** usar marcas do Maestri no código/copy.

---

### Task 1: Catálogo de presets + PTY com comando inicial (TDD)

**Files:**
- Create: `src/shared/presets.ts`, `src/shared/presets.test.ts`
- Modify: `src/main/pty/PtyManager.ts` (+ `.test.ts`)

**Interfaces:**
- Produces:
  - `interface AgentPreset { id: string; label: string; command: string | null }` and `const PRESETS: AgentPreset[]` (with `presetById(id): AgentPreset | undefined`).
  - `PtyManager.spawn` accepts optional `initialCommand?: string`; when set, after the pty emits its **first** `onData` chunk, the manager writes `initialCommand + '\n'` exactly once.

- [ ] **Step 1: Preset catalog test (falha primeiro)**

`src/shared/presets.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { PRESETS, presetById } from './presets'

describe('presets', () => {
  it('inclui shell puro (command null) e ao menos um agente CLI', () => {
    const shell = PRESETS.find((p) => p.id === 'shell')
    expect(shell?.command).toBeNull()
    expect(PRESETS.some((p) => typeof p.command === 'string')).toBe(true)
  })
  it('presetById resolve por id e retorna undefined para desconhecido', () => {
    expect(presetById('shell')?.id).toBe('shell')
    expect(presetById('nao-existe')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Implementar `src/shared/presets.ts`**

```ts
export interface AgentPreset {
  id: string
  label: string
  command: string | null
}

export const PRESETS: AgentPreset[] = [
  { id: 'shell', label: 'Shell', command: null },
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'codex', label: 'Codex CLI', command: 'codex' },
  { id: 'gemini', label: 'Gemini CLI', command: 'gemini' }
]

export function presetById(id: string): AgentPreset | undefined {
  return PRESETS.find((p) => p.id === id)
}
```

- [ ] **Step 3: PtyManager initialCommand test (falha primeiro)**

Em `PtyManager.test.ts` (reusar o fake array-based multi-subscriber existente que expõe `emit(data)`):
```ts
  it('escreve o comando inicial uma unica vez apos o primeiro output', () => {
    const f = makeFakePty() // fake com write: vi.fn(), emit(data)
    const mgr = new PtyManager(() => f.pty)
    const id = mgr.spawn({ initialCommand: 'claude' })
    expect(f.pty.write).not.toHaveBeenCalled()   // ainda nao (sem output)
    f.emit('user@host $ ')                         // primeiro output do shell
    expect(f.pty.write).toHaveBeenCalledWith('claude\n')
    f.emit('mais output')                          // nao repete
    expect(f.pty.write).toHaveBeenCalledTimes(1)
  })
```
(Se o fake existente em `PtyManager.test.ts` não tiver `write: vi.fn()`/`emit`, estenda-o minimamente mantendo o multi-subscriber `onData`.)

- [ ] **Step 4: Implementar em `PtyManager.ts`**

Em `spawn`, aceitar `initialCommand?: string` nas opts. Após criar o pty e registrar os handlers existentes, se `opts.initialCommand`:
```ts
    if (opts.initialCommand) {
      let sent = false
      this.onData(id, () => {
        if (sent) return
        sent = true
        this.write(id, `${opts.initialCommand}\n`)
      })
    }
```
(Usa o `onData` multi-subscriber — não substitui os handlers existentes.)

- [ ] **Step 5: Testes + typecheck** — `npm test && npm run typecheck` verdes.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: catalogo de presets + PTY com comando inicial one-shot (Fase 7)"`

---

### Task 2: UI de preset ao criar terminal + papel editável (TDD onde aplicável)

**Files:**
- Modify: `src/renderer/src/store/canvasStore.ts` (+ `.test.ts`), `src/renderer/src/components/TerminalNode.tsx`, `src/renderer/src/components/TerminalFlowNode.tsx`, `src/renderer/src/hooks/useOrchestrationSync.ts`, and the toolbar/component that hosts the "criar terminal" button (locate it — likely `App.tsx` or a `Toolbar.tsx`).

**Interfaces:**
- Consumes: `PRESETS`/`AgentPreset` (Task 1).
- Produces: `addTerminalNode` accepts an optional `{ preset?, role?, name? }` seeding `data.preset`/`data.role`/`data.name`; `updateTerminalRole(id, role)`; `TerminalNode` reads `data.preset` → resolves the preset command → passes `initialCommand` to `pty.spawn`; the mirror includes `role` and `preset`.

- [ ] **Step 1: Store — preset/role no terminal (TDD)**

Em `canvasStore.test.ts`:
```ts
  it('addTerminalNode aceita preset e role e updateTerminalRole altera o papel', () => {
    useCanvasStore.getState().addTerminalNode(undefined, { preset: 'claude', role: 'Frontend' })
    const n = useCanvasStore.getState().nodes.at(-1)!
    expect((n.data as { preset?: string }).preset).toBe('claude')
    expect((n.data as { role?: string }).role).toBe('Frontend')
    useCanvasStore.getState().updateTerminalRole(n.id, 'Backend')
    expect((useCanvasStore.getState().nodes.at(-1)!.data as { role?: string }).role).toBe('Backend')
  })
```
Em `canvasStore.ts`: `addTerminalNode(position?, opts?: { preset?: string; role?: string; name?: string })` — semeia `data: { name: opts?.name ?? \`Terminal ${terminalSeq++}\`, preset: opts?.preset ?? 'shell', role: opts?.role ?? '' }`. Adicionar `updateTerminalRole(id, role)` (espelha `updateTerminalName`). Manter `serialize`/`hydrate` carregando o `data` inteiro (já fazem — confirmar que `preset`/`role` persistem).

- [ ] **Step 2: TerminalNode passa o comando do preset ao spawn**

`TerminalNode.tsx`: receber `preset?: string` (via `TerminalFlowNode`), resolver `presetById(preset)?.command` e passar como `initialCommand` no `window.orkestra.pty.spawn({ cols, rows, nodeId, initialCommand })`. Se o preset for `shell`/ausente → `initialCommand` undefined (nenhum auto-run).

- [ ] **Step 3: UI — menu de presets no "criar terminal" + papel editável**

No componente que hospeda o botão de criar terminal: em vez de um único "+Terminal", renderizar uma pequena lista/menu com um item por preset (`PRESETS.map`), cada um chamando `addTerminalNode(undefined, { preset: p.id })`. Manter um item "Shell" como default. (Design mínimo — polish é Fase 13.)
`TerminalFlowNode.tsx`: no header, ao lado do nome, um segundo input editável (`nodrag`) para o **papel**, ligado a `updateTerminalRole`, mostrando `data.role` (placeholder "papel").

- [ ] **Step 4: Mirror inclui role + preset**

`useOrchestrationSync.ts`: incluir `role: (data.role as string) ?? ''` e `preset: (data.preset as string) ?? 'shell'` no objeto espelhado por nó (estender o tipo `MirrorNode` em `src/shared/orchestration.ts` com `role?`/`preset?`). Manter o `name` (Fase 6).

- [ ] **Step 5: Testes + typecheck** — verdes.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: UI de presets ao criar terminal + papel editavel + mirror role/preset (Fase 7)"`

---

### Task 3: `orq recruit`/`dismiss`/`connect` + endpoints + aplicação no renderer (TDD) + checkpoint

**Files:**
- Modify: `src/shared/orchestration.ts`, `src/main/orchestration/OrchestrationServer.ts` (+ `.test.ts`), `src/orq/orq.ts` (+ `.test.ts`), `src/renderer/src/hooks/useOrchestrationSync.ts`, `src/renderer/src/store/canvasStore.ts` (+ `.test.ts` se novo método), `src/main/index.ts`

**Interfaces:**
- Consumes: `OrchestrationServer` opts (`onCommand`), the mirror + `resolvePtyByName` pattern, `addTerminalNode({preset,role,name})` (Task 2), `onConnect`/`removeNode` (store).
- Produces:
  - `OrchestrationCommand` union extended: `| { type: 'recruit'; name: string; preset: string; role?: string } | { type: 'dismiss'; target: string } | { type: 'connect'; source: string; target: string }`.
  - `OrchestrationServer` routes `POST /recruit` `{name, preset, role?}`, `POST /dismiss` `{target}`, `POST /connect` `{source, target}` — each validates strings → emits `onCommand` → 200; 400 on bad body. (Token gate before all, like `/note`.)
  - `orq recruit "<nome>" "<preset>" ["<role>"]`, `orq dismiss "<nome>"`, `orq connect "<A>" "<B>"`.
  - Renderer applies: `recruit`→`addTerminalNode(undefined,{name,preset,role})`; `dismiss`→remove node by name (+ its pty dies via unmount); `connect`→add edge between the two named nodes.

- [ ] **Step 1: Endpoints test (falha primeiro)**

Em `OrchestrationServer.test.ts`, com um `onCommand` espião: `POST /recruit {name:'Rev', preset:'claude', role:'Reviewer'}` (token) → `onCommand` recebido com `{type:'recruit',name:'Rev',preset:'claude',role:'Reviewer'}`, status 200; `POST /recruit {}` → 400. Idem 1 teste feliz para `/dismiss {target:'Rev'}` e `/connect {source:'A',target:'B'}`.

- [ ] **Step 2: Implementar endpoints em `OrchestrationServer.ts`**

Estender o `OrchestrationCommand` (em `src/shared/orchestration.ts`) com os 3 novos tipos. Adicionar, após o token gate e junto de `/note`, os handlers `POST /recruit`/`/dismiss`/`/connect` que fazem o parse+validação do body JSON (mesmo padrão try/catch do `/note`), montam o comando tipado e chamam `this.opts.onCommand(cmd)`, respondendo 200 (ou 400 em body inválido).

- [ ] **Step 3: `orq` recruit/dismiss/connect (TDD)**

Em `orq.test.ts` (com `OrchestrationServer` real + `onCommand` que grava): `runOrq(['recruit','Rev','claude','Reviewer'], env)` → `onCommand` recebe o recruit; `runOrq(['dismiss','Rev'], env)`; `runOrq(['connect','A','B'], env)`. Em `orq.ts`: adicionar os 3 comandos, cada um POST ao endpoint respectivo com o corpo correto, seguindo o tratamento `res.ok`/erro existente.

- [ ] **Step 4: Aplicar comandos no renderer**

`useOrchestrationSync.ts`: no handler de comandos recebidos, além do `updateNote`, tratar:
- `recruit` → `addTerminalNode(undefined, { name: cmd.name, preset: cmd.preset, role: cmd.role })`.
- `dismiss` → achar o nó (terminal) cujo `data.name === cmd.target` e `removeNode(nó.id)`.
- `connect` → achar os nós `source`/`target` por nome e `onConnect({ source: srcId, target: tgtId })` (usar handles default `null`/undefined como o React Flow espera).
Adicionar ao store um helper se necessário (ex: já há `removeNode`/`onConnect`; usar direto lendo `useCanvasStore.getState()`).

- [ ] **Step 5: Fiar `onCommand` no main (se necessário)**

`main/index.ts`: o `onCommand` já faz `mainWindow?.webContents.send(...)` (Fase 5). Confirmar que os novos tipos passam intactos (nenhuma mudança além de tipos). Nenhuma resolução nome→pty no main aqui (recruit/dismiss/connect operam por nome **no renderer**, onde o store vive).

- [ ] **Step 6: Testes + typecheck + build** — `npm test && npm run typecheck && npm run build` verdes; `out/orq/bin.js` emitido.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: orq recruit/dismiss/connect + endpoints + aplicacao no canvas (Fase 7)"`

- [ ] **Step 8: CHECKPOINT VISUAL (humano)** — `npm run dev`. (a) Criar um terminal via o preset "Shell"; criar outro via um preset de agente (ex: "Claude Code") e ver o comando `claude` ser auto-digitado (mostrará "command not found" se o CLI não estiver instalado — esperado). (b) Editar o papel de um terminal no header. (c) Num terminal, rodar `orq recruit "Rev" "shell" "Reviewer"` → um novo terminal "Rev" aparece no canvas; `orq connect "Rev" "Dev"` → um fio liga os dois; `orq dismiss "Rev"` → o terminal "Rev" some. *(Humano; o implementer para no build.)*

---

## Notas de risco
- **Timing do comando inicial:** escrito após o 1º output do shell (rc carregado). Se algum shell não emitir output antes de aceitar input, o comando ainda é enfileirado no stdin — aceitável. Validar no checkpoint.
- **recruit posição:** o renderer escolhe a posição do novo nó (cascata/offset simples). Nomes duplicados: `dismiss`/`connect` resolvem para o primeiro match (mesma convenção da Fase 6).
- **Comandos de preset** (`claude`/`codex`/`gemini`) são chutes plausíveis dos CLIs reais; são dados editáveis e um CLI ausente falha visivelmente sem quebrar o PTY. Ajuste fino é do usuário.
- **Validação zod nos boundaries** (spec §8, Fase 9) continua adiada; a validação manual de strings nos endpoints é o seam atual.
