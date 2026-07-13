# Onda 7 — Nós de arquivo + desenho (F01 funcional) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps em checkbox.

**Goal:** Ligar os dois botões da barra que ainda estão inertes: **clip → nó de arquivo** (anexa 1 arquivo, ligável) e **desenhar → nó de desenho** (Excalidraw embutido).

**Architecture:** Nó `file` = card leve com nome/caminho/preview (lê via `filetree.read`), criado após um seletor de arquivo nativo (`pickFile`, espelhando `pickDirectory`). Nó `draw` = `<Excalidraw>` embutido num nó redimensionável, cena serializada em `data.scene`. Ambos entram em `nodeTypes` e no `serialize`/`hydrate` genérico. **Excalidraw é o ponto de risco** — smoke test (build) antes de investir; fallback = nó de desenho à mão livre (canvas 2D) se inviável.

**Tech Stack:** Electron 33 (dialog), React 18, `@xyflow/react` 12, `@excalidraw/excalidraw` (MIT), zustand 5.

## Global Constraints

- UI/comentários/commits em **português**. Ícones via wrapper `Icon`.
- Teste: `pickFile` IPC e store (`addFileNode`/`addDrawNode`) → TDD onde há lógica; componentes → typecheck/lint/build + checkpoint. `registerProjectIpc` tem teste — atualizar se a assinatura mudar.
- Arquivo: `pickFile` injetável no `registerProjectIpc` (mesmo padrão do `pickDirectory`, mantém o módulo testável sem `electron.dialog`).

---

### Task 1: Nó de arquivo (clip)

**Files:**
- Modify: `src/main/projects/registerProjectIpc.ts` (+ `pickFile`), `src/main/projects/registerProjectIpc.test.ts` (se afirmar a assinatura)
- Modify: `src/main/index.ts` (passar o `pickFile` real)
- Modify: `src/preload/index.ts` (`projects.pickFile`)
- Modify: `src/renderer/src/store/canvasStore.ts` (+ `addFileNode`) e `.test.ts`
- Create: `src/renderer/src/components/FileNode.tsx`
- Modify: `src/renderer/src/components/Canvas.tsx` (nodeTypes + onFile), `src/renderer/src/components/Topbar.tsx` (habilitar clip)

**Interfaces:**
- Produces: `pickFile(): Promise<string|null>`; `addFileNode(position?, opts?: { path?: string; width?: number; height?: number }): void`.

- [ ] **Step 1: IPC `pickFile`** — em `registerProjectIpc.ts`: adicionar `export type PickFile = () => Promise<string | null>` e o 4º parâmetro `pickFile?: PickFile`; registrar:
```ts
  ipcMain.handle('projects:pickFile', async () => (pickFile ? await pickFile() : null))
```
Em `main/index.ts`, passar o callback (após o `pickDirectory`):
```ts
  , async () => {
    const r = mainWindow
      ? await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] })
      : await dialog.showOpenDialog({ properties: ['openFile'] })
    return r.canceled ? null : r.filePaths[0]
  })
```
Em `preload/index.ts`, dentro de `projects`: `pickFile: (): Promise<string | null> => ipcRenderer.invoke('projects:pickFile')`.
Se `registerProjectIpc.test.ts` chama a função com aridade fixa, o novo param é opcional — sem quebra; rodar o teste para confirmar.

- [ ] **Step 2: Store `addFileNode`** — teste (TDD) no `canvasStore.test.ts`:
```ts
describe('nó de arquivo', () => {
  it('addFileNode cria um nó file com o caminho e nome derivado', () => {
    useCanvasStore.setState({ nodes: [], edges: [], past: [], lastCommitTag: null })
    useCanvasStore.getState().addFileNode({ x: 0, y: 0 }, { path: '/a/b/nota.md' })
    const n = useCanvasStore.getState().nodes[0]
    expect(n.type).toBe('file')
    expect((n.data as { path?: string; name?: string }).path).toBe('/a/b/nota.md')
    expect((n.data as { name?: string }).name).toBe('nota.md')
  })
})
```
Implementar (usa `basename` de `ui/paths` para o nome; histórico):
```ts
  addFileNode: (position, opts): void =>
    set((state) => {
      const pos = position ?? { x: 80 + (state.nodes.length % 8) * 40, y: 80 + (state.nodes.length % 8) * 40 }
      const path = opts?.path
      return {
        ...histPatch(state),
        nodes: [
          ...state.nodes,
          {
            id: `file-${crypto.randomUUID()}`,
            type: 'file',
            position: pos,
            data: { name: path ? basename(path) : 'Arquivo', path },
            width: opts?.width ?? 240,
            height: opts?.height ?? 160
          }
        ]
      }
    }),
```
Interface: `addFileNode: (position?: { x: number; y: number }, opts?: { path?: string; width?: number; height?: number }) => void`. Import `basename` de `../ui/paths` no store.

