# Orkestra — Spec de design (linguagem DesignCode UI)

> **Fonte de verdade da reformulação visual.** Traduz o design system do Figma **DesignCode UI Kit**
> (ver `docs/design-system/figma-designcode-ui-reference.md`) para o canvas Electron/React do Orkestra.
> Aprovado via mockups no brainstorm visual (2026-07-14) — cópias duráveis em
> `docs/design-system/mockups/` (canvas claro+escuro, biblioteca de elementos, overlays).
>
> **Substitui** a tentativa violeta/glass (rejeitada). O accent é **azul**, superfícies são
> **monocromáticas (preto/branco + alpha)**, fonte **Inter**, e o craft é **rico mas contido**:
> animação e detalhe no elemento, sobriedade na composição. Data: 2026-07-14.

---

## 1. Essência

Sistema **premium construído sobre a paleta de sistema da Apple (HIG)**, adaptado à densidade de um
canvas de terminais (texto ~13px, nós compactos). Cinco compromissos:

1. **Conteúdo é o produto; a interface é o vidro.** Nós/terminais/notas são **flat e opacos**. O
   cromo (topbar, sidebar, paleta, menus, modais) é **translúcido** (vidro + blur). O terminal nunca fica atrás de vidro.
2. **Um accent, azul, com parcimônia.** `--accent` (azul) só em: ação primária, item ativo, seleção,
   foco, e o estado "agente gerando". Estados (ok/warn/err) são semânticos. Papéis usam a paleta Apple.
3. **Profundidade honesta.** No conteúdo, volume = camada + sombra **neutra** (nunca glow azul atrás
   do terminal). No cromo, blur + hairline de luz.
4. **Tudo via token; trocar tema é um flip.** Nenhum componente hardcoda cor/forma/sombra/duração.
   `data-theme` no `<html>` alterna claro↔escuro. Mesmos nós de token, valores diferentes.
5. **Nativo, privado, buttery-smooth.** Inter (UI) + mono (terminal); 60fps (`transform`/`opacity`);
   motion 120–320ms; `prefers-reduced-motion` zera.

**Tema:** claro E escuro, ambos de primeira classe. Default do app = **claro** (prioridade do usuário);
`:root` mantém o escuro como base herdada e `:root[data-theme='light']` sobrepõe — ou inverte-se em
`theme.ts` (decisão de implementação; ambos os conjuntos são completos).

---

## 2. Tokens finais

Mantêm-se **todos os nomes de token atuais** (`--bg-*`, `--text-*`, `--accent*`, `--ok/warn/err`,
`--radius-*`, `--shadow-*`, `--glass-*`, `--fs-*`, `--dur-*`, etc.); só mudam **valores**. Abaixo, os
valores finais para `tokens.css`.

