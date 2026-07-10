# Orkestra — Fase 12 (Busca + Polish + Distribuição) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Preparar a **v1.0 pública**: um **command palette** (Cmd/Ctrl+K) para buscar nós e disparar ações; **infraestrutura de distribuição** (electron-builder multi-plataforma + electron-updater); e **documentação** (README + LICENSE). Isso deixa o app pronto para publicar — os passos que exigem recursos externos (certificado Apple, repositório GitHub remoto, CI) ficam documentados como TODO do usuário.

**Architecture:** O command palette é um modal do renderer aberto por atalho global; a busca/ranking é uma **função pura testável** sobre uma lista de itens (ações estáticas + nós do store). A distribuição é config (electron-builder.yml targets, package.json metadata) + código de update (electron-updater no main, só em produção empacotada). Docs são arquivos no root.

**Escopo — o que é autônomo vs. o que exige o usuário:**
- **Autônomo (esta fase entrega):** command palette funcional; electron-builder configurado para mac/win/linux; electron-updater cabeado (checagem em produção); README + LICENSE; metadata do package.json.
- **Requer recursos do usuário (documentado, NÃO feito aqui):** certificado Apple Developer (assinar+notarizar o `.app`/`.dmg` — sem isso o auto-update no macOS não funciona e o Gatekeeper avisa); repositório GitHub remoto + GitHub Releases (o feed do updater); CI (GitHub Actions) para gerar builds Windows/Linux (não geráveis a partir do macOS Intel local). **Ícone do app = TODO da Fase 13 (identidade visual).**

**Tech Stack:** electron-builder (já presente), `electron-updater` (nova dep), electron-vite. Vitest para a busca pura.

## Global Constraints

- Renderer NÃO importa `fs`/`http`/`node-pty`/`child_process`. Updater/build só no main.
- Segurança inalterada (renderer sandbox/contextIsolation; servidor 127.0.0.1+token).
- `electron-updater` só age quando `app.isPackaged` (nunca em dev) e falha em silêncio se não houver feed configurado.
- Nomenclatura: **não** usar marcas do Maestri. Licença: **MIT** (já declarada no package.json).

---

### Task 1: Command palette (Cmd/Ctrl+K) — busca de nós + ações (TDD)

**Files:**
- Create: `src/renderer/src/search.ts` (+ `.test.ts`), `src/renderer/src/components/CommandPalette.tsx`
- Modify: `src/renderer/src/components/Canvas.tsx` (montar o palette + atalho), `src/renderer/src/store/canvasStore.ts` (se precisar de um seletor/foco de nó)

**Interfaces:**
- Produces:
  - `interface PaletteItem { id: string; label: string; kind: 'action' | 'node'; run: () => void }` (o `run` é montado no componente, mas a busca opera sobre `{id,label,kind}`).
  - `rankItems<T extends { label: string }>(query: string, items: T[]): T[]` — pura: substring case-insensitive; ordena por (1) match no início do label, (2) posição do match, (3) label mais curto; query vazia → todos na ordem original.

- [ ] **Step 1: `rankItems` test (falha primeiro)**

`src/renderer/src/search.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { rankItems } from './search'

const items = [
  { label: 'Criar Terminal' }, { label: 'Criar Nota' }, { label: 'Criar Portal' },
  { label: 'Dev' }, { label: 'Backend Reviewer' }
]

describe('rankItems', () => {
  it('query vazia devolve todos na ordem', () => {
    expect(rankItems('', items)).toHaveLength(5)
  })
  it('filtra por substring case-insensitive', () => {
    expect(rankItems('portal', items).map((i) => i.label)).toEqual(['Criar Portal'])
    expect(rankItems('DEV', items).map((i) => i.label)).toEqual(['Dev'])
  })
  it('prefixo/início do label rankeia acima de match no meio', () => {
    const r = rankItems('re', [{ label: 'Backend Reviewer' }, { label: 'Reload' }])
    expect(r[0].label).toBe('Reload') // começa com "Re"
  })
  it('sem match devolve vazio', () => {
    expect(rankItems('zzz', items)).toEqual([])
  })
})
```

- [ ] **Step 2: Implementar `src/renderer/src/search.ts`**

