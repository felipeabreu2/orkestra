# Onda 3 — Barra contextual do terminal (F04/F05) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps em checkbox.

**Goal:** Ao selecionar **um** nó, abrir abaixo da barra superior uma barra de ações (imagem 4/5). Para terminal: **renomear · nº de ligações · reverter · apagar**. Outros tipos: ligações · reverter · apagar.

**Architecture:** Novo componente `NodeToolbar` que reusa o visual `.ork-toolbar` (mesma base da barra de alinhar) ancorado top-center a 56px. Renderizado pelo `Canvas` quando `selectedNodes.length === 1` (a barra de alinhar cobre `>= 2` — nunca colidem). Consome ações já existentes no store: `updateTerminalName`/foco, `removeNode`, `undo` (Onda 4) e deriva o nº de ligações das `edges`.

**Tech Stack:** React 18, `@xyflow/react` 12, zustand 5. Ícones via wrapper `Icon` ([[reference_orkestra_icons]]).

## Global Constraints

- UI/comentários/commits em **português**. Sem novas dependências.
- Teste: componente puramente de UI → `typecheck`/`lint`/`build` + checkpoint visual (comparar `docs/images/4.png` e `5.png`). A lógica testável (contagem de ligações) é trivial e inline; sem novo `*.test.ts`.
- **zustand v5:** `edges` é selecionado como referência direta (não derivado) — a contagem é computada no render. `past.length > 0` é primitivo. Sem `useShallow`.

---

### Task 1: Componente `NodeToolbar` + CSS + integração no `Canvas`

**Files:**
- Create: `src/renderer/src/components/NodeToolbar.tsx`
- Modify: `src/renderer/src/components/Canvas.css` (âncora top-center, reaproveitando `.ork-arrange-toolbar`)
- Modify: `src/renderer/src/components/Canvas.tsx` (renderizar para seleção única)

**Interfaces:**
- Consumes: `useCanvasStore` → `edges`, `removeNode`, `undo`, `past`. Recebe o nó selecionado por prop.
- Produces: `NodeToolbar({ node }: { node: Node }): JSX.Element`.

- [ ] **Step 1: Criar `NodeToolbar.tsx`**

