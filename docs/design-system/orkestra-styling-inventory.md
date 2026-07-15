# Orkestra — Inventário da superfície de estilização (mapa de reformulação)

> Auditoria da camada visual do renderer (`src/renderer/src/`) para orientar a reformulação
> total de UI/UX baseada nos design systems Apple + Maestri. Caminhos relativos a
> `src/renderer/src/`. Este documento é o **mapa de trabalho**: onde vive cada estilo, o que
> fura os tokens, e os lotes paralelizáveis.

## Camada de tokens (`styles/`)
- **`styles/tokens.css`** — única fonte de verdade. `:root` = tema escuro (5-40),
  `:root[data-theme='light']` (45-63). Superfícies `--bg-0/1/2/2-weak`, `--border/-strong`,
  texto `--text-1/2/3`, `--accent/-weak/-text`, estados `--ok/--warn/--err`, forma
  `--radius-sm/radius/lg` (6/10/14px), `--shadow-1/2`, `--font-ui`/`--font-mono`,
  motion `--dur-1/2`/`--ease`. Reduced-motion zera durações (65-69).
- **`styles/base.css`** — reset + `body { font-family: var(--font-ui); font-size: 13px }`
  (15, base global hardcoded). `:focus-visible` outline `--accent`.
- **`styles/motion.css`** — keyframes `ork-fade-in`, `ork-scale-in`.
- **`styles/scrollbars.css`** — scrollbars de `.ork-palette-list`, `.ork-note-textarea`,
  `.xterm-viewport`. `width:10px`, `border-radius:8px`.

## Problemas concretos que furam o design system (corrigir na reformulação)
- `Canvas.css:210` `color:#fff` hardcoded; `:215` `var(--danger, #e5484d)` — **token `--danger` NÃO existe**; `:231` `border:1px solid rgba(0,0,0,0.15)`.
- `Canvas.tsx:497` MiniMap `maskColor="rgba(11,13,18,0.6)"` hardcoded (= `--bg-0` escuro à mão; **NÃO acompanha o tema claro**); `:484` `<Background variant=Dots gap=20 size=1>`.
- `nodes.css:87,90,93` pulso de atenção `box-shadow ... rgba(224,161,58,.55/0)` (= `--warn` à mão); `:339` post-it texto `color:#1a1a1a`; `:342` link `#0a7`; `:320` `rgba(0,0,0,.35)`; `:361` `rgba(127,127,127,.18)`.
- `CommandPalette.css:16` e `NewTerminalModal.css:12` overlay `rgba(0,0,0,0.5)` hardcoded.
- `CanvasContextMenu.css:45,48` `var(--err, #e5615f)` fallback duplicando token.
- `ErrorBoundary.tsx:28-40` — 100% inline, `color:'var(--err,#ff6b6b)'`.
- `Logo.tsx:27-60` — hex de marca inline no SVG (`#161329`,`#08070d`,`#7c6cff`,`#9d8fff`,`#b3a8ff`...), não tema-aware.
- `notes/noteColors.ts:4-11` — 6 hex de post-it hardcoded (`#fff4b8`,`#ffc9de`,`#bfe3ff`,`#c9f0d1`,`#e0d1ff`,`#ffd9b0`).
- **`TerminalNode.tsx:27-31` — xterm SEM objeto `theme`**: usa o tema padrão (fundo preto/texto branco, não tokenizado, não acompanha tema claro). `fontSize:13`, `fontFamily:'Menlo, Consolas, ...'` hardcoded. **Ponto crítico.**
- Sem tokens de escala tipográfica: dezenas de `font-size` px espalhados (9-18px), inclusive fracionários `12.5px`/`10.5px` em `ProjectsSidebar.css` e `FileTreeNode.css`.