```ts
export function rankItems<T extends { label: string }>(query: string, items: T[]): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  const scored: Array<{ item: T; idx: number }> = []
  for (const item of items) {
    const idx = item.label.toLowerCase().indexOf(q)
    if (idx >= 0) scored.push({ item, idx })
  }
  scored.sort((a, b) => a.idx - b.idx || a.item.label.length - b.item.label.length)
  return scored.map((s) => s.item)
}
```

- [ ] **Step 3: `CommandPalette.tsx`**

Um modal (overlay centralizado) com um `<input>` de busca. Itens = **ações** (`Criar Terminal`→`addTerminalNode`, `Criar Nota`→`addNoteNode`, `Criar Portal`→`addPortalNode`) + **nós** do store (`useCanvasStore(s => s.nodes)`, label = `data.name ?? tipo`, kind `'node'`). `rankItems(query, items)` para filtrar; setas ↑/↓ navegam, Enter executa `run()`, Esc fecha. Para um item nó, `run` foca o nó no canvas (React Flow `useReactFlow().setCenter(node.position.x, node.position.y, { zoom: 1.2 })` ou `fitView({ nodes: [{id}] })`). Design mínimo (polish é Fase 13).

- [ ] **Step 4: Atalho + montagem em `Canvas.tsx`**

Estado `paletteOpen`; um `useEffect` com listener `keydown` global: `if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen(o => !o) }` (limpar no unmount). Renderizar `{paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}`.

- [ ] **Step 5: Testes + typecheck** — `npm test && npm run typecheck` verdes.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: command palette (Cmd/Ctrl+K) com busca de nos e acoes (Fase 12)"`

---

### Task 2: Distribuição — electron-builder multi-plataforma + electron-updater (infra)

**Files:**
- Modify: `electron-builder.yml`, `package.json` (metadata + dep + script), `src/main/index.ts`
- Create: `src/main/updater.ts`

**Interfaces:**
- Produces: `setupAutoUpdater(): void` (em `updater.ts`) — chamado no `whenReady`; só age se `app.isPackaged`; `autoUpdater.checkForUpdatesAndNotify().catch(() => {})` (silencioso sem feed).

- [ ] **Step 1: `electron-builder.yml` targets**

Ler o `electron-builder.yml` atual e estendê-lo (sem quebrar o que existe): `appId` (ex. `app.orkestra.desktop`), `productName: Orkestra`, targets `mac` (`dmg`, `zip`; `category: public.app-category.developer-tools`; `target.arch: [x64]` p/ Intel), `win` (`nsis`), `linux` (`AppImage`, `deb`; `category: Development`), `publish: { provider: github, owner: TODO-USUARIO, repo: orkestra }` (com um comentário de que owner precisa ser preenchido), `icon: build/icon.png` (com um comentário de que o ícone é TODO Fase 13). `files`/`directories` como já estão.

- [ ] **Step 2: `package.json` metadata + dep**

Adicionar `"repository": { "type": "git", "url": "https://github.com/TODO-USUARIO/orkestra.git" }` (comentar no README que é placeholder), `"homepage"`, `"keywords": ["electron","ai-agents","orchestration","canvas","terminal"]`. Adicionar `electron-updater` a `dependencies` (`npm i electron-updater`). Confirmar que o script `package` (electron-builder) existe.

- [ ] **Step 3: `src/main/updater.ts` + fiar**

```ts
import { app } from 'electron'
import electronUpdater from 'electron-updater'

export function setupAutoUpdater(): void {
  if (!app.isPackaged) return // nunca em dev
  try {
    const { autoUpdater } = electronUpdater
    autoUpdater.autoDownload = true
    void autoUpdater.checkForUpdatesAndNotify().catch(() => { /* sem feed configurado: silencioso */ })
  } catch { /* electron-updater indisponível: ignora */ }
}
```
Em `main/index.ts` `whenReady`, chamar `setupAutoUpdater()` (após criar a janela). Não deve afetar dev nem testes.