```tsx
import type { JSX } from 'react'
import type { Node } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { Icon } from './Icon'

// Barra de ações que abre abaixo da barra superior quando UM nó está selecionado (F04/F05,
// imagem 4/5). Reusa o visual .ork-toolbar (fundo/borda/sombra/fade-in) com a âncora top-center
// da .ork-arrange-toolbar. Terminal ganha "renomear"; todos os tipos têm ligações/reverter/apagar.
export function NodeToolbar({ node }: { node: Node }): JSX.Element {
  const edges = useCanvasStore((s) => s.edges)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const undo = useCanvasStore((s) => s.undo)
  const canUndo = useCanvasStore((s) => s.past.length > 0)

  const linkCount = edges.filter((e) => e.source === node.id || e.target === node.id).length
  const isTerminal = node.type === 'terminal'

  // Renomear: foca o input de nome DENTRO do nó selecionado (o React Flow marca o nó com a classe
  // `selected`; o input do terminal/nó tem a classe `ork-node-input`). Sem novo estado — o campo
  // de edição já existe no header do nó.
  const rename = (): void => {
    const el = document.querySelector<HTMLInputElement>('.react-flow__node.selected .ork-node-input')
    el?.focus()
    el?.select()
  }

  return (
    <div className="ork-toolbar ork-node-toolbar" role="toolbar" aria-label="Ações do nó">
      {isTerminal && (
        <button className="ork-toolbar-btn ork-node-toolbar-icon" onClick={rename} title="Renomear" aria-label="Renomear">
          <Icon name="Pencil" size={16} animation="wiggle" />
        </button>
      )}
      <span className="ork-node-toolbar-links" title={`${linkCount} conexão(ões) neste nó`} aria-label={`${linkCount} conexões`}>
        <Icon name="GitBranch" size={16} animation="none" />
        <span className="ork-node-toolbar-badge">{linkCount}</span>
      </span>
      <button
        className="ork-toolbar-btn ork-node-toolbar-icon"
        onClick={() => undo()}
        disabled={!canUndo}
        title="Reverter a última ação"
        aria-label="Reverter"
      >
        <Icon name="Undo2" size={16} animation="nudge" />
      </button>
      <button
        className="ork-toolbar-btn ork-node-toolbar-icon ork-node-toolbar-danger"
        onClick={() => removeNode(node.id)}
        title="Apagar"
        aria-label="Apagar"
      >
        <Icon name="Trash2" size={16} animation="bounce" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: CSS em `Canvas.css`**

A `.ork-node-toolbar` compartilha a âncora top-center da `.ork-arrange-toolbar`. Trocar o seletor existente para cobrir as duas e acrescentar o estilo do badge/ícones. Localizar:
```css
.ork-arrange-toolbar {
  top: 56px; /* abaixo da barra superior (Fase 30, header de 44px) */
  left: 50%;
  transform: translateX(-50%);
  flex-wrap: wrap;
  max-width: calc(100% - 24px);
```
e trocar a primeira linha do seletor para incluir ambas:
```css
.ork-arrange-toolbar,
.ork-node-toolbar {
  top: 56px; /* abaixo da barra superior (Fase 30, header de 44px) */
  left: 50%;
  transform: translateX(-50%);
  flex-wrap: wrap;
  max-width: calc(100% - 24px);
```
E adicionar, logo após o fechamento desse bloco, o estilo específico do NodeToolbar:
```css
/* Onda 3 (F04/F05): botões só-ícone e o "chip" de contagem de ligações (número em destaque). */
.ork-node-toolbar-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
}
.ork-node-toolbar-links {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  color: var(--text-2);
}
.ork-node-toolbar-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: var(--accent);
  border-radius: 9px;
}
.ork-node-toolbar-danger:hover {
  color: var(--danger, #e5484d);
}
```

- [ ] **Step 3: Renderizar no `Canvas.tsx`**

Import no topo:
```ts
import { NodeToolbar } from './NodeToolbar'
```
`selectedNodes` já é calculado (`const selectedNodes = nodes.filter((n) => n.selected)`). A barra de alinhar já usa `selectedNodes.length >= 2`. Adicionar, logo ANTES desse bloco `{selectedNodes.length >= 2 && (`, o caso de seleção única:
```tsx
      {selectedNodes.length === 1 && <NodeToolbar node={selectedNodes[0]} />}
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: verdes.

- [ ] **Step 5: Checkpoint visual (comparar `docs/images/4.png` e `5.png`)**

Run: `npm run dev`
Verificar:
- Clicar num terminal abre a barra abaixo da topbar com 4 itens: renomear (lápis), ligações (ramo + número), reverter, apagar.
- **Renomear** foca o campo de nome do terminal (dá para digitar o novo nome).
- **Nº de ligações** reflete quantas conexões o nó tem (ligar/desligar atualiza o número).
- **Reverter** desfaz a última ação (fica apagado sem histórico) — mesma coisa do `Cmd/Ctrl+Z`.
- **Apagar** remove o nó.
- Clicar numa **nota/portal/arquivo** mostra a barra sem o "renomear" (ligações/reverter/apagar). A barra de nota rica virá na Onda 5.
- Selecionar 2+ nós troca para a barra de alinhar (sem colisão).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/NodeToolbar.tsx src/renderer/src/components/Canvas.css src/renderer/src/components/Canvas.tsx
git commit -m "feat(canvas): barra contextual do no — renomear/ligacoes/reverter/apagar (F04/F05)"
```

---

## Self-Review

**Cobertura (Onda 3 do spec):** barra abaixo da topbar com 1 nó selecionado → Step 3; terminal com renomear/ligações/reverter/apagar → Step 1; reverter consome `undo` da Onda 4; nº de ligações derivado das edges. ✓

**Placeholders:** nenhum — código real.

**Type consistency:** `NodeToolbar({ node }: { node: Node })` recebe `selectedNodes[0]` (um `Node` do `@xyflow/react`); `undo`/`past` conforme o store da Onda 4; `removeNode(id)` já existente.

**Decisão:** "renomear" foca o input já existente no header (via `.selected .ork-node-input`) em vez de duplicar um campo na barra — menos estado, sem divergência de fonte da verdade do nome. Fora de escopo: barra rica da nota (Onda 5).
