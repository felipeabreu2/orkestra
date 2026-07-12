# Orkestra — Fase 25 (Portais com Sessão Isolada/Linkável) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cada portal passa a ter uma **sessão isolada** (cookies/localStorage próprios via `partition` do `<webview>`), permitindo **multi-conta** — logar em contas diferentes do mesmo site em portais diferentes. Um portal pode ser **linkado** a outro para **compartilhar a sessão** (mesma partition). A sessão isolada é o padrão; linkar é uma escolha no header do portal.

**Architecture:** Uma função pura `partitionForPortal(nodeId, linkedTo?)` deriva a string de partition: `persist:portal-<linkedTo ?? nodeId>` — persistente (login sobrevive a reinícios), única por nó por padrão, ou a do portal-fonte quando linkado. O `<webview>` recebe `partition={…}` e um `key={partition}` no `<PortalNode>` (remonta ao trocar, re-registrando no `portalRegistry`). O único estado persistido novo é `data.linkedTo?: string` (nodeId do portal-fonte, ou ausente = isolado) — round-trip genérico, sem mudança em serialize/hydrate. O header do portal ganha um seletor de sessão (Isolada / Compartilhar com <portal>).

**Tech Stack:** Electron 33 `<webview partition>` (`persist:` = storage persistente). React 18. Vitest (`*.test.ts`) — a lógica de partition fica num módulo puro.

## Global Constraints

- **Preservar o hardening do webview:** `webviewTag: true` (`main/index.ts:102`) e o handler `will-attach-webview` (`main/index.ts:107-111`, que faz `delete webPreferences.preload` + `nodeIntegration=false` + `contextIsolation=true`) ficam **intactos**. A `partition` é um atributo do tag (em `_params`), ortogonal a esse handler — não o toca.
- **Não quebrar o `orq portal`:** a resolução é por `data.name → nodeId → getPortal(nodeId)` (`useOrchestrationSync.ts`). `partition`/`linkedTo` não afetam nome nem o registry. O remount por `key` deve **re-registrar** o webview (o `useEffect [nodeId]` do `PortalNode` re-roda no remount) — garantir isso.
- **Partition persistente e isolada por padrão:** `persist:portal-<nodeId>` (nodeId é estável e único). Isolamento real de cookies/storage entre portais não-linkados.
- Renderer não importa `fs`/`http`/`node-pty`/`child_process`. Zero regressão a terminais/notas/árvore/conexões/palette/`orq`. PT-BR, sem marcas de terceiros.

---

### Task 1: `partitionForPortal` puro + `updatePortalLink` no store + tipo JSX — TDD

**Files:**
- Create: `src/renderer/src/portalPartition.ts` (+ `.test.ts`)
- Modify: `src/renderer/src/store/canvasStore.ts` (+ `.test.ts`), `src/renderer/src/env.d.ts`

**Interfaces:**
- Produces:
  ```ts
  export function partitionForPortal(nodeId: string, linkedTo?: string): string
  // store: updatePortalLink(id: string, linkedTo?: string): void  (data.linkedTo)
  ```

- [ ] **Step 1: Teste do módulo puro (falha primeiro)**

`src/renderer/src/portalPartition.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { partitionForPortal } from './portalPartition'

describe('partitionForPortal', () => {
  it('portal isolado usa o próprio nodeId (persistente)', () => {
    expect(partitionForPortal('portal-1')).toBe('persist:portal-portal-1')
  })
  it('portal linkado usa a partition do portal-fonte', () => {
    expect(partitionForPortal('portal-2', 'portal-1')).toBe('persist:portal-portal-1')
  })
  it('linkedTo vazio/undefined cai no próprio', () => {
    expect(partitionForPortal('portal-3', '')).toBe('persist:portal-portal-3')
    expect(partitionForPortal('portal-3', undefined)).toBe('persist:portal-portal-3')
  })
})
```