- [ ] **Step 3: `FileNode.tsx`** — card com header (nome + ×), corpo com o caminho e um preview textual (via `window.orkestra.filetree.read`, truncado; se binário, mostra "arquivo binário"):
```tsx
import { useEffect, useState } from 'react'
import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { Icon } from './Icon'
import './nodes.css'

export function FileNode({ id, selected, data }: NodeProps): JSX.Element {
  const removeNode = useCanvasStore((s) => s.removeNode)
  const d = data as { name?: string; path?: string }
  const [preview, setPreview] = useState<string>('')
  useEffect(() => {
    let alive = true
    if (!d.path) return
    window.orkestra.filetree
      .read(d.path)
      .then((r) => {
        if (alive) setPreview(r.binary ? '[arquivo binário]' : r.content.slice(0, 2000))
      })
      .catch(() => alive && setPreview('[não foi possível ler]'))
    return () => {
      alive = false
    }
  }, [d.path])
  return (
    <>
      <NodeResizer minWidth={160} minHeight={100} isVisible={selected ?? false} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="ork-node">
        <div className="ork-node-header">
          <span className="ork-node-dot ork-node-dot--file" aria-hidden="true" />
          <span className="ork-node-title" title={d.path}>{d.name ?? 'Arquivo'}</span>
          <button className="nodrag ork-node-iconbtn" onClick={() => removeNode(id)} aria-label="Fechar" title="Remover nó">
            <Icon name="X" size={14} animation="pop" />
          </button>
        </div>
        <pre className="nodrag nowheel ork-file-preview">{preview}</pre>
      </div>
    </>
  )
}
```
CSS `.ork-file-preview` em `nodes.css` (fonte mono, overflow auto, padding, `.ork-node-dot--file` cor própria).

- [ ] **Step 4: Registrar + wire** — `Canvas.tsx`: `nodeTypes` ganha `file: FileNode`; `onFile` na Topbar abre o seletor e cria:
```ts
        onFile={async () => {
          const path = await window.orkestra.projects.pickFile()
          if (path) addFileNode(undefined, { path })
        }}
```
`Topbar.tsx`: o botão clip deixa de ser `disabled` e passa a chamar `onFile` (nova prop `onFile: () => void`). Adicionar `onFile` à assinatura da Topbar e ao uso no Canvas.

- [ ] **Step 5: typecheck + lint + test + build; checkpoint** — clicar no clip abre o seletor de arquivo; ao escolher, o card aparece com nome + preview; ligável a um terminal.
- [ ] **Step 6: Commit** `feat(canvas): no de arquivo (clip) — anexa 1 arquivo ligável (F01)`

---

### Task 2: Nó de desenho (Excalidraw) — com smoke test

**Files:**
- `package.json` (dep), Create: `src/renderer/src/components/DrawNode.tsx`
- Modify: store (`addDrawNode`), `Canvas.tsx` (nodeTypes + pendingTool 'draw'), `Topbar.tsx` (habilitar desenhar)

- [ ] **Step 1: Instalar + smoke test** — `npm install @excalidraw/excalidraw`. Criar `DrawNode.tsx` mínimo (só `<Excalidraw>` num wrapper `nodrag nowheel` com `width/height:100%`) e importar o CSS (`@excalidraw/excalidraw/index.css`). Registrar em `nodeTypes`. Rodar `npm run build`. **Se o build falhar** (ESM/CSS/worker) ou o bundle explodir de forma inaceitável, PARAR e cair no fallback (nó de desenho à mão livre com `<canvas>` 2D) — registrar a decisão. Se OK, seguir.

- [ ] **Step 2: DrawNode completo** — persistir a cena com debounce:
```tsx
// carrega data.scene em initialData; onChange (debounced) -> updateDrawScene(id, elements, appState-mínimo)
```
Excalidraw dá `onChange(elements, appState)`; salvar `{ elements, appState: { viewBackgroundColor } }` em `data.scene`. `nodrag nowheel` no wrapper para o React Flow não roubar os gestos.

- [ ] **Step 3: Store `addDrawNode`** — `data = { scene? }`, tamanho padrão ~420x300, aceita width/height (arrastar-para-criar). `updateDrawScene(id, scene)` com histórico coalescido (`'draw:'+id`). Teste do store (addDrawNode cria type 'draw').

- [ ] **Step 4: Wire** — `Topbar` habilita o botão desenhar (`onDraw`); `Canvas` adiciona `'draw'` ao `pendingTool` (arrastar-para-criar, como nota/site) e ao `handleCreateNode`. `nodeTypes` ganha `draw: DrawNode`.

- [ ] **Step 5: typecheck + lint + build; checkpoint** — desenhar via arrastar cria o nó Excalidraw; rabiscar dentro funciona sem mover o nó; recarregar preserva a cena.
- [ ] **Step 6: Commit** `feat(canvas): no de desenho (Excalidraw) (F01)`

---

## Self-Review

**Cobertura:** nó arquivo (T1) + nó desenho (T2) → ambos ligáveis, persistidos pelo serialize genérico. ✓
**Placeholders:** o fallback do Excalidraw é uma decisão condicional explícita (não um TODO).
**Type consistency:** `pickFile`/`addFileNode`/`addDrawNode`/`updateDrawScene` consistentes entre camadas; nodeTypes registra `file` e `draw`.
**Risco:** Excalidraw no React Flow — smoke test no Step 1 da T2 antes de investir.