### 2.1 Escuro (`:root`)
```css
:root {
  /* superfícies — preto/branco + alpha (sem escala de cinza) */
  --bg-0:#0A0A0F;  --bg-1:#16171D;  --bg-2:#1F2027;  --bg-3:#292B33;  --bg-2-weak:rgba(255,255,255,.04);
  /* bordas & hairlines (Container/border = white-a10) */
  --border:rgba(255,255,255,.09); --border-strong:rgba(255,255,255,.16);
  --hairline:rgba(255,255,255,.08); --hairline-glass:inset 0 .5px 0 rgba(255,255,255,.14);
  /* texto (Foreground primary/secondary/tertiary) */
  --text-1:#F4F6FA; --text-2:rgba(244,246,250,.62); --text-3:rgba(244,246,250,.40);
  --label:rgba(255,255,255,.92); --label-2:rgba(235,235,245,.6); --label-3:rgba(235,235,245,.3);
  /* accent — AZUL (blue-400 no dark) */
  --accent:#3395FF; --accent-hover:#4AA3FF; --accent-weak:rgba(51,149,255,.18); --accent-text:#FFFFFF;
  --gradient-brand:linear-gradient(135deg,#3395FF 0%,#5856D6 100%);   /* logo/headline (azul→índigo) */
  --gradient-accent:linear-gradient(180deg,#3395FF 0%,#007AFF 100%);  /* botão primário */
  /* estados (Apple system) */
  --ok:#34C759;  --ok-weak:rgba(52,199,89,.16);
  --warn:#FF9500; --warn-weak:rgba(255,149,0,.16);
  --err:#FF453A; --err-weak:rgba(255,69,58,.16); --danger:var(--err);
  --attention:#FF453A; --attention-ring:rgba(255,69,58,.5);
  /* accents de papel (papéis/edges/tags) — hues Apple */
  --paper-blue:#0A84FF; --paper-green:#34C759; --paper-orange:#FF9500; --paper-red:#FF453A;
  --paper-indigo:#5E5CE6; --paper-purple:#BF5AF2; --paper-teal:#40C8E0; --paper-pink:#FF375F;
  --paper-cyan:#64D2FF; --paper-yellow:#FFD60A;
  /* post-it (nota; papel quente, tema-consciente — ver §4) */
  --note-yellow:#2C2612; --note-ink:#F1D89A; /* + variantes; ver noteColors.ts */
  /* terminal (xterm) */
  --term-bg:#0B0C11; --term-fg:#C3CBD9;
  /* materiais / vidro */
  --glass-1:rgba(22,23,29,.70); --glass-2:rgba(23,24,30,.90); --glass-3:rgba(23,24,30,.92);
  --glass-border:rgba(255,255,255,.09);
  --material-thin:saturate(180%) blur(20px); --material-regular:saturate(180%) blur(24px);
  --material-thick:saturate(180%) blur(30px); --material-chrome:saturate(160%) blur(22px);
  --scrim:rgba(0,0,0,.55);
  /* sombras — NEUTRAS (nunca azul atrás do conteúdo) */
  --shadow-1:0 1px 2px rgba(0,0,0,.5), 0 10px 26px rgba(0,0,0,.5);
  --shadow-2:0 8px 24px rgba(0,0,0,.55); --shadow-3:0 16px 40px rgba(0,0,0,.6),0 4px 12px rgba(0,0,0,.5);
  --ring-focus:0 0 0 4px var(--accent-weak); --ring-avatar:0 0 0 2px var(--bg-0);
}
```

### 2.2 Claro (`:root[data-theme='light']`)
```css
:root[data-theme='light']{
  --bg-0:#EDF0F5;  --bg-1:#FFFFFF;  --bg-2:#F4F5F8;  --bg-3:#E9EBF0;  --bg-2-weak:rgba(11,11,15,.04);
  --border:rgba(11,11,15,.08); --border-strong:rgba(11,11,15,.14);
  --hairline:rgba(11,11,15,.06); --hairline-glass:inset 0 .5px 0 rgba(255,255,255,.7);
  --text-1:#0B0B0F; --text-2:rgba(11,11,15,.60); --text-3:rgba(11,11,15,.42);
  --label:rgba(0,0,0,.88); --label-2:rgba(60,60,67,.6); --label-3:rgba(60,60,67,.3);
  --accent:#007AFF; --accent-hover:#0069E0; --accent-weak:rgba(0,122,255,.12); --accent-text:#FFFFFF;
  --gradient-brand:linear-gradient(135deg,#3395FF 0%,#5856D6 100%);
  --gradient-accent:linear-gradient(180deg,#3395FF 0%,#007AFF 100%);
  --ok:#248A3D; --ok-weak:rgba(52,199,89,.14); --warn:#B45A09; --warn-weak:rgba(255,149,0,.14);
  --err:#D70015; --err-weak:rgba(255,59,48,.12); --danger:var(--err);
  --attention:#FF3B30; --attention-ring:rgba(255,59,48,.5);
  --glass-1:rgba(255,255,255,.72); --glass-2:rgba(255,255,255,.86); --glass-3:rgba(255,255,255,.94);
  --glass-border:rgba(11,11,15,.08);
  --scrim:rgba(11,11,15,.30);
  --shadow-1:0 1px 2px rgba(11,11,15,.05), 0 10px 26px rgba(11,11,15,.09);
  --shadow-2:0 10px 30px rgba(11,11,15,.14); --shadow-3:0 16px 48px rgba(11,11,15,.2),0 4px 12px rgba(11,11,15,.1);
  /* nota clara */
  --note-yellow:#FFF6D9; --note-ink:#5A4A1A;
  --term-bg:#F7F8FA; --term-fg:#1D2230;
}
```
> Papéis (roles) no claro: escurecer o **texto** do chip (o hue de fundo fica a ~12–15%); ex. Dev texto `#1A7A43`, Revisor `#B45A09`. Receita de chip: fundo `color-mix(hue 14%)`, texto = hue escurecido, dot = hue sólido.

