# Orkestra — Linguagem de Design Unificada

> **Todo agente. Um canvas. Vidro sobre o escuro.**
>
> Esta é a **fonte de verdade única** do design do Orkestra: a síntese de dois documentos irmãos
> — o **Apple Design System** (clareza, deferência, profundidade, materiais, SF, rigor óptico) e o
> **Maestri Design System** (canvas infinito, accent violeta→roxo, pílulas, accents de papel,
> voz de dois tempos, nativo/privado) — dobrada numa só espec **pronta para implementar** no app
> Electron/React, em tema **claro E escuro**.
>
> Este documento **continua** o que já existe (`src/renderer/src/styles/tokens.css`, os `.ork-*`
> nos componentes) — não rompe. Mantém todos os nomes de token atuais e **adiciona** os novos.
> Onde há conflito entre Apple e Maestri, a regra de decisão está escrita. Público-alvo: os
> engenheiros que vão aplicar. Companheiro operacional: `orkestra-styling-inventory.md` (o mapa de
> onde cada estilo vive e quais lotes são paralelizáveis).

---

## Índice

1. [Essência — a fusão](#1-essência--a-fusão)
2. [Tokens (os dois temas, valores finais)](#2-tokens-os-dois-temas-valores-finais)
3. [Materiais & vibrancy](#3-materiais--vibrancy)
4. [Diretrizes de componente](#4-diretrizes-de-componente)
5. [Checklist de aplicação por arquivo](#5-checklist-de-aplicação-por-arquivo)

---

## 1. Essência — a fusão

O Orkestra herda de **duas linguagens** que, à primeira vista, parecem opostas — a Apple é
translúcida e luminosa; a Maestri é flat e escura por doutrina. A síntese não é uma média: é uma
**divisão de território por camada**.

| Camada | Quem governa | Regra |
|---|---|---|
| **Conteúdo** (nós, notas, terminais, canvas) | **Maestri** | Flat, opaco, sólido. Profundidade por camada de superfície (`--bg-0`→`--bg-1`→`--bg-2`) + sombra. O terminal é o produto; ele nunca fica atrás de vidro. |
| **Chrome** (topbar, sidebar, palette, menus, modais, HUDs) | **Apple** | Translúcido, `backdrop-filter`, vibrancy. O cromo cede o palco ao canvas — some quando não é usado, refrata o que está atrás. |
| **Marca** (logo-símbolo, gradiente de headline, botão primário) | **Maestri** | O glow roxo→magenta e o gradiente violeta→roxo são a **única voz de cor com timbre**. Tudo o mais é neutro. |

**Os cinco compromissos do Orkestra** (o que Apple + Maestri concordam, elevado a lei):

1. **Conteúdo é o produto; a interface é o vidro.** (Apple: deferência.) Priorize o canvas; o
   cromo é fino, quieto, translúcido. **Um** ponto focal por tela, **uma** ação primária.
2. **Profundidade honesta, nunca ornamento.** (Apple: materiais reais; Maestri: flat por doutrina.)
   No conteúdo, volume vem de camada+sombra. No cromo, de blur+hairline de luz. Nunca de borda
   grossa, cor chapada decorativa ou gradiente na UI de conteúdo.
3. **Um accent, usado com parcimônia.** (Maestri.) O violeta→roxo (`--accent`) é raro por design.
   Estados (`ok`/`warn`/`err`) são semânticos, nunca decorativos. Os **accents de papel**
   (amber/red/violet/pink/orange/teal/indigo/green) codificam **papéis** e **tipos de conexão** —
   sempre na receita "papel a 7%" (fundo translúcido, cor sólida só no traço/texto).
4. **Tudo via token; a troca de tema é um flip.** (Maestri lei 3.) Nenhum componente hardcoda cor,
   forma, sombra ou duração — sempre `var(--token)`. Trocar tema = flipar `data-theme` no `<html>`.
   Qualquer valor fora deste documento é dívida técnica.
5. **Nativo, privado, buttery-smooth.** (Maestri.) Herda a fonte do SO (SF/San Francisco no macOS),
   respeita o accent do sistema quando possível, 60fps (`transform`/`opacity`), `127.0.0.1`, sem
   nuvem. Voz de **dois tempos** em pt-BR: *[afirmação]. [virada].* — "Todo agente. Um canvas."

**Rigor óptico da Apple, aplicado ao Orkestra:** curvatura contínua (squircle) em raios ≥ 6px;
tracking **apertado** em títulos/display; hierarquia por **tamanho+peso**, cor como último recurso;
alvos confortáveis; foco de teclado sempre visível; `prefers-reduced-motion` troca a técnica
(movimento → fade), não remove o feedback.

---

## 2. Tokens (os dois temas, valores finais)

> **Reescrita completa de `styles/tokens.css`.** O `:root` é o tema **escuro** (padrão). O
> `:root[data-theme='light']` sobrescreve **cor, sombra e tints de vidro** — forma, tipografia e
> motion herdam. Todos os tokens atuais foram **mantidos**; os novos estão marcados `/* novo */`.
> Contraste dos pares texto/fundo calibrado para AA.

```css
/* ============================================================================
   Orkestra Design Tokens — fonte de verdade única (cor/forma/tipo/motion).
   :root = ESCURO (padrão). :root[data-theme='light'] = CLARO (só cor/sombra/vidro).
   Consumir SEMPRE via var(--token). Trocar tema = flip data-theme no <html>.
   ============================================================================ */
:root {
  /* ── SUPERFÍCIES · elevação por camada (flat, conteúdo opaco) ───────────── */
  --bg-0: #0b0d12;          /* fundo do canvas (base) */
  --bg-1: #12151c;          /* painéis, nós, notas, modais */
  --bg-2: #1a1e27;          /* elevação / hover / inputs */
  --bg-3: #232834;          /* novo — 4º plano: item ativo forte, chip elevado, thumb */
  --bg-2-weak: #1a1e2766;   /* --bg-2 translúcido (~40%): corpo do GroupNode */

  /* ── BORDAS & HAIRLINES ────────────────────────────────────────────────── */
  --border: #262b36;        /* divisória / borda padrão */
  --border-strong: #333a48; /* ênfase / thumb de scrollbar */
  --hairline: rgba(255,255,255,0.06);           /* novo — quina de luz sutil */
  --hairline-glass: inset 0 0.5px 0 rgba(255,255,255,0.10); /* novo — realce de vidro no topo */

  /* ── TEXTO (sólido, sobre superfícies opacas) ──────────────────────────── */
  --text-1: #e6e9ef;        /* primário / corpo */
  --text-2: #a2abbd;        /* secundário / rótulos */
  --text-3: #6b7488;        /* terciário / placeholder / metadados */

  /* ── VIBRANCY (rgba — texto/ícone SOBRE material translúcido do cromo) ──── */
  --label:   rgba(255,255,255,0.92);   /* novo — primário sobre vidro */
  --label-2: rgba(235,235,245,0.60);   /* novo — secundário sobre vidro */
  --label-3: rgba(235,235,245,0.30);   /* novo — terciário sobre vidro */

  /* ── ACCENT + MARCA (violeta → roxo; único timbre de cor) ──────────────── */
  --accent: #7c6cff;                   /* violeta/índigo */
  --accent-hover: #8f81ff;             /* novo — +~8% L p/ hover */
  --accent-weak: #7c6cff22;            /* halo de foco/seleção/hover (~13%) */
  --accent-text: #0e1016;              /* SÓ sobre fill --accent sólido (~4.9:1) */
  --brand-violet: #7c6cff;             /* novo — núcleo do glow (= accent) */
  --brand-magenta: #c74bff;            /* novo — borda magenta do glow */
  --gradient-brand: linear-gradient(135deg,#8B5CF6 0%,#A855F7 50%,#C084FC 100%); /* novo — headline/marca */
  --gradient-accent: linear-gradient(135deg,#7c6cff 0%,#a855f7 100%);            /* novo — botão primário */
  --brand-glow: radial-gradient(circle at 50% 45%,
    #7c6cff 0%, #c74bffcc 42%, transparent 72%);  /* novo — SÓ sobre superfície escura */

  /* ── ESTADOS (semânticos, nunca decorativos) ───────────────────────────── */
  --ok: #3fb984;    --ok-weak: rgba(63,185,132,0.15);    /* -weak: novo */
  --warn: #e0a13a;  --warn-weak: rgba(224,161,58,0.15);
  --err: #e5615f;   --err-weak: rgba(229,97,95,0.15);
  --danger: var(--err);          /* novo — alias (Canvas.css usava --danger inexistente) */
  --attention: #ff453a;          /* novo — systemRed: attention dot do nó */
  --attention-ring: rgba(255,69,58,0.55);  /* novo — anel do pulso (tokeniza o rgba hardcoded) */

  /* ── ACCENTS DE PAPEL (papéis, edges, chips — receita "papel a 7%") ────── */
  --paper-amber:  #F59E0B;
  --paper-red:    #EF4444;
  --paper-violet: #8B5CF6;
  --paper-pink:   #EC4899;
  --paper-orange: #F97316;
  --paper-teal:   #14B8A6;
  --paper-indigo: #6366F1;
  --paper-green:  #10B981;
  /* Receita de chip/badge de papel (mesma cor em 3 intensidades; NUNCA opacidade no elemento):
     background: <cor> + "12" (7%);  border-color: <cor> + "30" (19%);  color: <cor> (sólido).
     Em CSS moderno: color-mix(in srgb, var(--paper-x) 7%, transparent) p/ o fundo. */

  /* ── TIPOGRAFIA · famílias ─────────────────────────────────────────────── */
  --font-ui:   -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display',
               'Segoe UI', Inter, system-ui, sans-serif;   /* SF resolve Text/Display p/ optical sizing */
  --font-mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace;

  /* ── TIPOGRAFIA · escala em px (produto; base 13px) ── novo ─────────────── */
  --fs-micro: 9px;   /* micro-badge (SSH): 600 + tracking --tracking-badge */
  --fs-2xs:   10px;  /* contadores / metadados minúsculos */
  --fs-xs:    11px;  /* rótulo de seção (600 + --tracking-label), botões pequenos */
  --fs-sm:    12px;  /* texto de UI mais comum: controles, labels, itens de lista */
  --fs-base:  13px;  /* base do corpo (= body) */
  --fs-md:    14px;  /* destaque / título secundário */
  --fs-lg:    15px;  /* título de painel (600, lh --lh-snug) */
  --fs-xl:    17px;  /* título / cabeçalho (topo prático da UI densa) */
  --fs-2xl:   20px;  /* display pequeno (título de modal) */
  --fs-3xl:   24px;  /* display */

  /* ── TIPOGRAFIA · tracking & line-height ── novo ────────────────────────── */
  --tracking-tighter: -0.03em;  /* display ≥ 20px */
  --tracking-tight:   -0.02em;  /* títulos ≥ 17px */
  --tracking-normal:   0;       /* corpo / controles */
  --tracking-label:    0.02em;  /* rótulo de seção (11px/600) */
  --tracking-badge:    0.04em;  /* micro-badge (9px/600) */
  --lh-tight: 1.2;    /* display / títulos grandes */
  --lh-snug:  1.25;   /* títulos de painel */
  --lh-ui:    1;      /* controles de linha única */
  --lh-normal:1.45;   /* leitura longa (nota, markdown, preview) */

  /* ── TIPOGRAFIA · pesos ── novo ─────────────────────────────────────────── */
  --weight-regular: 400;   --weight-medium: 500;
  --weight-semibold: 600;  --weight-bold: 700;

  /* ── ESPAÇAMENTO · grid 4px (meio-passo 2px p/ densidade de canvas) ── novo ─ */
  --space-0-5: 2px;  --space-1: 4px;   --space-1-5: 6px;  --space-2: 8px;
  --space-2-5: 10px; --space-3: 12px;  --space-3-5: 14px; --space-4: 16px;
  --space-4-5: 18px; --space-5: 20px;  --space-6: 24px;   --space-8: 32px;
  --space-canvas-grid: 20px;   /* snap + dot grid do canvas */

  /* ── FORMA · raios (curvatura contínua p/ ≥ 6px) ───────────────────────── */
  --radius-sm: 6px;      /* padrão: inputs, botões, badges, itens de lista */
  --radius: 10px;        /* cartões / painéis / nós genéricos */
  --radius-lg: 14px;     /* modais / superfícies elevadas grandes */
  --radius-node: 12px;   /* novo — nós de terminal (raio de janela macOS Big Sur+) */
  --radius-note: 8px;    /* novo — sticky notes (leitura "papel") */
  --radius-pill: 9999px; /* novo — pílulas / toggles / chips flutuantes */
  --radius-circle: 50%;  /* novo — avatares / pontos de status / handles */

  /* ── PROFUNDIDADE · sombras em escala + rings ──────────────────────────── */
  --shadow-1: 0 1px 2px #0006, 0 2px 8px #0004;              /* repouso: nós, painéis, chips */
  --shadow-2: 0 8px 30px #0008;                              /* overlays: palette, menus, popovers */
  --shadow-3: 0 16px 48px #000a, 0 4px 12px #0007;           /* novo — modais / HUDs */
  --ring-focus: 0 0 0 3px var(--accent-weak);                /* novo — halo de foco/seleção */
  --ring-avatar: 0 0 0 2px var(--bg-0);                      /* novo — recorte de handle/avatar no fundo */

  /* ── MATERIAIS · vibrancy (backdrop-filter — receitas theme-constant) ──── */
  --material-thin:    saturate(180%) blur(20px);  /* novo — menus finos */
  --material-regular: saturate(180%) blur(24px);  /* novo — popovers, palette */
  --material-thick:   saturate(180%) blur(30px);  /* novo — modais, HUDs */
  --material-chrome:  saturate(160%) blur(30px);  /* novo — topbar, sidebar */
  /* Tints de vidro (mudam por tema — ver override claro abaixo): */
  --glass-1: rgba(18,21,28,0.72);      /* novo — chrome (topbar pills, sidebar) = bg-1 @ 72% */
  --glass-2: rgba(26,30,39,0.80);      /* novo — overlays (palette, menu, popover) = bg-2 @ 80% */
  --glass-3: rgba(18,21,28,0.90);      /* novo — modal/HUD (mais opaco) */
  --glass-border: rgba(255,255,255,0.08); /* novo — hairline de vidro */

  /* ── SCRIM (fundo escurecido de modal/palette — tokeniza rgba hardcoded) ── */
  --scrim: rgba(0,0,0,0.5);   /* novo */

  /* ── MOTION · durações + curvas (--ease é a curva-padrão do produto) ───── */
  --dur-1: 120ms;   /* micro-interações: hover, cor, borda, transform */
  --dur-2: 200ms;   /* entradas de elemento: fade/scale de modal, palette, sidebar */
  --dur-3: 320ms;   /* novo — navegação / zoom / centragem de nó */
  --ease:     cubic-bezier(0.2, 0.6, 0.2, 1);   /* curva única — default de tudo */
  --ease-out: cubic-bezier(0, 0, 0.58, 1);      /* novo — entradas (aparecer) */
  --ease-in:  cubic-bezier(0.42, 0, 1, 1);      /* novo — saídas (sumir) */
  --spring:   linear(0,.5,.9,1.02,1);           /* novo — press/seleção (aprox. spring snappy) */
  --press-scale: 0.97;                          /* novo — escala no press */
}

/* ── TEMA CLARO · sobrecarga (só cor/sombra/vidro; forma/tipo/motion herdam) ─ */
:root[data-theme='light'] {
  /* superfícies (base cinza, cards brancos — inversão grouped da Apple) */
  --bg-0: #e9ebf0;
  --bg-1: #ffffff;
  --bg-2: #eef0f4;
  --bg-3: #e2e5ec;
  --bg-2-weak: #1a1e2710;

  /* bordas & hairlines */
  --border: #e2e5ec;
  --border-strong: #cbd1db;
  --hairline: rgba(0,0,0,0.06);
  --hairline-glass: inset 0 0.5px 0 rgba(255,255,255,0.7);

  /* texto — primário near-black estilo Apple (NUNCA #000 em heading) */
  --text-1: #1d1d1f;
  --text-2: #545e74;
  --text-3: #949cae;

  /* vibrancy sobre vidro claro */
  --label:   rgba(0,0,0,0.88);
  --label-2: rgba(60,60,67,0.60);
  --label-3: rgba(60,60,67,0.30);

  /* accent + marca (violeta levemente mais escuro p/ texto branco AA) */
  --accent: #6b5cf5;
  --accent-hover: #5b4cf0;
  --accent-weak: #6b5cf518;
  --accent-text: #ffffff;             /* branco sobre --accent sólido (~4.6:1 AA) */
  --brand-violet: #7c6cff;
  --brand-magenta: #c74bff;
  --gradient-brand: linear-gradient(135deg,#8B5CF6 0%,#A855F7 50%,#C084FC 100%);
  --gradient-accent: linear-gradient(135deg,#6b5cf5 0%,#8b5cf6 100%);
  /* --brand-glow: só sobre superfície escura — NÃO usar no claro (seções invertidas apenas). */

  /* estados */
  --ok: #1f9d63;    --ok-weak: rgba(31,157,99,0.12);
  --warn: #b77e1e;  --warn-weak: rgba(183,126,30,0.12);
  --err: #cf4b48;   --err-weak: rgba(207,75,72,0.12);
  --danger: var(--err);
  --attention: #ff3b30;
  --attention-ring: rgba(255,59,48,0.5);

  /* accents de papel — hues constantes (mesma receita de 7%; ver caveat §4) */

  /* sombras (mais leves no claro) */
  --shadow-1: 0 1px 2px #0000000f, 0 2px 8px #0000000a;
  --shadow-2: 0 10px 30px #00000022;
  --shadow-3: 0 16px 48px #0000002e, 0 4px 12px #00000014;

  /* tints de vidro claro */
  --glass-1: rgba(255,255,255,0.72);
  --glass-2: rgba(255,255,255,0.85);
  --glass-3: rgba(255,255,255,0.94);
  --glass-border: rgba(0,0,0,0.08);

  --scrim: rgba(0,0,0,0.32);
}

/* ── ACESSIBILIDADE ─────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  :root { --dur-1: 0ms; --dur-2: 0ms; --dur-3: 0ms; --press-scale: 1; }
}
@media (prefers-contrast: more) {
  :root { --border: var(--border-strong); }  /* engrossa hairlines quando pedido */
}
```

**Regras de uso dos tokens:**
1. **Tokens, não hex cru** para UI. Hex fixo só em **temas de terminal** (iTerm2/Ghostty) e no
   asset da marca-símbolo (`Logo.tsx`, que também deve virar tema-aware via tokens de marca).
2. **Elevação por camada de background** (`--bg-0`→`--bg-1`→`--bg-2`→`--bg-3`), não por escurecer
   cor. No escuro, subir de plano = clarear.
3. **Sobre material (cromo) use `--label*`/`--glass*`** (vibrancy), nunca `--text-*` sólido.
4. **Estados de accent** derivam por luminosidade: hover = `--accent-hover`; pressed = `filter:
   brightness(0.92)`; foco/seleção = `--accent-weak`/`--ring-focus`.
5. **`--accent-text` é de uso restrito:** só sobre preenchimento `--accent` (ou `--gradient-accent`)
   sólido. Sobre qualquer outro fundo o contraste quebra.

---

## 3. Materiais & vibrancy

**Doutrina de território:** vidro **só no cromo** (topbar, sidebar, palette, menus, popovers,
modais, HUDs). **Nós, notas e terminais são opacos e sólidos** — o trabalho nunca fica atrás de
blur. O canvas é o único "fundo" que o vidro do cromo refrata.

### 3.1 Receita de superfície translúcida (o trio reutilizável)

```css
/* Chrome flutuante (topbar pills, sidebar): material mais denso, quieto. */
.superficie-cromo {
  background: var(--glass-1);
  backdrop-filter: var(--material-chrome);
  -webkit-backdrop-filter: var(--material-chrome);   /* obrigatório */
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-1), var(--hairline-glass);
  border-radius: var(--radius-pill);   /* ou --radius conforme o componente */
}

/* Overlay (palette, menu, popover): material regular. */
.superficie-overlay {
  background: var(--glass-2);
  backdrop-filter: var(--material-regular);
  -webkit-backdrop-filter: var(--material-regular);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-2), var(--hairline-glass);
  border-radius: var(--radius-lg);
}

/* Modal / HUD: material espesso, quase opaco. */
.superficie-modal {
  background: var(--glass-3);
  backdrop-filter: var(--material-thick);
  -webkit-backdrop-filter: var(--material-thick);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-3), var(--hairline-glass);
  border-radius: var(--radius-lg);
}
```

### 3.2 Gotchas obrigatórios do `backdrop-filter`

- Precisa de **conteúdo atrás** e o elemento **não pode ser 100% opaco** (tint em `1.0` mata o
  blur — por isso `--glass-*` fica em 0.72–0.94).
- Sempre incluir o prefixo **`-webkit-`**.
- Use **`contain: paint`** ou **`isolation: isolate`** para conter o custo de GPU.
- **Nunca empilhe dois `backdrop-filter`** na mesma pilha z (ex.: um menu de vidro dentro de uma
  sidebar de vidro → o menu usa fundo opaco `--bg-1`/`--bg-2`, não vidro).
- **Texto sobre vidro = `--label*`** (rgba), nunca `--text-*` sólido — o sólido "chapa" e perde o
  contraste adaptativo do vibrancy.

### 3.3 Hairline de luz (a quina que faz o vidro parecer físico)

Todo painel de vidro ganha `--hairline-glass` no topo (`inset 0 0.5px 0 rgba(255,255,255,…)`).
No **escuro** ela comunica elevação melhor que sombra (sombra some sobre fundo escuro); no **claro**
é mais sutil. **Detalhe Apple:** a hairline inferior da topbar/sidebar **só aparece quando há
conteúdo do canvas passando por baixo** — no topo do scroll a barra funde-se com o fundo.

### 3.4 O glow da marca — asset, não UI

`--brand-glow` é a única "profundidade luminosa" permitida, e vive **fora da UI**, só na
marca-símbolo (`Logo.tsx`), **sempre sobre superfície escura**, nunca recolorido, nunca sobre fundo
claro. Introduzir gradiente/glow na UI de conteúdo quebra a identidade flat.

---

## 4. Diretrizes de componente

> Cada seção mira as **classes `.ork-*` reais** já no código. "Manter" = já está certo; "Aplicar" =
> mudança concreta a fazer na reformulação.

### 4.1 Topbar — pílulas flutuantes (`Topbar.css`)

- **Estrutura:** `.ork-topbar` é `grid: 1fr auto 1fr`, `background: transparent`,
  `pointer-events: none` (as áreas vazias deixam o clique passar pro canvas). **Manter.**
- **Grupos flutuantes** (`.ork-topbar-pill`, `.ork-topbar-workspace`, `.ork-topbar-center`,
  `.ork-topbar-right`): cada chip é uma **pílula de vidro-cromo**. **Aplicar** a receita
  `.superficie-cromo`: `background: var(--glass-1)` + `backdrop-filter: var(--material-chrome)` +
  `border: 1px solid var(--glass-border)` + `box-shadow: var(--shadow-1), var(--hairline-glass)` +
  `border-radius: var(--radius-pill)`. Altura 32px. (Hoje usam `--bg-1` sólido — trocar por vidro.)
- **Botões-ferramenta** (`.ork-topbar-tool`): 30px, `--radius-sm`; nos `.ork-topbar-pill` viram
  circulares 26px (`--radius-circle`). Hover: `background: var(--bg-2)`, `color: var(--text-1)`.
  Ativo: `color: var(--accent)`. Divisória `.ork-topbar-pill-sep` = `--border`. **Manter.**
- **Texto de workspace:** `--fs-sm`, `--text-2`, elipse. Ícone monocromático.

### 4.2 Sidebar — source list (`ProjectsSidebar.css`)

- **Contêiner** (`.ork-sidebar`, 224px): **Aplicar** material `.sidebar` — `background:
  var(--glass-1)` + `backdrop-filter: var(--material-chrome)` (deixa o wallpaper/canvas vazar) +
  `border-right: 1px solid var(--border)`. Header é área de arraste da janela (traffic lights à
  esquerda). **Manter** o `-webkit-app-region`.
- **Filtro** (`.ork-sidebar-filter`): campo `--bg-2` + `--radius`; `:focus-within` →
  `border-color: var(--accent)`. **Manter.**
- **Rótulo de grupo** (`.ork-sidebar-group-header`): `--fs-xs` / `--weight-semibold` /
  `letter-spacing: var(--tracking-label)` / `--text-3`. Chevron gira 90°. **Manter** (só trocar os
  literais por tokens de tipo).
- **Linha de projeto** (`.ork-sidebar-project`): `--radius-sm`, hover `--bg-2`. Ativo:
  `background: var(--accent-weak)`. **Aplicar (opcional, estilo macOS source list):** barra de
  seleção accent de 3px via `::before` (igual ao `.ork-palette-item--active::before`), para leitura
  mais forte que só o fundo. Nome `--fs-sm`; badge de terminais em `--text-3`, `tabular-nums`. Ações
  (pasta/remover) aparecem no hover; remover armado → `--err`.
- **Rodapé + theme toggle** (`.ork-sidebar-footer`, `.ork-theme-toggle`): ícone-botão 30px,
  `--radius-sm`, hover `--bg-2`. **Manter.**

### 4.3 Nós do canvas (`.ork-node` em `nodes.css`)

- **Cartão** (`.ork-node`): `background: var(--bg-1)` **opaco** (doutrina), `border: 1px solid
  var(--border)`, **`border-radius: var(--radius-node)` (12px)** — trocar o atual `--radius`.
  `box-shadow: var(--shadow-1)`. Selecionado (`.react-flow__node.selected .ork-node`): `border-color:
  var(--accent)` + `box-shadow: var(--shadow-2), var(--ring-focus)`.
- **Header** (`.ork-node-header`, 28px): título **`--fs-sm` / `--weight-semibold` (600)** com
  contraste AA. **Accent por papel — duas formas (usar UMA por tipo de nó):**
  - **Barra de accent** (recomendado p/ terminal): faixa fina de 3px no topo do header na cor do
    papel — `.ork-node-header { box-shadow: inset 0 3px 0 var(--role-color); }` onde `--role-color`
    é setado inline pelo `TerminalFlowNode` a partir de `roles.ts`.
  - **Dot** (`.ork-node-dot`, já existe): 6px, cor por tipo — `--note`→`--warn`,
    `--portal`→`--accent`, `--filetree`→`--ok`, `--file`→`--accent`. **Manter.**
- **Papéis → accents de papel** (`roles.ts`, hoje: Líder `--accent`, Dev `--ok`, Revisor `--warn`,
  Testador `--err`): **Aplicar** a paleta de papel para separar "papel" de "estado" —
  Líder `--accent` (o regente), Dev `--paper-teal`, Revisor `--paper-amber`, Testador `--paper-pink`.
  Badge de papel (`.ork-role-badge`) na receita de papel: `background: color-mix(in srgb,
  var(--role) 7%, transparent)`, `border-color: color-mix(… 19% …)`, `color: var(--role)`,
  `border-radius: var(--radius-pill)`.
- **Caveat de tema claro (accents de papel) — o "caveat §4" citado no bloco `[data-theme='light']`
  da §2.** O hue puro do papel serve de **texto** sobre tint de 7% no **escuro** (passa AA sobre
  `--bg-1`), mas **falha no claro** (ex.: `--paper-amber` puro sobre branco ≈ 1.9:1). Regra de
  aplicação, válida para **toda** consumidora da receita (role badge §4.3, badge de edge §4.10,
  tint de grupo §4.13): **fundo e borda** usam o hue puro nos dois temas (`color-mix … 7%` / `19%`);
  o **texto** deriva por luminosidade — no escuro use o hue puro; no claro **escureça-o até cruzar
  4.5:1**: `color: color-mix(in srgb, var(--role) 62%, #000)`. Como isso muda só o canal de texto,
  o badge continua theme-aware por token, sem hex cru.
- **Attention dot** (`.ork-node-attention`): fill `var(--attention)`; o pulso `ork-attention-pulse`
  usa `var(--attention-ring)` no lugar do `rgba(224,161,58,…)` hardcoded. Pulso desligado sob
  `prefers-reduced-motion`. É a **única** animação em loop do app.
- **Badge SSH** (`.ork-ssh-badge`): `--fs-micro` / 600 / `--tracking-badge`, fill `--accent`,
  texto `--accent-text`, `--radius-sm`. **Manter.**
- **Rodapé** (`.ork-node-footer`): caminho em `--font-mono` / `--fs-xs` / `--text-3`, `direction:
  rtl` p/ manter a pasta atual visível. **Manter.**

### 4.4 Notas / sticky notes (`.ork-note*` em `nodes.css`)

- **Folha de papel opaca**, `border-radius: var(--radius-note)` (8px). Fundo neutro `--bg-1` no
  dark; no light, off-white levemente cálido. Pega de arraste (`.ork-note-drag`) = barrinha central
  discreta.
- **Post-it colorido** (`noteColors.ts`, 6 hex de papel — tons pastéis): são **tints de papel
  theme-independentes**; podem permanecer como hex fixos (é "papel", não UI). Texto sobre post-it
  colorido = `#1a1a1a` fixo (contraste garantido sobre pastel claro nos dois temas). **Manter**,
  mas mover os 6 hex para tokens `--note-*` p/ rastreabilidade.
- **Editor** (`.ork-note-editor .ProseMirror`): `--fs-base` / `--lh-normal`; headings `--lh-snug`.
  Botão de lupa e barra de find (`.ork-note-find-btn`, `.ork-find-bar`) usam `--bg-1` +
  `--shadow-1/2`. **Manter.**

### 4.5 Terminal chrome (`TerminalNode.tsx`, `.ork-node-*`)

- **Ponto crítico (inventário):** o xterm hoje **não tem objeto `theme`** — usa preto/branco
  padrão, não tokenizado, não acompanha o tema. **Aplicar** um `theme` derivado dos tokens em
  runtime (ler `getComputedStyle` das custom properties):
  ```ts
  const css = getComputedStyle(document.documentElement);
  const term = new Terminal({
    fontFamily: 'var(--font-mono)'.replace(/^var\(|\)$/g, '') || 'ui-monospace, SF Mono, Menlo, monospace',
    fontSize: 13,   // = --fs-base
    theme: {
      background: css.getPropertyValue('--bg-1').trim(),
      foreground: css.getPropertyValue('--text-1').trim(),
      cursor: css.getPropertyValue('--accent').trim(),
      selectionBackground: css.getPropertyValue('--accent-weak').trim(),
    },
  });
  ```
  Reaplicar no flip de tema. **Temas de terminal** nomeados (Dracula, Tokyo Night, Nord…) são a
  **única** exceção onde hex livre é permitido.
- **Traffic lights / title bar:** nativos (`titlebarAppearsTransparent`), vibrancy do SO.

### 4.6 CommandPalette (`CommandPalette.css`)

- **Backdrop** (`.ork-palette-backdrop`): `background: var(--scrim)` (trocar o `rgba(0,0,0,0.5)`
  hardcoded). Card ancorado a 15vh do topo.
- **Card** (`.ork-palette-card`, 480px): **Aplicar** `.superficie-overlay` (vidro regular) OU manter
  `--bg-1` opaco — **decisão:** vidro regular (`--glass-2` + `--material-regular`), como o Spotlight.
  `--radius-lg`, `--shadow-2`, `animation: ork-scale-in var(--dur-2) var(--ease)`. **Manter** o
  scale-in.
- **Input** (`.ork-palette-input`): `--fs-lg`, borda só embaixo (`--border`). **Item ativo**
  (`.ork-palette-item--active`): `--accent-weak` + barra accent 3px via `::before`. **Manter** —
  é o padrão de "item selecionado" a replicar na sidebar.

### 4.7 ContextMenu (`CanvasContextMenu.css`)

- **Card** (`.ork-ctxmenu`): **Aplicar** material `.menu` — `background: var(--glass-2)` +
  `backdrop-filter: var(--material-thin)` + `border: 1px solid var(--glass-border)` +
  `box-shadow: var(--shadow-2), var(--hairline-glass)`, `--radius`. Item hover `--bg-2`.
- **Item danger** (`.ork-ctxmenu-item--danger`): `color: var(--danger)` (agora token real; remover
  o fallback `#e5615f`). Hover: `background: var(--err-weak)` (trocar o `color-mix` por token).

### 4.8 Modal (`NewTerminalModal.css`)

- **Backdrop** (`.ork-modal-backdrop`): `background: var(--scrim)`.
- **Card** (`.ork-modal-card`): **Aplicar** `.superficie-modal` (vidro espesso `--glass-3` +
  `--material-thick`) OU `--bg-1` opaco — **decisão:** vidro espesso para HUD/modal, `--radius-lg`,
  `--shadow-3`, `ork-scale-in`. Título `--fs-xl` / `--weight-bold` / `--tracking-tight`.
- **Tabs** (`.ork-newterm-tabs`/`-tab`): trilho `--bg-2`, `--radius-pill`; aba ativa
  `background: var(--accent)` + `color: var(--accent-text)`. **Presets** e **roles** = chips
  `--radius-pill`; ativo → `--accent`/`--accent-weak`.

### 4.9 Botões (`.ork-btn` em `NewTerminalModal.css`; `.ork-toolbar-btn` etc.)

- **Primário (1 por tela — regra Apple):** `.ork-btn--primary` — **Aplicar** pílula com
  **gradiente** por padrão: `background: var(--gradient-accent)`; `color: var(--accent-text)`;
  `border-radius: var(--radius-pill)`; hover `filter: brightness(1.08)`; press `transform:
  scale(var(--press-scale))`. Variante **sólida** (`background: var(--accent)`) para superfícies
  densas onde o gradiente distrai. Foco: `box-shadow: var(--ring-focus)`.
  *(Por que um gradiente aqui não viola "flat por doutrina": o botão primário é **território de
  Marca** — ver a tabela de camadas da §1 —, não UI de conteúdo. O gradiente violeta→roxo é a
  mesma "única voz de cor com timbre" do glow e da headline; permanece proibido em nós, notas,
  chips e qualquer superfície de conteúdo.)*
- **Secundário/ghost** (`.ork-btn--ghost`): `--bg-2` + `border: 1px solid var(--border)`; hover
  `border-color: var(--border-strong)`.
- **Neutro/toolbar** (`.ork-toolbar-btn`, `.ork-node-iconbtn`): transparente, hover `--bg-2`;
  danger → `--danger`. Desabilitado: `opacity: 0.35–0.5`. **Manter.**
- **Estados universais:** hover em ≤ `--dur-1`; press `scale(var(--press-scale))`; foco visível
  sempre (`:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px }`).

### 4.10 Edges — cores por tipo (`Canvas.css`, `nodes.css` badges)

- **Traçado por tipo** (`.ork-edge--<kind> .react-flow__edge-path`): `agent`→`--accent`,
  `chain`→`--ok`, `note`→`--warn`, `portal`→`--border-strong` (tracejado `6 4`), `link`→
  `--border-strong`. Selecionado → `--accent`, `stroke-width: 2.5`. **Manter.**
- **Corda (Rope)** (`.ork-rope`): `stroke-width: 3`, `stroke-dasharray: 2 9`, `linecap: round`
  (física Verlet). **Circuit:** eixos + curvas de 90° arredondadas (raio 6–8pt). **Manter.**
- **Badges de edge** (`.ork-edge-badge--<kind>`): borda+texto na cor do tipo, `background: var(--bg-2)`.
  `pointer-events: all` (reativa clique sobre o EdgeLabelRenderer). **Manter.** Onde quiser mais
  timbre, os tipos podem migrar para os **accents de papel** (ex.: `note`→`--paper-amber`,
  `chain`→`--paper-green`) — mantendo a legenda consistente com o traçado.

### 4.11 Canvas background — grade de pontos (`Canvas.tsx`, `Canvas.css`)

- **Dot grid:** `<Background variant="dots" gap={20} size={1}>` +
  `--xy-background-color: var(--bg-0)` + `--xy-background-pattern-color: var(--border)`.
  Pontos Ø 1px, espaçamento 20pt (= `--space-canvas-grid`), ~6–10% de opacidade; **somem
  suavemente no zoom-out**. **Manter** (já tokenizado).
- **MiniMap:** **corrigir** o `maskColor="rgba(11,13,18,0.6)"` hardcoded (= `--bg-0` escuro à mão,
  **não acompanha o tema claro**) — derivar de `--bg-0` via `color-mix`/`getComputedStyle`.
  `nodeColor="var(--text-3)"` já ok. `.ork-minimap` = `--border` + `--radius-sm` + `--shadow-1`.
- **Handles** (`.react-flow__handle`): 11px, `--radius-sm`, anel `--ring-avatar` p/ "descolar" do
  nó; entrada (`--in`) `--ok`, saída (`--out`) `--accent`. **Resize** em quinas L accent. **Manter.**

### 4.12 Foco, seleção & estados (transversal)

| Estado | Recipe |
|---|---|
| **Foco (teclado)** | `:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px }` (base.css) |
| **Seleção (nó/edge)** | `border-color: var(--accent)` + `box-shadow: var(--shadow-2), var(--ring-focus)` |
| **Hover (superfície)** | `background: var(--bg-2)` (ou `--accent-weak` p/ item selecionável) |
| **Press** | `transform: scale(var(--press-scale))`, ≤ `--dur-1` |
| **Desabilitado** | `opacity: 0.35–0.5; cursor: not-allowed` |
| **Nunca** | sinalizar estado **só por cor** — pareie com ícone/forma/peso |

### 4.13 Nós estruturais — GroupNode, FileTree, Portal

> Os três aparecem no checklist (§5, Lotes F/G) e reusam a fundação `.ork-node*`; esta seção fecha
> a diretriz acionável que faltava para eles.

**GroupNode** (`GroupNode.css`, `.ork-group`/`.ork-group-header`):
- **Frame** (`.ork-group`): `background: var(--bg-2-weak)`, `border: 1.5px dashed var(--border)`,
  `border-radius: var(--radius)`, `pointer-events: none`. Selecionado
  (`.react-flow__node.selected .ork-group`) → `border-color: var(--accent)`. **Manter.**
- **Header arrastável** (`.ork-group-header`, 22px, `dragHandle`): normalizar `font-size: 11px` →
  **`--fs-xs`**, `color: var(--text-2)`, `cursor: grab`, `pointer-events: auto`. **Manter** a
  mecânica de arraste.
- **Cor de grupo (Aplicar — hoje ausente; Maestri §8.2):** quando o grupo tem cor, tinja pela
  **receita de papel** (§4.3, com o **caveat de tema claro**): frame `background: color-mix(in
  srgb, var(--group-color) 7%, transparent)`, `border-color: color-mix(… 30% …)` (tracejado
  mantido), header/label em `var(--group-color)` sólido (texto escurecido no claro). Sem cor →
  neutro `--bg-2-weak`/`--border`.

**FileTree** (`FileTreeNode.css`; reusa `.ork-node`/`-header`/`-body`/`-iconbtn`/`-go`):
- **Linha** (`.ork-filetree-row`): normalizar o fracionário `font-size: 12.5px` → **`--fs-sm`**;
  `color: var(--text-1)`, hover `background: var(--bg-2)`. Triângulo (`.ork-filetree-triangle`)
  `--text-3` / `--fs-2xs`.
- **Marca de status Git** (`.ork-filetree-gitmark`, M/A/?/D): `--font-mono` / `--fs-xs` / 600, cor
  **semântica** por estado (`--warn` modificado, `--ok` adicionado, `--err` removido,
  `--text-3` untracked) — é status, não decoração; **nunca** um accent de papel aqui. **Manter**
  tokenizado.
- **Preview** (`.ork-filetree-preview-bar` `border-bottom: 1px solid var(--border)`; path
  `--text-2` → `--fs-sm`; `.ork-filetree-pre` `--font-mono`/`--fs-sm`/`--lh-normal`;
  `.ork-filetree-copybtn` = botão **ghost** da §4.9: `--border`, hover `--border-strong`). Mensagens
  (`.ork-filetree-msg--err/--warn`) já em token. **Manter/normalizar fontes.**
- **Empty state** (`.ork-filetree-choose`): copy de **dois tempos** + um botão primário/ghost —
  "Nenhuma pasta. Escolha uma." (§ voz, herdada de Maestri).

**Portal** (`PortalFlowNode.tsx`; reusa `.ork-node*`):
- **Cartão** opaco `--bg-1` + `--radius-node` (é conteúdo — **nunca vidro**). Dot
  (`.ork-node-dot--portal`) = `--accent`. Corpo (`.ork-node-body`) hospeda o `<webview>` **opaco**.
- **Barra de URL / sessão** (`.ork-node-urlbar`, `.ork-node-urlinput`, `.ork-portal-session`,
  `.ork-node-input`): campos `--bg-2` + `--radius-sm`, `:focus-within` → `border-color:
  var(--accent)`. Botão navegar (`.ork-node-go`) = ícone-botão accent (§4.9 neutro/accent). Todos
  consomem `--bg-*`/`--text-*`/`--radius-*` — remover qualquer literal.

---

## 5. Checklist de aplicação por arquivo

> Ordem: **Lote A (fundação) é pré-requisito**; B–G são disjuntos e paralelizáveis (ver
> `orkestra-styling-inventory.md` para o mapa completo de lotes).

### `styles/tokens.css` — Lote A (PRIMEIRO)
- [ ] Substituir o `:root` e o `:root[data-theme='light']` pelos blocos da **§2** (valores finais).
- [ ] Adicionar: `--bg-3`, `--hairline`, `--hairline-glass`, `--label*`, `--accent-hover`,
      `--brand-violet/magenta`, `--gradient-brand`, `--gradient-accent`, `--brand-glow`,
      `--ok/warn/err-weak`, `--danger`, `--attention`, `--attention-ring`, `--paper-*` (8),
      escala `--fs-*` + `--tracking-*` + `--lh-*` + `--weight-*`, `--space-*`, `--radius-node/note/
      pill/circle`, `--shadow-3`, `--ring-focus/avatar`, `--material-*`, `--glass-1/2/3`,
      `--glass-border`, `--scrim`, `--dur-3`, `--ease-out/in`, `--spring`, `--press-scale`.
- [ ] Light: `--text-1: #1d1d1f` (near-black), tints de vidro claros, `--scrim` mais leve.
- [ ] `prefers-reduced-motion` zera `--dur-1/2/3` e `--press-scale`.

### `styles/base.css` — Lote A
- [ ] `body`: `font-size: var(--fs-base)`; manter `font-family: var(--font-ui)` +
      `-webkit-font-smoothing: antialiased`.
- [ ] Manter `:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px }`.
- [ ] Opcional: `letter-spacing` de títulos globais via `--tracking-tight` (em elementos de display).

### `styles/motion.css` — Lote A
- [ ] Manter `ork-fade-in` / `ork-scale-in`. Adicionar `ork-attention-pulse` **tokenizado**
      (usar `var(--attention-ring)` no lugar do `rgba(...)` — hoje vive em `nodes.css`; centralizar).
- [ ] Durações sempre via `var(--dur-*)` (já colapsam sob reduced-motion).

### `styles/scrollbars.css` — Lote A
- [ ] Trocar literais por `--border-strong`/`--text-3`; `border-radius` via token.

### `components/Canvas.css` + `Canvas.tsx` — Lote B
- [ ] `.ork-node-toolbar-badge` `color:#fff` → `--accent-text`; `--danger` agora existe.
- [ ] `.ork-fmt-swatch` `border rgba(0,0,0,0.15)` → `--hairline`/`--border`.
- [ ] MiniMap `maskColor` derivado de `--bg-0` (tema-aware). `Background dots gap=20 size=1`.
- [ ] Edges/handles/resize: já tokenizados — só revisar cores por tipo (§4.10) e `--ring-avatar`.

### `components/nodes.css` — Lote C
- [ ] `.ork-node` → `--radius-node`; selecionado + `--ring-focus`.
- [ ] Pulso de atenção → `--attention` + `--attention-ring`.
- [ ] Post-it: `color:#1a1a1a`, link `#0a7`, `rgba(0,0,0,.35)`, `rgba(127,127,127,.18)` → tokens.
- [ ] Header do terminal: barra de accent de papel (§4.3); badges papel/SSH/edge tokenizados.

### `components/TerminalNode.tsx` + `TerminalFlowNode.tsx` + `NewTerminalModal.*` — Lote D
- [ ] **Adicionar `theme` do xterm derivado dos tokens** (§4.5) + `fontSize: 13`, `fontFamily`
      tokenizada; reaplicar no flip de tema.
- [ ] Modal: `.superficie-modal` (vidro espesso) + `--scrim`; botão primário pílula/gradiente.

### `components/ProjectsSidebar.*` + `Topbar.*` + `ThemeToggle.tsx` + `Logo.tsx` — Lote E
- [ ] Sidebar → material `.sidebar` (`--glass-1` + `--material-chrome`); barra de seleção accent.
- [ ] Topbar pills → `.superficie-cromo` (vidro) em vez de `--bg-1` sólido.
- [ ] Normalizar `font-size` fracionários (12.5px/10.5px) para `--fs-*`.
- [ ] `Logo.tsx`: mover hex de marca inline (`#161329`, `#08070d`, `#7c6cff`…) para tokens de marca;
      tema-aware; glow só sobre escuro.

### `components/CommandPalette.*` + `CanvasContextMenu.*` + `GroupNode.*` + `FileTreeNode.*` — Lote F
- [ ] Palette: card em vidro regular; backdrop `--scrim`; item ativo com barra accent (manter).
- [ ] ContextMenu: material `.menu`; danger `--danger` + `--err-weak`.
- [ ] GroupNode (§4.13): `--bg-2-weak` + tracejado `--border`; header `--fs-xs`; tint de grupo na
      receita de papel 7% (com caveat de tema claro no texto).
- [ ] FileTree (§4.13): `.ork-filetree-row` `12.5px` → `--fs-sm`; gitmark semântico
      (`--warn`/`--ok`/`--err`/`--text-3`); preview/pre/copybtn tokenizados; empty state em dois tempos.

### `App.tsx` + `ErrorBoundary.tsx` + `PortalNode.tsx` + `Icon.tsx` — Lote G
- [ ] Remover estilos inline; `ErrorBoundary` `color:'var(--err)'` (sem fallback hex).
- [ ] Portal (§4.13): cartão opaco `--radius-node`; barra de URL/sessão `--bg-2` + `:focus-within`
      accent; `<webview>` opaco. Portais e ícones consomem `--bg-*`/`--text-*`/`--radius-*`.

---

*Orkestra Design Language · Todo agente. Um canvas. Vidro sobre o escuro. · Síntese Apple + Maestri
· Feito em São Paulo, Brasil.*