- [ ] **Step 2: Implementar `portalPartition.ts`**
```ts
export function partitionForPortal(nodeId: string, linkedTo?: string): string {
  return `persist:portal-${linkedTo || nodeId}`
}
```

- [ ] **Step 3: Rodar → verde** (`npm test -- portalPartition`).

- [ ] **Step 4: `updatePortalLink` no store (TDD)** — teste em `canvasStore.test.ts`:
```ts
it('updatePortalLink define e limpa o linkedTo do portal', () => {
  useCanvasStore.getState().addPortalNode(undefined, { name: 'A' })
  useCanvasStore.getState().addPortalNode(undefined, { name: 'B' })
  const [a, b] = useCanvasStore.getState().nodes
  useCanvasStore.getState().updatePortalLink(b.id, a.id)
  expect((useCanvasStore.getState().nodes[1].data as { linkedTo?: string }).linkedTo).toBe(a.id)
  useCanvasStore.getState().updatePortalLink(b.id, undefined)
  expect((useCanvasStore.getState().nodes[1].data as { linkedTo?: string }).linkedTo).toBeUndefined()
})
it('linkedTo do portal sobrevive ao round-trip', () => {
  useCanvasStore.getState().addPortalNode(undefined, { name: 'A' })
  useCanvasStore.getState().addPortalNode(undefined, { name: 'B' })
  const [a, b] = useCanvasStore.getState().nodes
  useCanvasStore.getState().updatePortalLink(b.id, a.id)
  const snap = useCanvasStore.getState().serialize()
  useCanvasStore.setState({ nodes: [], edges: [] })
  useCanvasStore.getState().hydrate(snap)
  const restored = useCanvasStore.getState().nodes.find((n) => n.id === b.id)
  expect((restored?.data as { linkedTo?: string }).linkedTo).toBe(a.id)
})
```
Implementar (declarar no tipo do store + impl, no padrão dos outros `updatePortal*`):
```ts
updatePortalLink: (id, linkedTo): void =>
  set((state) => ({
    nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, linkedTo } } : n))
  })),
```

- [ ] **Step 5: Tipo JSX do webview** — em `src/renderer/src/env.d.ts`, ao tipo do `webview` (hoje `& { src?: string }`), adicionar `partition?: string`:
```ts
webview: DetailedHTMLProps<HTMLAttributes<WebviewTag>, WebviewTag> & {
  src?: string
  partition?: string
}
```

- [ ] **Step 6: Testes + typecheck + build + lint** — `npm test` (verde, +5), `npm run typecheck`, `npm run build`, `npm run lint` — limpos.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: partitionForPortal + updatePortalLink (data.linkedTo) + tipo partition no webview (Fase 25)"`

---

### Task 2: `partition` no webview + seletor de sessão no header (+ checkpoint)

**Files:**
- Modify: `src/renderer/src/components/PortalNode.tsx`, `src/renderer/src/components/PortalFlowNode.tsx`, `src/renderer/src/components/nodes.css`

**Interfaces:**
- Consumes: `partitionForPortal` (Task 1), store `updatePortalLink`, `nodes` (para listar portais-fonte).

- [ ] **Step 1: `PortalNode.tsx` — aceitar e aplicar `partition`**

Estender a assinatura do `forwardRef` para incluir `partition: string` nas props, e aplicá-la no `<webview>`:
```tsx
// props: { url: string; nodeId: string; name: string; partition: string }
return <webview ref={setRef} src={url} partition={partition} style={{ width: '100%', height: '100%' }} />
```
Manter todo o resto (o `setRef`, o `useEffect [nodeId]` de registro/desregistro, o snapshot em `did-finish-load`) idêntico. **Não** mudar o `useEffect` de registro — ele re-roda no remount (Task 2 Step 2 coloca o `key`).

- [ ] **Step 2: `PortalFlowNode.tsx` — derivar a partition, remount por `key`, seletor de sessão**