### 2.3 Forma, tipografia, motion (herdados por ambos os temas)
```css
:root{
  /* forma */
  --radius-sm:10px;  /* botões, inputs, badges, itens de lista */
  --radius:12px;     /* cartões / painéis */
  --radius-lg:16px;  /* modais, paleta */
  --radius-node:14px;/* nós de terminal */
  --radius-note:12px;--radius-pill:9999px; --radius-circle:50%;
  /* tipografia — Inter (UI) + mono */
  --font-ui:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --font-mono:'JetBrains Mono','SF Mono',ui-monospace,Menlo,Consolas,monospace;
  /* escala (densa; base 13). Mapear DesignCode: Small11 Caption13 Body16 Footnote14 Headline20 */
  --fs-micro:9px; --fs-2xs:10px; --fs-xs:11px; --fs-sm:12px; --fs-base:13px; --fs-md:14px;
  --fs-lg:15px; --fs-xl:17px; --fs-2xl:20px; --fs-3xl:24px;
  --tracking-tight:-.02em; --tracking-tighter:-.03em; --tracking-normal:0; --tracking-label:.06em;
  --weight-regular:400; --weight-medium:500; --weight-semibold:600; --weight-bold:700;
  --lh-tight:1.2; --lh-snug:1.25; --lh-ui:1; --lh-normal:1.5; /* Inter: 100–140% */
  /* espaçamento — grid 4px */
  --space-0-5:2px;--space-1:4px;--space-1-5:6px;--space-2:8px;--space-2-5:10px;--space-3:12px;
  --space-3-5:14px;--space-4:16px;--space-5:20px;--space-6:24px;--space-8:32px;--space-canvas-grid:22px;
  /* motion */
  --dur-1:130ms; --dur-2:220ms; --dur-3:320ms;
  --ease:cubic-bezier(.2,.6,.2,1); --ease-out:cubic-bezier(0,0,.58,1); --ease-in:cubic-bezier(.42,0,1,1);
  --spring:cubic-bezier(.34,1.56,.64,1); --press-scale:.965;
}
@media (prefers-reduced-motion:reduce){ :root{ --dur-1:0ms;--dur-2:0ms;--dur-3:0ms;--press-scale:1 } }
```

---

## 3. Materiais
- **Conteúdo (flat):** `--bg-1` opaco, borda `--border`, sombra `--shadow-1` (neutra). Sem blur, sem gradiente, sem glow de cor atrás.
- **Cromo (vidro):** `background:var(--glass-1)` + `backdrop-filter:var(--material-chrome)` + borda `--glass-border` + hairline de luz no topo (`::before` gradiente branco→transparente ou `--hairline-glass`).
- **Overlays (paleta/menu):** `--glass-2` + `--material-regular` + `--shadow-2`.
- **Modal:** `--glass-3` + `--material-thick` + `--shadow-3`, sobre `--scrim`.
- **Gotchas backdrop-filter:** exige `-webkit-` prefixo; o elemento precisa de `background` translúcido (não `opacity`); evitar aninhar dois `backdrop-filter`.

---

## 4. Componentes

