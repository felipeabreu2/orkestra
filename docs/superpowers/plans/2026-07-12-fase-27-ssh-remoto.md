# Orkestra — Fase 27 (SSH Remoto) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Um **terminal remoto**: em vez de um shell local, o pty roda `ssh <destino>` usando o binário `ssh` do sistema e o `~/.ssh` (config/chaves) do usuário. O usuário cria um terminal SSH informando um destino (`[user@]host` ou um alias do `~/.ssh/config`); tudo o mais (xterm, atenção, papéis, palette) funciona igual, mas conectado à máquina remota.

**Architecture:** O renderer envia **apenas `sshHost?: string`** (nunca um binário/args arbitrários). O **main** valida o host (`isValidSshHost`) e o mapeia para `spawn('ssh', [host])` — o host é um **argumento separado, sem shell** (injection-safe). O `PtyManager` já aceita `file?`; esta fase destrava `args?` (hoje fixo em `[]`). Um `data.sshHost` no nó de terminal (persistido) faz o `TerminalNode` spawnar em modo SSH; um badge "SSH" marca o nó; o command palette ganha "Criar terminal SSH remoto".

**Tech Stack:** node-pty `spawn('ssh', [host], opts)` (sem shell). O binário `ssh` do SO lê `~/.ssh/config` + chaves automaticamente. Vitest (spawner é injetável — testa-se o caminho ssh sem ssh real).

## Global Constraints

- **Superfície de privilégio mínima:** o IPC `pty:spawn` NUNCA aceita `file`/`args` do renderer — só `sshHost?: string`. O mapeamento `sshHost → {file:'ssh', args:[host]}` acontece **no main**, após validar. Isso impede o renderer de rodar um binário arbitrário.
- **Sem shell / sem injeção:** o host vai como **arg** de `spawn('ssh', [host])` (node-pty `(file, args[])`), nunca concatenado numa string de shell nem via `initialCommand` (que é escrito cru no pty). `isValidSshHost` rejeita host que começa com `-` (evita injeção de opção do `ssh`) e qualquer caractere fora de `[a-zA-Z0-9._@-]`.
- **Preservar invariantes de pty:** `PtyManager` continua sem construir strings de shell; `FileTreeService` (execFile) e o resto intactos. Renderer/preload não importam `fs`/`http`/`node-pty`/`child_process`.
- **zustand v5:** nenhum seletor derivado (filter/map) novo sem `useShallow` (ver [[reference_orkestra_zustand_v5]]).
- **Fora do MVP:** drag-drop de arquivo via túnel (scp/rsync) — refinamento futuro. Zero regressão a terminais locais/`orq`/palette/papéis. PT-BR, sem marcas de terceiros.

---

### Task 1: `isValidSshHost` puro + `args` no `PtyManager` — TDD

**Files:**
- Create: `src/shared/ssh.ts` (+ `.test.ts`)
- Modify: `src/main/pty/PtyManager.ts` (+ `.test.ts`)

**Interfaces:**
- Produces: `export function isValidSshHost(host: string): boolean`; `PtyManager.spawn` passa a aceitar `args?: string[]`.

- [ ] **Step 1: Teste de `isValidSshHost` (falha primeiro)**

`src/shared/ssh.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isValidSshHost } from './ssh'

describe('isValidSshHost', () => {
  it('aceita host, IP, user@host e alias', () => {
    expect(isValidSshHost('meuservidor')).toBe(true)
    expect(isValidSshHost('192.168.0.1')).toBe(true)
    expect(isValidSshHost('user@host.com')).toBe(true)
    expect(isValidSshHost('deploy@10.0.0.5')).toBe(true)
  })
  it('rejeita vazio, começando com hífen (injeção de opção) e comprimento excessivo', () => {
    expect(isValidSshHost('')).toBe(false)
    expect(isValidSshHost('   ')).toBe(false)
    expect(isValidSshHost('-oProxyCommand=x')).toBe(false)
    expect(isValidSshHost('a'.repeat(256))).toBe(false)
  })
  it('rejeita metacaracteres de shell e espaços', () => {
    expect(isValidSshHost('host; rm -rf /')).toBe(false)
    expect(isValidSshHost('a|b')).toBe(false)
    expect(isValidSshHost('a&b')).toBe(false)
    expect(isValidSshHost('a$b')).toBe(false)
    expect(isValidSshHost('a b')).toBe(false)
    expect(isValidSshHost('a`b`')).toBe(false)
  })
})
```