- [ ] **Step 4: Verificar** — `npm run typecheck` limpo; `npm test` verde (o updater não roda em teste — `app.isPackaged` é false); `npm run build` verde. **NÃO** rodar `npm run package` (empacotamento real é demorado/precisa de assinatura; deixado ao usuário) — apenas garantir que o config parseia (`npx electron-builder --help` OU um dry-check do YAML via `node -e`).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: distribuicao — electron-builder multi-plataforma + electron-updater (infra) (Fase 12)"`

---

### Task 3: README + LICENSE + docs de build/release + checkpoint

**Files:**
- Create: `README.md`, `LICENSE`, `docs/BUILD.md`
- Modify: (nenhum código)

**Interfaces:** documentação — sem código.

- [ ] **Step 1: `LICENSE`**

Arquivo `LICENSE` com o texto **MIT** completo (ano 2026, titular "Felipe" / o `author` do package.json). Padrão MIT verbatim.

- [ ] **Step 2: `README.md`**

Um README público completo (PT-BR):
- Título + uma linha do que é (canvas Electron para orquestrar agentes de código de IA).
- **Features** (por fase entregue): terminais reais no canvas; notas/conexões; persistência; **CLI `orq`** (list/note/ask/check); **comunicação agente↔agente**; **Modo Maestro** (presets Claude/Codex/Gemini, papéis, recruit/connect/dismiss); **Floors** (git worktree isolado + land); **Portais** (browser embutido dirigível); **Rotinas** (cron); **command palette** (Cmd+K).
- **Rodar em dev:** `npm install`, `npm run dev` (nota Intel Mac: hardware acceleration desabilitada). 
- **`orq` (uso pelos agentes):** um resumo dos comandos + que ele é injetado no PATH dos terminais.
- **Build:** aponta p/ `docs/BUILD.md`.
- **Arquitetura:** 1 parágrafo (main/preload/renderer; OrchestrationServer 127.0.0.1+token; segurança).
- **Status:** v1.0; nota de que assinatura/notarização (macOS) e releases exigem config do mantenedor.
- **Licença:** MIT.
- Sem marcas do Maestri; pode citar "inspirado por ferramentas de orquestração de agentes" sem nomear.

- [ ] **Step 3: `docs/BUILD.md`**

Guia de build/release: `npm run build` (compila) vs `npm run package` (empacota via electron-builder); os targets (mac/win/linux); **os passos que exigem recursos do usuário**: (a) ícone em `build/icon.png` (1024×1024); (b) assinatura macOS — `CSC_LINK`/`CSC_KEY_PASSWORD` + notarização (`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`); (c) preencher `publish.owner`/`repository` com o repo GitHub real; (d) `GH_TOKEN` + `npm run package -- --publish always` p/ releases; (e) CI (GitHub Actions matrix mac/win/linux) p/ builds cross-platform — pois builds Windows/Linux não saem de um macOS Intel local. Deixar claro o que já está pronto (config) vs. o que falta (credenciais/repo).

- [ ] **Step 4: Commit** — `git add -A && git commit -m "docs: README + LICENSE (MIT) + guia de build/release (Fase 12)"`

- [ ] **Step 5: CHECKPOINT (humano)** — `npm run dev`: pressionar **Cmd+K** (ou Ctrl+K) → o palette abre; digitar "portal" → filtra "Criar Portal"; Enter cria; digitar o nome de um terminal → Enter foca o nó. (Distribuição real — `npm run package`, assinar, publicar — é um passo separado documentado em `docs/BUILD.md`, requer os recursos do usuário.)

---

## Notas de risco
- **Auto-update sem assinatura:** no macOS, o Squirrel.Mac exige um app assinado+notarizado para auto-atualizar; sem isso o `checkForUpdatesAndNotify` falha em silêncio (tratado). Documentado.
- **Build cross-platform:** a partir de um macOS Intel local só sai o build mac; win/linux exigem CI ou as respectivas máquinas. Documentado em BUILD.md.
- **`publish.owner`/`repository` placeholders:** o updater só funciona quando apontarem para um repo real com Releases. Comentado no config + BUILD.md.
- **Command palette focus de nó:** usa a API do React Flow (`setCenter`/`fitView`); se a API exata divergir, o implementer ajusta — o efeito (centralizar no nó) é o requisito.
- **Ícone:** intencionalmente TODO da Fase 13 (identidade visual); o build usa o ícone default do Electron até lá.