**Topbar (`Topbar.css`)** — pílulas flutuantes de vidro (`--glass-1`, `--radius-pill`, `--shadow-1`, hairline). Botões de tool `--fs-sm`, cor `--text-2`→`--text-1` no hover; tool ativo = **thumb azul deslizante** (`--accent`, thumb com `transform` + `--spring`). CTA "Novo" = botão primário (§4.9).

**Sidebar (`ProjectsSidebar.*`)** — material `.sidebar` (`--glass-1` + `--material-chrome`), borda direita `--border` + hairline de luz. Logo = quadrado com `--gradient-brand` + wordmark. Busca = campo `--bg-2-weak`. Item de projeto ativo = **pílula azul cheia** (`--accent`, texto branco, sombra azul suave). Normalizar font-sizes fracionários → `--fs-*`.

**Nó de terminal (`.ork-node`, `nodes.css` + `TerminalNode.tsx`)** — `--bg-1`, borda `--border`, `--radius-node`, `--shadow-1`. Header 40px: ícone, **attention dot**, nome (`--weight-semibold`, `--tracking-tight`), tag de papel, botão colapsar. Corpo = terminal (§ xterm). Footer = caminho em mono, `--text-3`. **Hover:** `translateY(-3px)` + sombra maior (`--spring`). **Estados do nó → §5.**

**Terminal / xterm (`TerminalNode.tsx`)** — **CRÍTICO: adicionar objeto `theme` do xterm derivado dos tokens** (hoje não existe). Mapear:
```
background: var(--term-bg)   → claro #F7F8FA / escuro #0B0C11 (novo token --term-bg)
foreground: var(--term-fg)   → claro #1D2230 / escuro #C3CBD9 (--term-fg)
cursor: var(--accent); selectionBackground: var(--accent-weak)
ANSI: mapear pros hues Apple (green/red/yellow/blue/magenta/cyan)
```
`fontFamily: var(--font-mono)`, `fontSize: 13`, ligaduras off. O `theme` deve reagir ao flip claro/escuro.

**Nota / sticky (`.ork-note`, `noteColors.ts`)** — papel quente, `--radius-note`, sombra `--shadow-1`. Texto sobre papel usa `--note-ink` (tema-consciente). Refinar os 6 hex de `noteColors.ts` p/ pastéis Apple-ish (claro) com par escuro.

**Edges por tipo (`Canvas.css`, `TypedEdge.tsx`, `edges/*`)** — agente→`--accent`, chain→`--ok`, note→`--warn`, portal/link→`--border-strong`. **Edge do agente ativo = fluxo animado** (dash marchando + ponto viajando; §5/§6). Badge de edge = pílula `--bg-1` + borda `--accent` + `--fs-xs`.

**Paleta ⌘K (`CommandPalette.*`)** — card `--glass-2`/`--material-regular`/`--radius-lg`/`--shadow-2` sobre `--scrim`; hairline no topo. Busca 15px. Grupos = rótulo `--fs-2xs`/600/`--tracking-label`/`--text-3`. Item hover = `--bg-2-weak`; **item ativo = fundo `--accent-weak` + barra azul à esquerda (3px) + texto/ícone `--accent`**. Atalhos em `kbd` (mono 10px, `--bg-2-weak`, borda `--border`). Footer de dicas.

**Context menu (`CanvasContextMenu.*`)** — material `.menu` (`--glass-2`/`--material-thin`); item danger = `--danger` + `--err-weak`. Remover fallbacks hardcoded.

**Modal (`NewTerminalModal.*`)** — `--glass-3`/`--material-thick`/`--radius-lg`/`--shadow-3` sobre `--scrim`. Header com ícone-marca + close. Campos = label `--fs-sm`/600 + input com **anel de foco** (§6). Papel = **segmented deslizante** (thumb `--bg-1` + `--spring`). Rodapé: secundário + primário "Criar terminal".