- [ ] **Step 2: Implementar `ssh.ts`**
```ts
export function isValidSshHost(host: string): boolean {
  const h = host.trim()
  if (h.length === 0 || h.length > 255) return false
  if (h.startsWith('-')) return false // evita que o ssh trate o destino como opção
  return /^[a-zA-Z0-9]([a-zA-Z0-9._@-]*[a-zA-Z0-9])?$/.test(h)
}
```

- [ ] **Step 3: Rodar → verde** (`npm test -- ssh`).

- [ ] **Step 4: `PtyManager` — destravar `args` (TDD)**

Em `PtyManager.test.ts`, adicionar (seguindo o padrão do teste de `file` existente):
```ts
it('spawn com file e args passa-os ao spawner (caminho ssh)', () => {
  const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
  const mgr = new PtyManager(spawner)
  mgr.spawn({ file: 'ssh', args: ['user@host'] })
  const call = spawner.mock.calls[0]
  expect(call[0]).toBe('ssh')
  expect(call[1]).toEqual(['user@host'])
})
it('spawn sem args mantém o array vazio (shell local)', () => {
  const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
  const mgr = new PtyManager(spawner)
  mgr.spawn({})
  expect(spawner.mock.calls[0][1]).toEqual([])
})
```
Implementar: no tipo do param de `spawn`, adicionar `args?: string[]`; trocar `this.spawner(file, [], {...})` por `this.spawner(file, opts.args ?? [], {...})`. Nada mais muda.

- [ ] **Step 5: Testes + typecheck + build + lint** — `npm test` (verde, +5), `npm run typecheck`, `npm run build`, `npm run lint` — limpos.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: isValidSshHost + PtyManager aceita args (base p/ ssh) (Fase 27)"`

---

### Task 2: IPC `sshHost` (valida + mapeia no main) + preload — TDD

**Files:**
- Modify: `src/main/pty/registerPtyIpc.ts` (+ `.test.ts`), `src/preload/index.ts`

**Interfaces:**
- Consumes: `isValidSshHost` (Task 1), `PtyManager.spawn({ file, args })` (Task 1).
- Produces: `pty:spawn` aceita `{ ...opts, sshHost?: string }`; se `sshHost` presente e válido → `spawn({ file:'ssh', args:[host] })`; se inválido → erro (não spawna). Preload: `sshHost?` no tipo de `spawn`.

- [ ] **Step 1: Teste do IPC (falha primeiro)**

Em `registerPtyIpc.test.ts` (padrão existente com IPC/spawner fakes):
```ts
it('sshHost válido spawna ssh com o host como arg (sem shell)', async () => {
  const { ipc, spawner } = setup() // usar o helper/estrutura já existente no arquivo
  await ipc.handlers.get('pty:spawn')!({}, { sshHost: 'user@host', nodeId: 'n1' })
  const call = spawner.mock.calls[0]
  expect(call[0]).toBe('ssh')
  expect(call[1]).toEqual(['user@host'])
})
it('sshHost inválido é rejeitado e não spawna nada', async () => {
  const { ipc, spawner } = setup()
  await expect(ipc.handlers.get('pty:spawn')!({}, { sshHost: 'a; rm -rf /' })).rejects.toThrow()
  expect(spawner).not.toHaveBeenCalled()
})
```
(Adaptar `setup()` à forma real como o arquivo monta `ipc`/`spawner`/`mgr` — ver os testes de cwd existentes ~linhas 110-132 e replicar a montagem.)

- [ ] **Step 2: Implementar no `registerPtyIpc.ts`**

Importar `isValidSshHost` de `../../shared/ssh`. No `SpawnOpts`, adicionar `sshHost?: string`. No handler `pty:spawn`:
```ts
ipcMain.handle('pty:spawn', (_e, opts: SpawnOpts) => {
  const o = opts ?? {}
  const cwd = o.cwd ?? getProjectCwd?.()
  const { sshHost, ...rest } = o
  let sshFields: { file?: string; args?: string[] } = {}
  if (sshHost !== undefined) {
    if (!isValidSshHost(sshHost)) {
      throw new Error('Destino SSH inválido')
    }
    sshFields = { file: 'ssh', args: [sshHost.trim()] }
  }
  const id = ptyManager.spawn({ ...rest, ...sshFields, cwd, env: getEnv() })
  ptyManager.onData(id, (data) => getSender()?.send('pty:data', id, data))
  onSpawn(id)
  return id
})
```
(Manter todo o resto do handler igual. O `throw` numa `ipcMain.handle` vira uma rejeição da `invoke` no renderer — o `TerminalNode` já tem `.catch` no spawn, então mostra o erro no terminal.)