## Onde vivem os 4 elementos-chave do canvas
- **Grade de pontos**: `Canvas.tsx:484` + `--xy-background-pattern-color: var(--border)` (`Canvas.css:10`), fundo `--xy-background-color: var(--bg-0)` (9).
- **Minimap**: `Canvas.tsx:492-500` (`maskColor` hardcoded, `nodeColor="var(--text-3)"`) + `.ork-minimap` (`Canvas.css:103-108`).
- **Controles de zoom**: `Canvas.tsx:485` + `.react-flow__controls*` (`Canvas.css:29-39`) + `--xy-controls-*`.
- **Edges por tipo**: `Canvas.css:277-311` (`--agent`→accent, `--chain`→ok, `--note`→warn, `--portal/--link`→border-strong; corda `stroke-width:3`). Badges de edge: `nodes.css:489-518`. Lógica: `edges/edgeKind.ts`, `edges/edgeStyle.ts`, `edges/ropePath.ts`, render `TypedEdge.tsx`.
- **xterm**: `TerminalNode.tsx:27-31`.

## Cores de papel / post-it
- **Papéis**: `src/shared/roles.ts` `PRESET_ROLES` — Líder `var(--accent)`, Dev `var(--ok)`, Revisor `var(--warn)`, Testador `var(--err)`, livre `var(--text-2)`. Já tokenizado. Consumido inline em `TerminalFlowNode.tsx:49,98`.
- **Post-it**: `notes/noteColors.ts` (6 hex). Swatch inline em `NoteFormatBar.tsx:45`.

## Lotes de trabalho (arquivos disjuntos → paralelizáveis; A é pré-requisito)

**Lote A — Fundação / tokens (PRIMEIRO):** `styles/tokens.css`, `styles/base.css`, `styles/motion.css`, `styles/scrollbars.css`. Criar escala tipográfica (`--fs-*`/tracking), `--radius-pill`, token de gradiente-marca, tokens de material/vibrancy, accents de papel (amber/red/violet/pink/orange/teal/indigo/green), `--danger`, sombras em escala. Revisar `base.css` (fonte, smoothing, tracking, 13px base).

**Lote B — Canvas / React Flow chrome:** `components/Canvas.css`, `components/Canvas.tsx`. Grade de pontos, controles, minimap (corrigir `maskColor`), handles, resize, edges por tipo, toolbar de criação/badges.

**Lote C — Nós e edges:** `components/nodes.css`, `components/TypedEdge.tsx`, `components/NodeToolbar.tsx`, `components/NoteFormatBar.tsx`, `notes/noteColors.ts`, `edges/edgeKind.ts`, `edges/edgeStyle.ts`. Post-it, pulso de atenção, badges papel/SSH/edge, Markdown.

**Lote D — Terminal / xterm:** `components/TerminalNode.tsx`, `components/TerminalFlowNode.tsx`, `components/NewTerminalModal.tsx`, `components/NewTerminalModal.css`. **Adicionar `theme` do xterm derivado dos tokens** + tokenizar fonte; modal.

**Lote E — Sidebar / Topbar / Tema:** `components/ProjectsSidebar.tsx`+`.css`, `components/Topbar.tsx`+`.css`, `components/ThemeToggle.tsx`, `components/Logo.tsx`. Normalizar font-sizes; Logo tema-aware.

**Lote F — Overlays / paleta / menus / árvore:** `components/CommandPalette.tsx`+`.css`, `components/AskAgentPanel.tsx`, `components/CanvasContextMenu.tsx`+`.css`, `components/CreateOverlay.tsx`, `components/FileTreeNode.tsx`+`.css`, `components/FileNode.tsx`, `components/GroupNode.tsx`+`.css`, `components/NoteFindBar.tsx`, `components/NoteNode.tsx`, `components/MarkdownView.tsx`.

**Lote G — Shell / erro / portal:** `App.tsx`, `components/ErrorBoundary.tsx`, `components/PortalNode.tsx`, `components/PortalFlowNode.tsx`, `components/DrawNode.tsx`, `components/Icon.tsx`.