**Botões (`.ork-btn`)** — `--radius-sm`, `--fs-sm`/600, `:active` → `scale(var(--press-scale))` com `--spring`.
- **Primário:** `background:var(--gradient-accent)`, texto `--accent-text`, `box-shadow` azul suave + `inset 0 1px 0 rgba(255,255,255,.35)` (gloss); **shimmer** (§6); hover intensifica glow.
- **Secundário:** `--bg-1` + borda `--border-strong`.
- **Ghost:** transparente, hover `--bg-2-weak`.
- **Ícone-botão:** 30–38px, hover `--accent` sobre `--accent-weak`.

**Tags de papel** — `--fs-xs`/600, `--radius-pill`, receita "papel a ~14%" + dot sólido. Dev(verde)/Revisor(laranja)/Líder(azul)/Testador(vermelho).

**Ícones (`Icon.tsx`)** — linha 1.7px, `stroke:currentColor`, `stroke-linecap/join:round` (estilo HugeIcons). Micro-motion opcional no hover (`--spring`): "+" gira, recarregar roda, seta desliza.

**Logo (`Logo.tsx`)** — mover hex de marca inline → tokens; usar `--gradient-brand` (azul→índigo); tema-aware.

---

## 5. Sistema de estados do nó

O **border-beam** (barra de luz correndo na borda) tem **significado**: sinaliza **agente trabalhando**.
Sem glow azul atrás — só a luz na borda + sombra neutra.

| Estado | Gatilho | Tratamento |
|---|---|---|
| **idle** | terminal ocioso | borda `--border`, `--shadow-1`, sem beam |
| **gerando** | agente/Claude produzindo saída ou aguardando resposta do modelo | **border-beam** animado (§6) + indicador "gerando" no header (pill azul c/ dots) ; sombra neutra |
| **precisa-de-você** | agente terminou e espera input / prompt de permissão | **attention dot** vermelho pulsando (`--attention`) + `glow-pulse` sutil (`--attention-ring`) |
| **concluído** | comando finalizou com sucesso | flash verde breve (`--ok`) → volta a idle |
| **selecionado** | usuário clicou no nó | **anel estático** `--ring-focus` (distinto do beam; podem coexistir com "gerando") |

Implementação: classes no wrapper do nó (`.is-generating`, `.needs-attention`, `.is-selected`) alternadas
pelo estado do PTY/agente (ex.: heurística de "busy" do terminal ou sinal do wrapper `claude`). O beam só roda em `.is-generating`.

---

## 6. Elementos ricos / motion (recriados em CSS puro — sem dependência)

- **Shimmer (botão primário):** `::before` com faixa de luz `linear-gradient(120deg,transparent,rgba(255,255,255,.5),transparent)`, `transform:translateX()+skewX(-18deg)`, `@keyframes` varrendo a cada ~3.8s; `overflow:hidden`.
- **Border-beam (nó gerando):** wrapper `padding:1.5px; overflow:hidden` com `background:conic-gradient(from var(--beam), transparent 0 250deg, var(--accent-hover) 320deg, #bcdcff 342deg, var(--accent) 360deg)`; `@property --beam{syntax:'<angle>';initial-value:0deg}` animado 0→360 em ~3.4s linear. **Sem `drop-shadow` azul.** Nó interno opaco cobre o miolo.
- **Edge flow:** `stroke-dasharray` + `@keyframes` em `stroke-dashoffset` (marcha). **Ponto viajante:** elemento com `offset-path:path(...)` + `@keyframes offset-distance 0→100%`. (No app real, coordenadas vêm do React Flow.)
- **Glow-pulse (precisa-de-você):** `@keyframes` em `box-shadow` expandindo anel `--attention-ring` (ou `--accent-weak`), 2.6s.
- **Hover-lift (nós/cards):** `transform:translateY(-3/-4px)` + sombra maior, `--spring`.
- **Anel de foco (campos):** `:focus-within` → `border-color:var(--accent)` + `box-shadow:var(--ring-focus)`, transição `--spring`.
- **Indicador deslizante (segmented/tool):** thumb absoluto com `transform:translateX()` + `--spring`.
- **Press:** `:active` → `scale(var(--press-scale))`.
- **Attention pulse:** anel `box-shadow` expandindo em `--attention-ring`, 1.7s.
- **Skeleton:** gradiente 200% + `background-position` animado (loading).
- **Caret:** blink `step-end` 1.1s.
Todos colapsam sob `prefers-reduced-motion`.