- [ ] **Step 3: Preload** — em `src/preload/index.ts`, adicionar `sshHost?: string` ao tipo de opts de `spawn` (o objeto é repassado inteiro via `invoke`, então só o tipo muda):
```ts
spawn: (opts: {
  cwd?: string
  cols?: number
  rows?: number
  nodeId?: string
  initialCommand?: string
  sshHost?: string
}): Promise<string> => ipcRenderer.invoke('pty:spawn', opts),
```

- [ ] **Step 4: Testes + typecheck + build + lint** — `npm test` (verde, +2), `npm run typecheck`, `npm run build`, `npm run lint` — limpos.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: pty:spawn aceita sshHost (valida no main + mapeia p/ ssh) + preload (Fase 27)"`

---

### Task 3: `data.sshHost` no store + spawn SSH no `TerminalNode` + badge — TDD

**Files:**
- Modify: `src/renderer/src/store/canvasStore.ts` (+ `.test.ts`), `src/renderer/src/components/TerminalNode.tsx`, `src/renderer/src/components/TerminalFlowNode.tsx` (+ `nodes.css`)

**Interfaces:**
- Consumes: `window.orkestra.pty.spawn({ sshHost })` (Task 2).
- Produces: `addTerminalNode(position?, opts?: { name?; url?; preset?; sshHost?: string })` guarda `data.sshHost`; `TerminalNode` spawna em modo SSH quando `data.sshHost` presente.

- [ ] **Step 1: Store `addTerminalNode` aceita `sshHost` (TDD)** — teste em `canvasStore.test.ts`:
```ts
it('addTerminalNode com sshHost guarda data.sshHost e sobrevive ao round-trip', () => {
  useCanvasStore.getState().addTerminalNode(undefined, { name: 'SSH', sshHost: 'user@host' })
  const n = useCanvasStore.getState().nodes[0]
  expect((n.data as { sshHost?: string }).sshHost).toBe('user@host')
  const snap = useCanvasStore.getState().serialize()
  useCanvasStore.setState({ nodes: [], edges: [] })
  useCanvasStore.getState().hydrate(snap)
  expect((useCanvasStore.getState().nodes[0].data as { sshHost?: string }).sshHost).toBe('user@host')
})
```
Implementar: estender o tipo de `opts` de `addTerminalNode` com `sshHost?: string`; no `data` do nó criado, incluir `sshHost: opts?.sshHost` (só quando definido, ou sempre — o serialize genérico carrega; NÃO adicionar `sshHost` à lista de `delete` do serialize, pois queremos persistir). Preservar `name`/`preset`/`role`/`autostart` existentes.

- [ ] **Step 2: `TerminalNode.tsx` — spawnar em modo SSH** — READ o arquivo; onde hoje faz `spawn({ cols, rows, nodeId, initialCommand })`, ler `sshHost` das props/data e ramificar:
  - Passar `sshHost` como prop de `TerminalFlowNode` → `TerminalNode` (como `preset`/`autostart` já são passados), OU ler de `data`. Seguir o padrão de `preset`/`autostart`.
  - Se `sshHost` presente: `spawn({ cols: term.cols, rows: term.rows, nodeId, sshHost })` (sem `initialCommand` — o ssh já é o processo).
  - Se ausente: comportamento atual (`initialCommand` do preset).
  ```tsx
  const spawnOpts = sshHost
    ? { cols: term.cols, rows: term.rows, nodeId, sshHost }
    : { cols: term.cols, rows: term.rows, nodeId, initialCommand }
  window.orkestra.pty.spawn(spawnOpts).then((id) => { /* ...igual... */ })
  ```

- [ ] **Step 3: `TerminalFlowNode.tsx` — badge "SSH"** — ler `const sshHost = (data as { sshHost?: string }).sshHost`; quando presente, exibir um badge no header (ex.: `SSH` com `title={sshHost}`), e passar `sshHost` como prop ao `<TerminalNode>`. CSS `.ork-ssh-badge` (usar `--accent` ou `--ok`).
```tsx
{sshHost && (
  <span className="ork-ssh-badge" title={`Remoto: ${sshHost}`}>SSH</span>
)}
// e no host:
<TerminalNode nodeId={id} preset={preset} autostart={autostart} sshHost={sshHost} />
```
CSS:
```css
.ork-ssh-badge {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 0 5px;
  border-radius: var(--radius-sm);
  color: var(--accent-text);
  background: var(--accent);
}
```

