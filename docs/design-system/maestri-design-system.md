# Maestri Design System

> **Todo agente. Um canvas.**

**Maestri** — plural italiano de *maestro* — é a linguagem de design de um produto que **rege**, e não gerencia. Onde outras ferramentas empilham abas e wrappers, o Maestri abre um canvas infinito onde cada agente vive como um **terminal de verdade**: uma janela arredondada flutuando no escuro, com uma barra de accent colorida por papel, cabos que pendem entre nós como cordas de um instrumento. A essência é a de um regente diante da orquestra — você não toca cada instrumento, você conduz. O sistema visual traduz isso em três compromissos inegociáveis: **escuro premium com um único accent usado com parcimônia**, **profundidade por camadas e não por gradiente** (a interface é deliberadamente flat), e **calma técnica** — 60fps, cromo mínimo, silêncio por padrão. O accent violeta-índigo (`#7c6cff`) e o glow roxo-magenta da marca-símbolo são a única voz de cor com timbre; todo o resto é neutro, quieto, a serviço do trabalho. Feito em São Paulo, Brasil.

O sistema governa **duas superfícies** de uma mesma marca, e as regras abaixo indicam sempre qual:

- **Vitrine** — o site de marketing (`themaestri.app`): claro, tipografia Geist, gradiente violeta de marca, "Liquid Glass" translúcido. É a **língua de vitrine (inglês)**.
- **Produto** — o app de desktop (o canvas de terminais): escuro-primeiro, flat, um accent, tokens de `tokens.css` como fonte de verdade. É a **língua-mãe (pt-BR)** no corpo.

---

## Índice