---

## 7. Mapeamento por arquivo (checklist de implementação)

> Base: inventário em `docs/design-system/orkestra-styling-inventory.md`. Lotes disjuntos → paralelizáveis; **A é pré-requisito**. Verificar **renderizado** após cada lote (lição: violeta "passou nos testes" e era feio).

- **Lote A — Fundação:** `styles/tokens.css` (valores §2), `styles/base.css` (`--font-ui`, base 13px, `:focus-visible` = `--accent`), `styles/motion.css` (manter `ork-fade-in/scale-in`; add `ork-beam`/`ork-shimmer`/`ork-attention-pulse` tokenizados), `styles/scrollbars.css`. **Bundlar Inter + JetBrains Mono** (ou mono do SO).
- **Lote B — Canvas:** `Canvas.css` + `Canvas.tsx`. Grade de pontos (`--border`/`--bg-0`), controles, **minimap `maskColor` derivado de `--bg-0` (tema-aware)**, handles, resize, edges por tipo (§4).
- **Lote C — Nós & edges:** `nodes.css`, `TypedEdge.tsx`, `NodeToolbar.tsx`, `NoteFormatBar.tsx`, `noteColors.ts`, `edges/edgeKind.ts`, `edges/edgeStyle.ts`. Estados do nó (§5), post-it, tags, badges, pulso de atenção tokenizado.
- **Lote D — Terminal:** `TerminalNode.tsx` (**xterm `theme` dos tokens** — crítico), `TerminalFlowNode.tsx`, `NewTerminalModal.*` (§4).
- **Lote E — Sidebar/Topbar/Tema:** `ProjectsSidebar.*`, `Topbar.*`, `ThemeToggle.tsx`, `Logo.tsx`. Vidro no cromo, pílula ativa, thumb deslizante, Logo tema-aware, font-sizes normalizados.
- **Lote F — Overlays/paleta/menus/árvore:** `CommandPalette.*`, `CanvasContextMenu.*`, `GroupNode.*`, `FileTreeNode.*`, `NoteNode.tsx`, `NoteFindBar.tsx`, `MarkdownView.tsx`, `CreateOverlay.tsx`.
- **Lote G — Shell/erro/portal:** `App.tsx`, `ErrorBoundary.tsx` (remover inline), `PortalNode.tsx`, `PortalFlowNode.tsx`, `DrawNode.tsx`, `Icon.tsx`.

---

## 8. Estratégia de implementação

1. **Base limpa:** reverter as mudanças violeta não-commitadas do working tree (`git checkout -- <arquivos M do renderer>`), voltando ao último estado bom, **exceto** a feature de find/replace de notas (não relacionada). Confirmar com o usuário antes de descartar.
2. Implementar por **Lote A→G**, cada um como um passo verificável.
3. **Após cada lote: rodar o app e ver renderizado** (claro e escuro) — nunca declarar pronto por teste verde. Referência visual: `docs/design-system/mockups/`.
4. Manter `npm run typecheck` + `vitest` verdes; adicionar testes onde a lógica de tema/estado justificar.
5. Plano detalhado de passos: skill `writing-plans` (próximo passo após aprovação desta spec).

---

## 9. Acessibilidade
- Contraste ≥ 4.5:1 (texto primário/secundário testado nos dois temas; near-black `#0B0B0F` no claro, off-white `#F4F6FA` no escuro).
- `:focus-visible` sempre visível (`--accent` + `--ring-focus`).
- `prefers-reduced-motion` zera durações e o beam/pulsos.
- `prefers-contrast: more` engrossa hairlines (`--border` → `--border-strong`).
- Ícones decorativos `aria-hidden`; ações têm rótulo.
