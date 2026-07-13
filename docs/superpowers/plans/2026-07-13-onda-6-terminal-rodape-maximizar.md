# Onda 6 — Terminal: rodapé + maximizar/restaurar (F03 visual) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps em checkbox.

**Goal:** O terminal ganha um rodapé com a **rota da pasta** (cwd) e botões de **maximizar/restaurar** (imagem 3), além de um ajuste leve de layout do header.

**Architecture:** `TerminalFlowNode` lê o `activeCwd` do store e mostra no rodapé. Maximizar guarda o tamanho atual em `data._restore`, aplica um tamanho grande e enquadra o nó via `fitView` (React Flow); restaurar volta. A troca de tamanho é uma ação do store (`toggleMaximizeNode`), testável; o `fitView` fica no componente.

**Tech Stack:** React 18, `@xyflow/react` 12, zustand 5. Ícones via wrapper `Icon`.

## Global Constraints

- UI/comentários/commits em **português**. Sem novas dependências.
- Teste: `toggleMaximizeNode` (store) → TDD (jsdom). O componente (rodapé/botão) → typecheck/lint/build + checkpoint visual (imagem 3).
- Rastreamento dinâmico de `cd` (OSC 7) fica **fora de escopo** — o rodapé mostra o cwd do projeto.
- `_restore` é persistido no `data` (não removido no serialize): reabrir um terminal maximizado ainda oferece "restaurar".

---

### Task 1: `toggleMaximizeNode` no store

**Files:**
- Modify: `src/renderer/src/store/canvasStore.ts` (interface + ação)
- Modify: `src/renderer/src/store/canvasStore.test.ts`

**Interfaces:**
- Produces: `toggleMaximizeNode(id: string): void` — alterna entre o tamanho normal e um grande (guardando/restaurando `data._restore`).

- [ ] **Step 1: Teste que falha** — adicionar ao `canvasStore.test.ts`:
```ts
describe('maximizar terminal', () => {
  it('toggleMaximizeNode aumenta e restaura o tamanho', () => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], lastCommitTag: null })
    useCanvasStore.getState().addTerminalNode({ x: 0, y: 0 })
    const id = useCanvasStore.getState().nodes[0].id
    expect(useCanvasStore.getState().nodes[0].width).toBe(480)
    useCanvasStore.getState().toggleMaximizeNode(id)
    expect(useCanvasStore.getState().nodes[0].width).toBe(1000)
    expect((useCanvasStore.getState().nodes[0].data as { _restore?: unknown })._restore).toBeTruthy()
    useCanvasStore.getState().toggleMaximizeNode(id)
    expect(useCanvasStore.getState().nodes[0].width).toBe(480)
    expect((useCanvasStore.getState().nodes[0].data as { _restore?: unknown })._restore).toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** — interface (perto de `setNodePositions`): `toggleMaximizeNode: (id: string) => void`. Implementação:
```ts
  toggleMaximizeNode: (id): void =>
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== id) return n
        const data = (n.data ?? {}) as Record<string, unknown>
        const restore = data._restore as { width: number; height: number } | undefined
        if (restore) {
          const rest = { ...data }
          delete rest._restore
          return { ...n, width: restore.width, height: restore.height, data: rest }
        }
        return {
          ...n,
          width: 1000,
          height: 640,
          data: { ...data, _restore: { width: n.width ?? 480, height: n.height ?? 320 } }
        }
      })
    })),
```

- [ ] **Step 4: Rodar e ver passar** (`npx vitest run ...canvasStore.test.ts`).

- [ ] **Step 5: Typecheck + commit**
```bash
git add src/renderer/src/store/canvasStore.ts src/renderer/src/store/canvasStore.test.ts
git commit -m "feat(canvas): toggleMaximizeNode — maximizar/restaurar tamanho do no (Onda 6)"
```

---

### Task 2: `TerminalFlowNode` — rodapé (cwd) + botão maximizar + ajuste de layout

**Files:**
- Modify: `src/renderer/src/components/TerminalFlowNode.tsx`
- Modify: `src/renderer/src/components/nodes.css`

**Interfaces:**
- Consumes: `activeCwd`, `toggleMaximizeNode` do store; `useReactFlow().fitView`; `basename` de `ui/paths`; `Icon`.

- [ ] **Step 1: Adicionar no `TerminalFlowNode.tsx`**
  - Imports: `import { useReactFlow } from '@xyflow/react'`, `import { basename } from '../ui/paths'`, `import { Icon } from './Icon'`.
  - Ler do store: `const activeCwd = useCanvasStore((s) => s.activeCwd)`, `const toggleMaximizeNode = useCanvasStore((s) => s.toggleMaximizeNode)`.
  - `const { fitView } = useReactFlow()`.
  - Detectar estado maximizado: `const maximized = Boolean((data as { _restore?: unknown })._restore)`.
  - Botão maximizar/restaurar no header (antes do × fechar):
```tsx
          <button
            className="nodrag ork-node-iconbtn"
            onClick={() => {
              toggleMaximizeNode(id)
              // enquadra o nó após o resize (no próximo frame, já com o novo tamanho aplicado)
              requestAnimationFrame(() => fitView({ nodes: [{ id }], duration: 200, padding: 0.12 }))
            }}
            aria-label={maximized ? 'Restaurar tamanho' : 'Maximizar'}
            title={maximized ? 'Restaurar' : 'Maximizar'}
          >
            <Icon name={maximized ? 'Minimize2' : 'Maximize2'} size={13} animation="none" />
          </button>
```
  - Rodapé com a rota da pasta, ao final do `.ork-node` (depois do `.ork-node-body`):
```tsx
        <div className="ork-node-footer" title={activeCwd ?? 'Nenhuma pasta vinculada'}>
          <Icon name="Folder" size={12} animation="none" />
          <span className="ork-node-footer-path">{activeCwd ?? 'sem pasta'}</span>
        </div>
```

- [ ] **Step 2: CSS em `nodes.css`** — rodapé:
```css
/* Onda 6 (F03): rodapé do terminal com a rota da pasta. */
.ork-node-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-3);
  border-top: 1px solid var(--border);
  background: var(--bg-1);
}
.ork-node-footer-path {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: rtl; /* corta o começo do caminho, mantendo o fim (a pasta) visível */
  text-align: left;
}
```

- [ ] **Step 3: Ajuste leve do header** — revisar no `.ork-node-header` se os botões novos cabem bem (o header já tem nome/papel/×); se ficar apertado, reduzir o gap. Sem reescrever o header — só garantir que maximizar/× ficam alinhados à direita.

- [ ] **Step 4: Typecheck + lint + build.**

- [ ] **Step 5: Checkpoint visual (imagem 3)** — `npm run dev`: o terminal mostra a **rota da pasta no rodapé**; o botão **maximizar** aumenta o terminal e enquadra na tela; **restaurar** volta ao tamanho anterior. O rodapé corta o começo do caminho longo (mantém o fim visível).

- [ ] **Step 6: Commit**
```bash
git add src/renderer/src/components/TerminalFlowNode.tsx src/renderer/src/components/nodes.css
git commit -m "feat(terminal): rodape com a rota da pasta + maximizar/restaurar (F03)"
```

---

## Self-Review

**Cobertura:** rodapé com cwd (T2) · maximizar/restaurar (T1+T2) · ajuste de header (T2). ✓
**Placeholders:** nenhum.
**Type consistency:** `toggleMaximizeNode(id)` entre store/teste/componente; `_restore` como `{width,height}`.
**Fora de escopo:** OSC 7 (cd dinâmico); preencher a viewport ao pixel (usamos tamanho grande + fitView).