- Ler `linkedTo`: `const linkedTo = data.linkedTo as string | undefined`.
- Derivar: `const partition = partitionForPortal(id, linkedTo)` (importar de `../portalPartition`).
- Passar ao `<PortalNode>` com `key={partition}` (força remount ao trocar partition → re-registra o webview):
  ```tsx
  <PortalNode key={partition} ref={webviewRef} url={url} nodeId={id} name={name} partition={partition} />
  ```
- Seletor de sessão no header (perto do nome/endereço). Listar outros portais como fontes:
  ```tsx
  const portals = useCanvasStore((s) => s.nodes.filter((n) => n.type === 'portal' && n.id !== id))
  const updatePortalLink = useCanvasStore((s) => s.updatePortalLink)
  // ...
  <select
    className="nodrag ork-portal-session"
    value={linkedTo ?? ''}
    onChange={(e) => updatePortalLink(id, e.target.value || undefined)}
    title="Sessão do portal (cookies/login). Isolada = conta própria; compartilhar = mesma sessão de outro portal."
  >
    <option value="">Sessão isolada</option>
    {portals.map((p) => (
      <option key={p.id} value={p.id}>
        Compartilhar: {(p.data?.name as string) ?? 'Portal'}
      </option>
    ))}
  </select>
  ```
  (Posicionar o `<select>` no header sem quebrar o layout do endereço/nome existentes — ajustar o flex do header conforme necessário.)

- [ ] **Step 3: CSS em `nodes.css`** — o seletor de sessão:
```css
.ork-portal-session {
  font-size: 11px;
  color: var(--text-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 1px 4px;
  max-width: 160px;
}
.ork-portal-session:hover {
  border-color: var(--border-strong);
}
```

- [ ] **Step 4: Testes + typecheck + build + lint** — `npm test` (verde), `npm run typecheck`, `npm run build`, `npm run lint` — limpos.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: webview com partition por portal + seletor de sessao (isolada/compartilhar) (Fase 25)"`

- [ ] **Step 6: CHECKPOINT VISUAL (humano)** — `npm run dev`. Criar dois portais no mesmo site que exige login (ex.: um webmail): logar em contas diferentes em cada → cada um mantém sua conta (sessões isoladas). No header de um portal, escolher "Compartilhar: <outro>" → ele recarrega e passa a ver a sessão do outro (mesmo login). Voltar para "Sessão isolada" → recarrega com a própria sessão. Fechar/reabrir o app → o login persiste (partition `persist:`). Confirmar que `orq portal <nome> open <url>` ainda dirige o portal certo (o remount não quebrou o registry).

---

## Notas de risco
- **Remount ao trocar sessão:** mudar a partition recria o `<webview>` (novo `key`), então a navegação atual recarrega — esperado e aceitável (é uma ação deliberada). O `key` garante que o `PortalNode` remonta e o `useEffect [nodeId]` re-registra o novo webview no `portalRegistry` (senão o `orq portal` apontaria para um webview morto) — **validar no checkpoint**.
- **Partition persistente:** `persist:portal-<nodeId>` guarda cookies/storage em disco (login sobrevive a reinícios). Isso é desejável (multi-conta persistente), mas acumula dados por portal — limpeza/expurgo de sessão é refinamento futuro (o mapa não pede).
- **Linkar transitivo:** se A→B e B→C, A usa a partition de B (não segue a cadeia até C). Aceitável no MVP — o seletor lista todos os portais; o usuário escolhe a fonte direta. Documentar.
- **Segurança inalterada:** a partition isola dados entre guests; o hardening (`will-attach-webview`, sem preload, `nodeIntegration=false`) continua aplicado a todos os webviews. A `partition` não abre superfície nova — ela restringe.
- **`orq portal` intacto:** resolução por nome/nodeId não muda; só o webview interno ganha `partition`. O snapshot/click/fill/eval continuam via `getPortal(nodeId)`.