1. [Fundamentos & Princípios](#1-fundamentos--princípios)
2. [Cor](#2-cor)
3. [Tipografia](#3-tipografia)
4. [Espaçamento & Grade](#4-espaçamento--grade)
5. [Forma & Raios](#5-forma--raios)
6. [Materiais, Profundidade & Sombra](#6-materiais-profundidade--sombra)
7. [Motion](#7-motion)
8. [Componentes & Controles](#8-componentes--controles)
9. [Iconografia](#9-iconografia)
10. [Voz & Marca](#10-voz--marca)
11. [Tokens (resumo)](#11-tokens-resumo)

---

## 1. Fundamentos & Princípios

### 1.1 Os quatro pilares

| Pilar | Significa | Como se materializa |
|---|---|---|
| **Nativo** | App de desktop real, terminais de verdade — não web-wrapper, não emulação de marketing | Herda a stack de fonte do SO, respeita tema claro/escuro do sistema, chrome com vibrancy nativo, accent derivado do sistema. **Diga** "app", "desktop", "terminal de verdade"; **nunca** "web app", "console emulado". |
| **Performance — *buttery smooth*** | 60fps, zero jank; a interface some, o trabalho aparece | Motion só em `transform`/`opacity`; durações `120ms`/`200ms`; `prefers-reduced-motion` → `0ms`. Canvas redesenha só o que está on-screen. |
| **Privacidade — local / on-device** | Suas chaves, sua máquina, seus terminais | Orquestração só em `127.0.0.1` com token; renderer em sandbox; **não embute IA própria**. **Banido na copy:** "nuvem", "nossa IA", "sincroniza", "armazenamos". |
| **Foco sem distração** | Um canvas infinito, cromo mínimo, 1 accent | "Dark premium, one accent used sparingly". Quieto por padrão: nada de badges "Novo!", tour intrusivo ou exclamação. |

### 1.2 As três leis do sistema visual

1. **Flat por doutrina.** O produto **não tem um único gradiente**. Profundidade vem de camadas de superfície (`bg-0` → `bg-1` → `bg-2`) somadas a sombra. Introduzir gradiente na UI quebra a identidade. *(A única exceção é o glow roxo-magenta da marca-símbolo — um asset de marca, não um componente de UI. Ver §10.)*
2. **Um accent por tela.** O violeta é raro por design. Cores de estado (`ok`/`warn`/`err`) são semânticas, nunca decorativas. Foco/seleção usam o accent **translúcido** como halo, nunca sólido como fundo de área grande.
3. **Tudo via token.** Nenhum componente hardcoda cor, forma, sombra ou duração — sempre `var(--token)`. Qualquer valor fora das tabelas deste documento é dívida técnica. A troca de tema apenas flipa `data-theme` no `<html>`.

---

## 2. Cor

### 2.1 Superfícies & texto — tokens semânticos (Produto)

Escuro é o padrão (`:root`); claro (`[data-theme='light']`) sobrescreve **apenas cor e sombra**. Pares texto/fundo calibrados para contraste AA.

| Token | Papel | Escuro | Claro |
|---|---|---|---|
| `--bg-0` | Fundo do canvas (base) | `#0b0d12` | `#e9ebf0` |
| `--bg-1` | Painéis / nós / modais | `#12151c` | `#ffffff` |
| `--bg-2` | Elevação / hover | `#1a1e27` | `#eef0f4` |
| `--bg-2-weak` | `bg-2` translúcido (corpo de GroupNode) | `#1a1e2766` (~40%) | `#1a1e2710` (~6%) |
| `--border` | Divisórias / bordas padrão | `#262b36` | `#e2e5ec` |
| `--border-strong` | Ênfase / thumb de scrollbar | `#333a48` | `#cbd1db` |
| `--text-1` | Texto primário (corpo) | `#e6e9ef` | `#14171f` |
| `--text-2` | Texto secundário (rótulos/apoio) | `#a2abbd` | `#545e74` |
| `--text-3` | Terciário / placeholder / metadados | `#6b7488` | `#949cae` |

### 2.2 Accent & estados (Produto)

| Token | Papel | Escuro | Claro |
|---|---|---|---|
| `--accent` | Acento (violeta/índigo) | `#7c6cff` | `#6b5cf5` |
| `--accent-weak` | Halo de foco/seleção/hover suave | `#7c6cff22` (~13%) | `#6b5cf518` (~9%) |
| `--accent-text` | Texto **só** sobre fill `--accent` sólido | `#0e1016` | `#ffffff` |
| `--ok` | Sucesso | `#3fb984` | `#1f9d63` |
| `--warn` | Atenção | `#e0a13a` | `#b77e1e` |
| `--err` | Erro | `#e5615f` | `#cf4b48` |
| `--attention` | Attention dot do nó (systemRed) | `#ff453a` | `#ff3b30` |

**Regras de aplicação de cor:**
- `--accent-text` é de **uso restrito**: só sobre preenchimento `--accent` sólido (botão primário, badge SSH). No escuro é quase-preto (`#0e1016`) para bater ~4.9:1 sobre o violeta; sobre qualquer outro fundo o contraste quebra.
- Texto: `--text-1` no corpo, `--text-2` em rótulos/apoio, `--text-3` em placeholder e metadados desabilitados.
- Estados (`ok`/`warn`/`err`) **só** para semântica (status, validação, badges) — nunca como acento decorativo, nunca misturados com o accent de marca.
- No produto, a cor de UI ideal deriva do accent do sistema operacional (respeita a escolha do usuário) — o hex fixo é o fallback e o valor de referência. Hex fixos livres só em **temas de terminal**.

### 2.3 Marca — o glow roxo-magenta

Dois tons: roxo no núcleo, magenta na borda, dissolvendo em transparente. **Só sobre superfície escura.**

| Token | Hex | Papel |
|---|---|---|
| `--brand-violet` | `#7c6cff` | Núcleo do glow (= accent) |
| `--brand-magenta` | `#c74bff` | Extensão magenta da borda |

Tints violeta canônicos da marca-símbolo, em ordem de profundidade: núcleo/hub `#ffffff`→`#cfc6ff` · nós/detalhe `#b3a8ff` · estrutura/raios `#9d8fff` (55% opac.) · accent sólido `#7c6cff`.

### 2.4 Vitrine — paleta do site

O site (claro) usa a escala neutra Tailwind integralmente e um **gradiente violeta de marca** exclusivo para o trecho destacado do título.

**Base clara**

| Papel | Valor |
|---|---|
| Fundo global | `#ffffff` |
| Heading (near-black, estilo Apple) | `#1d1d1f` — **nunca** `#000` em heading |
| Corpo | `#171717` (neutral-900) |
| Corpo suavizado | `rgba(0,0,0,0.5)` / `rgba(0,0,0,0.4)` |
| Seção escura invertida | `#000000` (headings viram `#ffffff`) |
| Superfície escura de acento (CTA/nav pill) | `#1d1d1f`, hover `#2d2d2f` |

**Escala neutra (`--neutral-*`)**

| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| `#fafafa` | `#f5f5f5` | `#e5e5e5` | `#d4d4d4` | `#a1a1a1` | `#737373` | `#525252` | `#404040` | `#262626` | `#171717` | `#0a0a0a` |

Papéis: `100` = chip/eyebrow claro · `200` = borda de card · `400` = segunda cor de headline bicolor · `500` = texto de eyebrow.

**Gradiente-marca (headline bicolor)** — Violet-500 → Purple-500 → Purple-400:

```css
--gradient-brand: linear-gradient(to right, #8B5CF6, #A855F7, #C084FC);
/* aplicação: background-clip: text; -webkit-text-fill-color: transparent; */
```

### 2.5 Tints de "papel a 7%" (chips coloridos da Wall of Love)

Cada chip usa **a mesma cor** em três opacidades via sufixo hex de alpha. **Nunca** aplique opacidade ao elemento inteiro — só aos canais de fundo/borda, mantendo o texto sólido:

```css
background: {cor}12;    /* 0x12 = 7,06% — o "papel" */
border-color: {cor}30;  /* 0x30 = 18,8% */
color: {cor};           /* sólido 100% — contraste */
```

Paleta de acentos vibrantes (base Tailwind 400/500): `#F59E0B` `#EF4444` `#8B5CF6` `#EC4899` `#F97316` `#14B8A6` `#6366F1` `#FBBF24` `#A855F7` `#F43F5E` `#84CC16` `#3B82F6` `#06B6D4` `#10B981`.

---

## 3. Tipografia

### 3.1 Famílias

| Token | Valor | Onde |
|---|---|---|
| `--font-display` | `"Geist", "Geist Fallback"` | **Vitrine** — todos os títulos e corpo do site |
| `--font-ui` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif` | **Produto** — toda a UI (herda a fonte do SO) |
| `--font-mono` | `"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace` | Terminal, código, caminhos de arquivo, IDs, dot-matrix do hero |

Pesos ativos: **500** (medium) · **600** (semibold) · **700** (bold). Corpo do produto é 400 implícito. **Não usar caixa-alta no produto** — hierarquia de rótulo vem de peso 600 + tracking positivo, não de UPPERCASE. (A vitrine usa `uppercase` apenas no eyebrow.)

### 3.2 Escala — Vitrine (rem, `--text-*`)

Line-height expressa como razão sobre o tamanho da fonte (defaults da escala Tailwind).

| Token | Tamanho | Line-height |
|---|---|---|
| `--text-xs` | 0.75rem (12px) | 1.333 |
| `--text-sm` | 0.875rem (14px) | 1.429 |
| `--text-base` | 1rem (16px) | 1.5 |
| `--text-lg` | 1.125rem (18px) | 1.556 |
| `--text-xl` | 1.25rem (20px) | 1.4 |
| `--text-2xl` | 1.5rem (24px) | 1.333 |
| `--text-3xl` | 1.875rem (30px) | 1.2 |
| `--text-4xl` | 2.25rem (36px) | 1.111 |
| `--text-5xl` | 3rem (48px) | 1 |
| `--text-6xl` | 3.75rem (60px) | 1 |

Tracking: `tight -0.025em` · `wide 0.025em` · `wider 0.05em` · `widest 0.1em`.

### 3.3 Escala — Produto (px)

Base do documento: `body { font-size: 13px }`, `-webkit-font-smoothing: antialiased`. Grid em px.

| px | Papel típico |
|---|---|
| 9px | Micro-badge (ex.: SSH), peso 600, tracking `0.04em` |
| 10–10.5px | Metadados/contadores minúsculos, micro-legenda |
| 11px | Rótulo de seção (peso 600, tracking `0.02em`, cor `--text-3`), botões pequenos |
| **12px** | **Texto de UI mais comum** (controles, labels, itens de lista) |
| **13px** | **Base do corpo** |
| 14px | Destaque / título secundário |
| 15px | Título de painel (peso 600, line-height 1.25) |
| 16–17px | Títulos / cabeçalhos (17px é o topo prático) |

### 3.4 Papéis tipográficos concretos

| Elemento | Especificação |
|---|---|
| **H1 hero (vitrine)** | `clamp(2rem, 5vw, 4rem)`, peso 700, line-height 1.1, letter-spacing -0.025em, `text-wrap: balance`, cor `#1d1d1f` |
| **Subtítulo hero** | `clamp(0.95rem, 2vw, 1.35rem)`, line-height relaxed, `rgba(0,0,0,0.5)`, balance |
| **H2 seção clara** | `text-3xl` → `md:text-5xl`, 700, leading-tight, tracking-tight, `#1d1d1f`, balance |
| **H2 seção escura** | `text-4xl` → `md:text-6xl`, 700, `#ffffff` |
| **Headline bicolor** | trecho-marca via `<span>` com o gradiente violeta + trecho-contexto via `<em not-italic>` em `neutral-400` |
| **Eyebrow (vitrine)** | `text-xs`, peso 500, uppercase, tracking-wide |
| **Wordmark** | `Maestri` sentence-case, `--font-ui`, peso 600, tracking `-0.01em`, cor `--text-1` — nunca preenchido com o gradiente-glow |
| **Título de nó / header (produto)** | SF Pro / `--font-ui` **13px Semibold (600)**, contraste AA sobre a cor do papel |
| **Rótulo de seção (produto)** | 11px / 600 / letter-spacing 0.02em / `--text-3` |

**Regras:** títulos da vitrine sempre `700 + tracking-tight + text-balance`; nunca `#000` em heading (use `#1d1d1f`). Texto de leitura longa `line-height ≥ 1.45`; controles de linha única `line-height: 1`. Nunca aumente peso **e** caixa-alta juntos — escolha uma alavanca de ênfase.

---

## 4. Espaçamento & Grade

### 4.1 Grid de 4px (Produto)

O código atual ainda não define tokens `--space-*` — o espaçamento é literal em px, ancorado num **grid de 4px** com meio-passo de 2px para densidade óptica. Este sistema padroniza a escala `--space-*` abaixo (formalizada em §11) para substituir gradualmente os valores soltos.

| Step | px | Uso |
|---|---|---|
| 0.5× | 2px | Meio-passo óptico (gaps mínimos entre ícones/badges) |
| 1× | 4px | Gap base entre itens próximos |
| 1.5× | 6px | Gap/padding compacto de controles |
| **2×** | **8px** | **Padding mais comum** |
| 2.5× | 10px | Padding horizontal de controles/linhas |
| 3× | 12px | Espaço entre grupos |
| 3.5× | 14px | Indentação/padding de item com ícone |
| 4.5× | 18px | Padding generoso de botão largo |

Paddings canônicos copiáveis: `6px 8px` · `8px 10px` · `4px 8px` · `3px 6px` · `0 10px`. Diretriz: prefira múltiplos de 4; use 2/6/10/14px só para densidade de canvas; reserve 3/5/9px para casos existentes.

### 4.2 Grade do canvas

- **Snap grid: 20pt.** Valores encaixam na grade de 20pt.
- **Dot grid** sutil: pontos Ø 1px, espaçamento 20pt, cor `separatorColor` a ~6–10% de opacidade; some suavemente no zoom-out.
- Fundos disponíveis: **grid** · **plain** · **transparent**.

### 4.3 Ritmo vertical (Vitrine)

- Toda seção: `padding: 6rem 1.5rem` → `md: 8rem` (`px-6 py-24 md:py-32`).
- Alternância claro/escuro: seções `#fff` intercaladas com `bg-black`.
- Containers: `max-w-5xl` (64rem) e `max-w-6xl` (72rem), centralizados.
- Bento/cards: `grid gap-4` com `md:grid-cols-2` ou `md:grid-cols-3`.

---

## 5. Forma & Raios

### 5.1 Raios — Produto

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | `6px` | **Raio padrão** — inputs, botões, badges, itens de lista |
| `--radius` | `10px` | Cartões / painéis / nós genéricos |
| `--radius-lg` | `14px` | Modais / superfícies elevadas grandes |
| `--radius-node` | `10–12px` | Nós de terminal (ecoa o raio de janela do macOS Big Sur+) |
| `--radius-note` | `8px` | Sticky notes (menor, leitura "papel") |
| `--radius-pill` | `999px` | Pílulas / toggles / chips |
| `--radius-circle` | `50%` | Avatares / pontos de status / handles |

Tokens em código hoje: apenas `--radius-sm` / `--radius` / `--radius-lg` (6/10/14px); `--radius-node/note/pill/circle` são introduzidos por este sistema (ver §11). Off-token tolerados (herdados, não expandir): 2px, 4px, 8px, 9px. Regra: escolha `--radius-sm` primeiro; suba conforme a superfície cresce; `999px` só quando a forma precisa ler como pílula.

### 5.2 Raios — Vitrine

`--radius-lg 0.5rem` · `--radius-xl 0.75rem` · `--radius-2xl 1rem` · `--radius-3xl 1.5rem` · pill `9999px`.

| Componente | Raio | Notas |
|---|---|---|
| Pílulas (nav, botões, chips, eyebrows) | `9999px` | — |
| Card padrão | `1rem` (`rounded-2xl`) | padding 1.5rem (`md:2rem`), borda `1px solid #e5e5e5`, `bg-white` |
| Card destaque | `1.5rem` (`rounded-3xl`) | padding 2rem (`md:2.5rem`) |

---

## 6. Materiais, Profundidade & Sombra

### 6.1 Profundidade flat (Produto)

**Zero gradiente.** Volume = camadas de superfície + sombra. Suba de `bg-0` (base) → `bg-1` (painel/nó) → `bg-2` (hover/elevação) e adicione `--shadow-1`.

| Token / uso | Escuro | Claro |
|---|---|---|
| `--shadow-1` (elevação de repouso: nós, painéis, controles) | `0 1px 2px #0006, 0 2px 8px #0004` | `0 1px 2px #0000000f, 0 2px 8px #0000000a` |
| `--shadow-2` (overlays flutuantes: modais, palette, menus) | `0 8px 30px #0008` | `0 10px 30px #00000022` |
| Halo de foco/seleção | `0 0 0 3px var(--accent-weak)` | idem |
| Ring de avatar (recorte no fundo) | `0 0 0 2px var(--bg-0)` | idem |

Halos `0 0 0 Npx` são **rings**, não sombras de profundidade — use-os para foco/seleção. Não empilhe `--shadow-2` em elementos in-flow.

### 6.2 Vibrancy & "Liquid Glass" (Chrome / Vitrine)

O translúcido é reservado ao **chrome** (barras, sidebars, popovers, HUDs) e às superfícies flutuantes da vitrine. **Nós e notas são opacos e sólidos** — vidro só no cromo.

**Liquid Glass da vitrine** (nav pill flutuante) — o trio reutilizável:

```css
--glass-bg: rgba(255,255,255,0.72);
--glass-blur: blur(20px) saturate(180%);
--glass-border: rgba(0,0,0,0.08);
box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
```

**Materiais do produto (nativo)** — mapear para `NSVisualEffectView.Material` / SwiftUI materials:

| Superfície | Material |
|---|---|
| Sidebar / rail de workspaces | `.sidebar` |
| Toolbar / title bar | `.headerView` / `.titlebar` |
| Popovers e menus (conexões, cor, ícone) | `.menu` / `.popover` |
| HUDs (zoom control, minimapa) | `.hudWindow` |
| Fundo sob janela (vazamento do wallpaper) | `.underWindowBackground` |

### 6.3 A marca-símbolo (glow) — asset, não UI

A única "profundidade luminosa" permitida vive fora da UI, na marca-símbolo (uma janela de terminal real emitindo halo roxo→magenta):

```css
--brand-glow: radial-gradient(circle at 50% 45%,
  #7c6cff 0%,      /* núcleo roxo, opac. ~0.55 no centro */
  #c74bffcc 42%,   /* transição magenta */
  transparent 72%);
box-shadow: 0 0 60px 0 #7c6cff66, 0 0 120px 20px #c74bff33;
```

Corpo do símbolo: retângulo arredondado (raio ≈ 22% do lado), fill `#161329 → #08070d`. **Sempre sobre superfície escura**; nunca sobre fundo claro, nunca recolorido.

---

## 7. Motion

### 7.1 Tokens (Produto) — fonte de verdade

| Token | Valor | Uso |
|---|---|---|
| `--dur-1` | `120ms` | Micro-interações: hover, `border-color`, `background`, `color`, `transform`, `filter` |
| `--dur-2` | `200ms` | Entradas de elemento (fade/scale de modais, palette, sidebar) |
| `--ease` | `cubic-bezier(0.2, 0.6, 0.2, 1)` | **Curva única** para toda transição e animação de entrada |

**Acessibilidade embutida:** sob `@media (prefers-reduced-motion: reduce)`, `--dur-1`/`--dur-2` viram `0ms` no `:root` — toda animação colapsa automaticamente. **Nunca hardcode durações**; sempre `var(--dur-*)`.

### 7.2 Keyframes compartilhados

| Keyframe | Definição | Aplicação |
|---|---|---|
| `ork-fade-in` | opacity 0→1, `translateY(-4px)→0` | Dropdowns / entradas de topo |
| `ork-scale-in` | opacity 0→1, `scale(0.98)→1` | Modais / popovers |
| `ork-sidebar-fade` | opacity 0→1, `translateY(-2px)→0` | Itens da sidebar |
| `ork-attention-pulse` | ring `0→6px` em `rgba(224,161,58,0.55→0)`, `1.6s ease-in-out infinite` | **Única** animação em loop (indicador ambiente, cor `warn`) |

Padrão de uso: `animation: ork-scale-in var(--dur-2) var(--ease)`.

### 7.3 Movimento do canvas & vitrine (curvas de referência)

| Interação | Curva |
|---|---|
| Zoom / centragem de nó | ease-out ~250ms |
| Aparecer/selecionar nó | spring `response:0.35, dampingFraction:0.82` |
| Attention dot | pulso sutil de opacidade (0.6↔1.0, ~1s), sem bounce |
| Conexão **Rope** | física contínua (Verlet), sem timing curve |
| Conexão **Circuit** re-route | ease-in-out ~200ms |
| Vitrine — default | `0.15s cubic-bezier(0.4, 0, 0.2, 1)` (`--ease-emphasized`) |
| Vitrine — cor de link / hover | `0.2s ease` |

---

## 8. Componentes & Controles

### 8.1 Nós de terminal (o núcleo do produto)

Cada agente é uma **janela arredondada** flutuante, com **header colorido por papel**.

| Parte | Especificação |
|---|---|
| Forma | Retângulo arredondado (`--radius-node` 10–12px), desenhado por click-drag, redimensionável |
| **Header / barra de accent** | Faixa superior ~28–32pt na cor do papel (cheia, ou faixa fina de 3–4px sobre header vibrant); título `13px Semibold` com contraste AA |
| Role badge | Cor por papel: **Líder, Dev, Revisor, Testador** — "badge color" configurável |
| Attention dot | Ponto Ø 8pt `--attention` à direita do header quando o agente para e precisa de input (dispara notificação do sistema) |
| Number badge | Badge numérico p/ navegação por `⌘+número` |
| Connection badge | Abre a connections popover |
| Corpo | Superfície do terminal (tema de terminal), **opaco** |

**Estilos de seleção** (configuráveis; padrão em negrito): **Dashed Border** (traço accent 1.5pt, dash `[5,4]`, raio = raio do nó) · Solid Border (2pt) · Corners (4 cantos em L) · Corner Dots · Elevation (só sombra, sem stroke).

**Temas de terminal:** 30+ esquemas (Dracula, Catppuccin, Tokyo Night, Gruvbox, Nord, Solarized, Rosé Pine) via iTerm2/Ghostty. Hex livres **só aqui**.

### 8.2 Grupos

Frame compartilhado rotulado + **header arrastável**; **cor de grupo** tinge frame (tint a ~12–15% no preenchimento) e header/label (cheio). Align & Distribute: 8 operações (left/center-h/right/top/center-v/bottom + distribuir h/v).

### 8.3 Notas (sticky notes)

Sticky note = arquivo `.md` real em disco. **Opaca e sólida** (folha de papel), raio `--radius-note` (8px), fundo levemente cálido/off-white no light, cinza-neutro no dark. Modos **Raw** / **Formatted** (preview: headings, tabelas, code, checkboxes, imagens). Aceita `.md`/`.markdown`/`.txt` (drag do Finder). Fecha com `⌘W`.

### 8.4 Conexões (cabos coloridos)

Dois modos, trocáveis por conexão na popover:

| Modo | Comportamento |
|---|---|
| **Rope** (padrão) | Cabo com física — Verlet, 12–20 segmentos, `gravity ≈ 0.3`, `damping ≈ 0.92`, 2–3 iterações/frame, sag ~10–15%; recalcula só o nó movido |
| **Circuit** | Traços axis-aligned, no máx. duas curvas de 90° arredondadas (raio 6–8pt) — estética de placa de circuito |

Roteamento (por conexão): **contorna** os nós ou **passa por trás**. Espessura ~2pt, cor derivada do nó de origem / papel, sombra sutil para leitura sobre grade densa. Conecta terminal↔terminal, ↔nota, ↔portal e entre floors.

### 8.5 Botões

**Produto:** raio `--radius-sm`, `font 12px`, paddings canônicos (§4.1). Primário = fill `--accent` + texto `--accent-text`. Estados via `--dur-1`.

**Vitrine** (todos pílula `9999px`):

| Variante | Especificação |
|---|---|
| Preto (primário) | `bg #1d1d1f; color #fff; padding 0.875rem 2rem; 500/17px; tracking-tight`; hover `#2d2d2f` |
| Preto (nav compacto) | `bg #1d1d1f; color #fff; 600/0.75rem; padding 0.5rem 1rem` |
| Branco sólido | `bg-white; border 1px #e5e5e5; color #1d1d1f; 600`; hover `bg-neutral-50` |
| Branco translúcido (sobre escuro) | `border 1px rgba(255,255,255,0.2); color #fff`; hover `bg-white/10` |
| Badge pequeno | `inline-flex; border; padding 0.375rem 0.75rem; text-xs; 500; shadow-sm` |

### 8.6 Nav pill flutuante (Vitrine)

```css
position: fixed; top: 1.25rem; left: 50%; transform: translateX(-50%); z-index: 50;
display: flex; gap: 0.25rem; padding: 0.375rem; border-radius: 9999px;
background: var(--glass-bg); backdrop-filter: var(--glass-blur);
border: 1px solid var(--glass-border);
box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
```

Links: pílula, `padding 0.375rem 0.75rem`, `0.75rem/500`; inativo `rgba(0,0,0,0.4)`, ativo `#1d1d1f`, transição `color 0.2s`. Mobile: botão circular `2.875rem`, mesmo vidro.

### 8.7 Cards, eyebrow & bento (Vitrine)

- **Card:** `rounded-2xl border border-neutral-200 bg-white p-6 md:p-8`; chip de origem em tint de papel 7% (§2.5). Colunas da Wall of Love com fade de máscara no topo.
- **Eyebrow (chip):** `inline-block rounded-full bg-neutral-100 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500`; variante escura `bg-white/10 text-white/50`.

### 8.8 Chrome nativo & canvas (Produto)

- **Traffic lights:** 3 botões Ø 12pt, gap 8pt, ~20pt da borda; fechar `#FF5F57`, minimizar `#FEBC2E`, zoom `#28C840`.
- **Title bar:** translúcida com vibrancy; `titlebarAppearsTransparent = true` quando a toolbar integra ao canvas.
- **Sidebar / Mini Sidebar:** rail compacto de workspaces, ícones customizados, material `.sidebar`.
- **File Tree:** views search/outline/icon-grid, Quick Look thumbnails, badges de status Git + grafo de commits inline.
- **Color orb:** abre o `NSColorPanel` nativo.
- **Zoom/pan:** controles no canto inferior-direito; minimapa `⇧M`; edge-pan ao arrastar; pan alternativo com Espaço+arraste; fonte do terminal `⌘⇧+` / `⌘⇧−`.
- **Portais:** janelas de browser embutidas, conectáveis.

---

## 9. Iconografia

| Contexto | Sistema |
|---|---|
| Chrome do produto (toolbar, sidebar, menus) | **SF Symbols** — herdam peso/optical sizing do sistema |
| Ícone de nó | Picker de **grid de 40 ícones (SF Symbols) + emoji**, rolável |
| Cor de nó | **Color orb** → `NSColorPanel` nativo |
| Vitrine | Ícones inline no chip de origem, em tint de papel 7% |

Diretriz: no produto nunca reimplemente controles nativos — use `NSToolbar`, `NSVisualEffectView`, `NSColorPanel`, `.contextMenu`. Ícone sempre alinhado à baseline óptica do texto ao lado (gap 8px no lockup do wordmark).

---

## 10. Voz & Marca

### 10.1 Identidade

| Item | Valor | Regra |
|---|---|---|
| Nome | **Maestri** | Sempre capitalizado. Nunca `MAESTRI` fora de lockups travados, nunca `maestri` em corpo. |
| Etimologia | plural de *maestro* (regentes) | Ancora o verbo de marca **orquestrar / reger**. |
| Metáfora "ombro" | *sempre no seu ombro, nunca no seu caminho* | Presença discreta; a ferramenta acompanha sem atrapalhar. Vira o par vitrine "Always on your shoulder. Never in your way." |
| Origem | **São Paulo, Brasil** | Assinatura: `Feito em São Paulo, Brasil`. pt-BR é língua-mãe; inglês é vitrine. |
| Tagline | **"Every agent. One canvas."** | Lockup canônico **em inglês**, imutável. |
| Licença | MIT, open-source | Tom generoso e direto, nunca jurídico-defensivo. |

### 10.2 A declarativa de dois tempos

A unidade fundamental da voz, a forma da própria tagline:

```
[Tempo 1: a coisa/afirmação]. [Tempo 2: a virada — escopo, consequência ou contraste].
```

- **Separador:** ponto final. Nunca vírgula, travessão ou reticências.
- Cada tempo **≤ 4 palavras**; frase inteira **≤ 8**. Gramática paralela entre os tempos.
- Sem exclamação, sem hype vago, sem listar features.

| Inglês (vitrine) | Português (corpo) | Movimento |
|---|---|---|
| Every agent. One canvas. | Todo agente. Um canvas. | muitos → um |
| Real terminals. Zero wrappers. | Terminais de verdade. Zero wrapper. | afirma → nega o oposto |
| No embedded AI. Just yours, orchestrated. | Não embute IA. Orquestra a sua. | nega → reposiciona |
| They talk. You conduct. | Eles conversam. Você rege. | eles → você |
| Local by default. Yours by design. | Local por padrão. Seu por princípio. | fato → princípio |
| Always on your shoulder. Never in your way. | Sempre no seu ombro. Nunca no seu caminho. | presença → discrição |

**Anti-padrões (rejeitar em review):** vírgula-splice de 3 tempos ("Every agent, one canvas, zero friction"); hype + exclamação ("Supercharge your workflow!"); superlativo longo ("The ultimate platform for…"); contradição do produto ("Powered by our proprietary AI").

### 10.3 Tom & léxico

**Quatro atributos:** **Confiante** (afirma, sem hedging) · **Técnico** (nome certo da coisa: terminal, PTY, canvas, `orq`, `127.0.0.1`) · **Lúdico** (trocadilho contido maestro↔orquestrar; sem emoji em copy de produto) · **Brasileiro** (pt-BR natural, sem tradução engessada).

| Use | Evite |
|---|---|
| **canvas** (infinito) | quadro, board, tela, workspace |
| **agente** | bot, IA, assistente |
| **terminal (de verdade)** | console, emulador, aba |
| **orquestrar / reger** | gerenciar, controlar, rodar |
| **papel** (Líder, Dev, Revisor, Testador) | perfil, tipo, tag |
| **recrutar** (`orq recruit`) | adicionar, criar bot |
| **dispensar** (`orq dismiss`) | deletar, matar |
| **portal** (`orq portal`) | webview, iframe, aba |

**Micro-copy:** botões = verbo imperativo 1–2 palavras, minúsculas quando referem a CLI (`list · ask · check · note · recruit · connect · dismiss · portal`). Empty state em dois tempos ("Canvas vazio. Crie o primeiro agente."). Erros técnicos, calmos, acionáveis, cor `err`, sem culpar o usuário nem antropomorfizar ("Terminal encerrado. Reabra ou recrute outro.").

### 10.4 Checklist de review de voz

- [ ] Frase-âncora é declarativa de **dois tempos**, separada por **ponto**, cada tempo ≤ 4 palavras?
- [ ] Zero exclamação, zero hype, zero lista de features?
- [ ] Léxico respeitado (canvas/agente/terminal/orquestrar/papel)?
- [ ] Nenhuma menção a "nuvem", "nossa IA" ou armazenamento remoto?
- [ ] Tagline em inglês e intacta; corpo em pt-BR natural?
- [ ] Glow roxo-magenta só sobre superfície escura, 1 accent na tela?
- [ ] Erros calmos, técnicos e acionáveis?

---

## 11. Tokens (resumo)

Contrato de consumo: **sempre `var(--token)`**; a troca de tema flipa apenas `data-theme` no `<html>`; qualquer cor/raio/sombra/duração fora desta tabela é dívida técnica. Os nomes seguem `tokens.css` (sem prefixo `--color-`); tokens marcados `/* proposto */` ainda não existem no código e são padronizados por este sistema.

```css
:root {
  /* ── Cor · superfícies (escuro = padrão) ── */
  --bg-0: #0b0d12;
  --bg-1: #12151c;
  --bg-2: #1a1e27;
  --bg-2-weak: #1a1e2766;
  --border: #262b36;
  --border-strong: #333a48;

  /* ── Cor · texto ── */
  --text-1: #e6e9ef;
  --text-2: #a2abbd;
  --text-3: #6b7488;

  /* ── Cor · accent + marca ── */
  --accent: #7c6cff;
  --accent-weak: #7c6cff22;
  --accent-text: #0e1016;       /* só sobre fill --accent sólido */
  --brand-violet: #7c6cff;      /* proposto */
  --brand-magenta: #c74bff;     /* proposto */

  /* ── Cor · estados ── */
  --ok: #3fb984;
  --warn: #e0a13a;
  --err: #e5615f;
  --attention: #ff453a;         /* proposto (systemRed) */

  /* ── Cor · vitrine (site claro) · proposto ── */
  --heading: #1d1d1f;
  --neutral-100: #f5f5f5;
  --neutral-200: #e5e5e5;
  --neutral-400: #a1a1a1;
  --neutral-500: #737373;
  --gradient-brand: linear-gradient(to right, #8B5CF6, #A855F7, #C084FC);

  /* ── Tipografia · famílias ── */
  --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif;
  --font-mono: 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace;
  --font-display: 'Geist', 'Geist Fallback', var(--font-ui);   /* proposto */

  /* ── Tipografia · escala vitrine · proposto ── */
  --text-xs: 0.75rem;   --text-sm: 0.875rem;  --text-base: 1rem;
  --text-lg: 1.125rem;  --text-xl: 1.25rem;   --text-2xl: 1.5rem;
  --text-3xl: 1.875rem; --text-4xl: 2.25rem;  --text-5xl: 3rem;  --text-6xl: 3.75rem;
  /* produto usa px fixos: 12px UI · 13px corpo · 15px título de painel */

  /* ── Espaçamento · grid 4px · proposto ── */
  --space-0-5: 2px; --space-1: 4px;  --space-1-5: 6px; --space-2: 8px;
  --space-2-5: 10px; --space-3: 12px; --space-3-5: 14px; --space-4-5: 18px;
  --space-canvas-grid: 20px;

  /* ── Forma · raios ── */
  --radius-sm: 6px;
  --radius: 10px;
  --radius-lg: 14px;
  --radius-node: 12px;      /* proposto */
  --radius-note: 8px;       /* proposto */
  --radius-pill: 999px;     /* proposto */
  --radius-circle: 50%;     /* proposto */

  /* ── Profundidade · sombra + vidro ── */
  --shadow-1: 0 1px 2px #0006, 0 2px 8px #0004;
  --shadow-2: 0 8px 30px #0008;
  --glass-bg: rgba(255,255,255,0.72);      /* proposto */
  --glass-blur: blur(20px) saturate(180%); /* proposto */
  --glass-border: rgba(0,0,0,0.08);        /* proposto */
  --brand-glow: radial-gradient(circle at 50% 45%,
    #7c6cff 0%, #c74bffcc 42%, transparent 72%);  /* proposto */

  /* ── Motion ── */
  --dur-1: 120ms;
  --dur-2: 200ms;
  --ease: cubic-bezier(0.2, 0.6, 0.2, 1);          /* curva única do produto */
  --ease-emphasized: cubic-bezier(0.4, 0, 0.2, 1); /* vitrine · proposto */
}

:root[data-theme='light'] {
  --bg-0: #e9ebf0;
  --bg-1: #ffffff;
  --bg-2: #eef0f4;
  --bg-2-weak: #1a1e2710;
  --border: #e2e5ec;
  --border-strong: #cbd1db;
  --text-1: #14171f;
  --text-2: #545e74;
  --text-3: #949cae;
  --accent: #6b5cf5;
  --accent-weak: #6b5cf518;
  --accent-text: #ffffff;
  --ok: #1f9d63;
  --warn: #b77e1e;
  --err: #cf4b48;
  --attention: #ff3b30;         /* proposto (systemRed light) */
  --shadow-1: 0 1px 2px #0000000f, 0 2px 8px #0000000a;
  --shadow-2: 0 10px 30px #00000022;
}

@media (prefers-reduced-motion: reduce) {
  :root { --dur-1: 0ms; --dur-2: 0ms; }
}
```

---

*Maestri Design System · Todo agente. Um canvas. · Feito em São Paulo, Brasil.*