- [ ] **Step 4: Testes + typecheck + build + lint** — `npm test` (verde), `npm run typecheck`, `npm run build`, `npm run lint` — limpos.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: data.sshHost + spawn SSH no TerminalNode + badge SSH (Fase 27)"`

---

### Task 4: Criar terminal SSH pela palette (+ checkpoint)

**Files:**
- Modify: `src/renderer/src/palette/paletteCommands.ts` (+ `.test.ts`), `src/renderer/src/components/CommandPalette.tsx`

**Interfaces:**
- Consumes: `addTerminalNode({ sshHost })` (Task 3), `isValidSshHost` (Task 1, para validação de UX no cliente).
- Produces: `PaletteActions.addSshTerminal(host: string)`; item global "Criar terminal SSH remoto" com `input`.

- [ ] **Step 1: `paletteCommands.ts` — item de criação SSH (TDD)** — adicionar `addSshTerminal: (host: string) => void` a `PaletteActions`, e um item global:
```ts
items.push({
  id: 'action:ssh',
  label: 'Criar terminal SSH remoto',
  kind: 'action',
  input: { placeholder: 'destino (ex.: user@host ou alias do ~/.ssh/config)', initial: '', submit: (v) => actions.addSshTerminal(v) }
})
```
Teste (em `paletteCommands.test.ts`): o item `action:ssh` existe, tem `input`, e `input.submit('user@host')` chama `actions.addSshTerminal` com `'user@host'`.

- [ ] **Step 2: `CommandPalette.tsx` — fiar `addSshTerminal`** — no objeto `actions` passado a `buildPaletteItems`, adicionar:
```ts
addSshTerminal: (host: string) => {
  const h = host.trim()
  if (!isValidSshHost(h)) return // validação de UX; o main revalida
  addTerminalNode(undefined, { name: `SSH: ${h}`, sshHost: h })
}
```
(Importar `isValidSshHost` de `../../../shared/ssh`; `addTerminalNode` já é um selector do store no arquivo — confirmar; se não, adicionar `const addTerminalNode = useCanvasStore((s) => s.addTerminalNode)`, um selector de ação estável, seguro no zustand v5.)

- [ ] **Step 3: Testes + typecheck + build + lint** — `npm test` (verde), `npm run typecheck`, `npm run build`, `npm run lint` — limpos.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: criar terminal SSH remoto pela palette (Fase 27)"`

- [ ] **Step 5: CHECKPOINT VISUAL (humano)** — `npm run dev`. Cmd+K → "Criar terminal SSH remoto" → digitar um destino real (um host do seu `~/.ssh/config` ou `user@ip` com chave configurada) → surge um terminal com badge "SSH" que **conecta ao remoto** (prompt da máquina remota); rodar `hostname`/`ls` confirma que é remoto. Fechar/reabrir → o terminal SSH persiste (reconecta ao reabrir). Testar um destino inválido (`a; rm`) na palette → não cria (validação); um host inexistente → o `ssh` reporta o erro no próprio terminal. Confirmar que terminais locais e `orq` seguem normais.

---

## Notas de risco
- **Segurança (núcleo da fase):** o renderer só pede `sshHost`; o main valida (`isValidSshHost`, rejeita `-…` e metacaracteres) e spawna `ssh` com o host como **arg** (node-pty `(file,args)`, sem shell) — sem injeção de comando nem de opção. O IPC nunca aceita binário/args arbitrários. Validação em duas camadas (cliente p/ UX, main p/ segurança).
- **`~/.ssh` e autenticação:** o `ssh` do SO usa `~/.ssh/config` + chaves/agent automaticamente. Se a chave pede passphrase e não há agent, o `ssh` pede no próprio terminal (o pty é interativo) — funciona. Autenticação por senha idem (o prompt aparece no terminal). **Não** manipulamos chaves/senhas.
- **Persistência/reconexão:** `data.sshHost` persiste; ao reabrir o app, o terminal re-spawna `ssh <host>` (reconecta). Uma sessão remota derrubada mostra o erro do `ssh` no terminal (sem crash).
- **Detecção de ociosidade/atenção:** funciona igual (é o mesmo pipeline de pty) — o output remoto passa pelos mesmos canais.
- **Fora do escopo:** túnel de porta, drag-drop de arquivo (scp/rsync), multiplexação — refinamentos futuros. O MVP entrega o terminal remoto interativo, que é o núcleo do "SSH remoto" do mapa.
- **Windows:** assume um `ssh` no PATH (OpenSSH client, presente no Windows 10+). Se ausente, o spawn falha e o `ssh` reporta — documentar.
