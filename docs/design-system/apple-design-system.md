# Apple Design System

> Um sistema construído sobre uma convicção: **o conteúdo é o produto; a interface é o vidro**. A Apple projeta para que a UI desapareça — clareza acima de ornamento, deferência ao conteúdo, profundidade que orienta sem competir. Nada é decorativo por acaso: cada cor, peso tipográfico, raio e milissegundo de animação existe para comunicar função, estado ou causalidade. A estética emerge do rigor (correção óptica, física real de movimento, hierarquia por camadas translúcidas), nunca do enfeite. Este documento traduz a Human Interface Guidelines (iOS, iPadOS, macOS, visionOS) em tokens e regras acionáveis para replicar essa linguagem — inclusive fora do stack Apple, na web.

---

## Índice

1. [Fundamentos & Princípios](#1-fundamentos--princípios)
2. [Cor](#2-cor)
3. [Tipografia](#3-tipografia)
4. [Espaçamento & Grade](#4-espaçamento--grade)
5. [Forma & Raios](#5-forma--raios)
6. [Materiais, Profundidade & Sombra](#6-materiais-profundidade--sombra)
7. [Motion & Interação](#7-motion--interação)
8. [Componentes & Controles](#8-componentes--controles)
9. [Iconografia](#9-iconografia)
10. [Voz & Marca](#10-voz--marca)
11. [Tokens (resumo)](#11-tokens-resumo)

---

## 1. Fundamentos & Princípios

Toda a HIG se apoia em **três pilares** (introduzidos no iOS 7, mantidos até hoje). Não são temas visuais — são critérios de decisão para qualquer tela.

| Princípio | Definição operacional | Como aplicar |
|---|---|---|
| **Clareza (Clarity)** | Texto legível em qualquer tamanho, ícones precisos, ornamento subtraído, foco na função. | Priorize conteúdo sobre chrome. Contraste ≥ 4.5:1 (texto) / ≥ 3:1 (texto grande e gráficos). Alvos ≥ 44×44 pt. **Uma** ação primária por tela. |
| **Deferência (Deference)** | A UI cede o palco ao conteúdo; camadas translúcidas dão contexto sem competir. | Prefira materiais (`.regularMaterial`, `.thinMaterial`) a blocos opacos decorativos. Estenda conteúdo até as bordas (full-bleed) respeitando safe areas. Espaçamento no lugar de molduras. |
| **Profundidade (Depth)** | Camadas e transições realistas transmitem hierarquia e posição no fluxo. | Sheets deslizam sobre a base; o fundo desfoca e recua. Transições revelam relação hierárquica, não apenas "trocam de tela". Em visionOS a profundidade é literal (eixo Z). |

**Princípios de suporte:** Consistência (componentes e SF Symbols de sistema), Feedback (resposta perceptível ≤ 100 ms a toda ação), Controle pelo usuário (ações reversíveis, confirmação para destrutivas), Metáforas e Integridade estética.

**Hierarquia visual — quatro alavancas** (da mais forte à mais sutil): **tamanho/peso tipográfico** → **cor/contraste** → **espaço em branco** → **posição/camada**. Diretriz permanente: **um ponto focal por tela**; ações destrutivas em `systemRed`, separadas das confirmatórias.

**Adaptatividade sem breakpoints em px.** A Apple usa **size classes** (`Compact`/`Regular` por eixo) + Auto Layout. Em **wC** (compacto horizontal): empilhe verticalmente, largura total. Em **wR**: revele multi-coluna (sidebar + detalhe), grids, mais densidade. Use sempre valores **semânticos** que se adaptam a Dark Mode, Increase Contrast, Dynamic Type e RTL — nunca `#000`/`#FFF` ou pontos fixos hardcoded.

**Densidade por plataforma:**

| Plataforma | Densidade | Diretriz de linha/item |
|---|---|---|
| iPhone (toque) | Baixa–média | Linhas ≥ 44 pt; padding vertical 12–16 pt |
| iPad (toque + teclado) | Média | Multi-coluna; respeite a *readable width* |
| macOS (ponteiro) | Alta | Linhas de tabela ~24–28 pt, controles menores |
| visionOS | Baixa | Alvos ≥ 60 pt, muito espaço negativo, profundidade real |

Aumente densidade **reduzindo padding**, nunca o alvo de toque abaixo de 44 pt. Use *progressive disclosure* (chevrons, "Ver tudo", popovers) em vez de comprimir tudo na primeira dobra.

**Checklist de fundamentos:**
- [ ] Espaçamento múltiplo de **4 pt** (preferindo 8 pt).
- [ ] Alvos ≥ **44×44 pt** (60 pt em visionOS), ≥ 8 pt entre eles.
- [ ] Cores e tipografia **semânticas** (adaptam a modo/contraste/Dynamic Type).
- [ ] Layout responde por **size classes**, não px fixos.
- [ ] Contraste ≥ 4.5:1 (texto) / ≥ 3:1 (texto grande, gráficos).
- [ ] Feedback ≤ 100 ms; transições revelam profundidade.
- [ ] Tecnologia assistiva: rótulos e traits para VoiceOver (na web, HTML semântico + ARIA), ordem de foco lógica, **foco de teclado visível**; nunca sinalizar estado só por cor (pareie com ícone/forma/texto).

---

## 2. Cor

Regra central: **nunca hardcode um hex de UI cru** — consuma tokens semânticos que já resolvem light/dark, contraste e material. Hex fixo só para marca/ilustração. Os valores abaixo são **sRGB**; em telas wide-gamut prefira variantes **Display P3** (`color(display-p3 …)`) com fallback sRGB.

### 2.1 System Colors (tint / acento)

Cada cor tem par Light/Dark; no dark ficam mais luminosas para legibilidade sobre preto. O acento padrão do sistema é `systemBlue`.

| Token | Light | Dark | Alto contraste (light) |
|---|---|---|---|
| systemRed | `#FF3B30` | `#FF453A` | `#D70015` |
| systemOrange | `#FF9500` | `#FF9F0A` | `#C93400` |
| systemYellow | `#FFCC00` | `#FFD60A` | — |
| systemGreen | `#34C759` | `#30D158` | `#248A3D` |
| systemMint | `#00C7BE` | `#66D4CF` | — |
| systemTeal | `#30B0C7` | `#40C8E0` | `#0071A4` |
| systemCyan | `#32ADE6` | `#64D2FF` | — |
| **systemBlue** (acento padrão) | `#007AFF` | `#0A84FF` | `#0040DD` |
| systemIndigo | `#5856D6` | `#5E5CE6` | `#3634A3` |
| systemPurple | `#AF52DE` | `#BF5AF2` | `#8944AB` |
| systemPink | `#FF2D55` | `#FF375F` | `#D30F45` |
| systemBrown | `#A2845E` | `#AC8E68` | — |

**Como aplicar:** escolha UMA system color como acento do produto e derive hover/pressed por ajuste de luminosidade (~±8–12% L). Use as demais apenas como cores **funcionais**: vermelho = destrutivo/erro, verde = sucesso, laranja/amarelo = alerta, azul = informativo/link. No macOS respeite o `controlAccentColor` do usuário quando possível.

### 2.2 System Grays (6 níveis)

No dark, `Gray2→Gray6` **escurecem** progressivamente (em vez de clarear).

| Token | Light | Dark |
|---|---|---|
| systemGray | `#8E8E93` | `#8E8E93` |
| systemGray2 | `#AEAEB2` | `#636366` |
| systemGray3 | `#C7C7CC` | `#48484A` |
| systemGray4 | `#D1D1D6` | `#3A3A3C` |
| systemGray5 | `#E5E5EA` | `#2C2C2E` |
| systemGray6 | `#F2F2F7` | `#1C1C1E` |

`systemGray` = glifos inativos; `Gray4–Gray6` = fundos sutis, bordas, divisórias em superfícies claras.

### 2.3 Labels — hierarquia por **opacidade** (o coração do sistema)

Um único tinte base + níveis de opacidade cria toda a hierarquia de texto, adaptando-se a **qualquer** fundo (cor, material, foto). Base light `#3C3C43`; base dark `#EBEBF5`. **Implemente como `rgba`, nunca como cinza sólido** — o efeito sobre material/foto é diferente.

| Token | Light | Dark | Uso |
|---|---|---|---|
| label | `#000000` @ 100% | `#FFFFFF` @ 100% | Texto primário / títulos |
| secondaryLabel | `rgba(60,60,67,.60)` | `rgba(235,235,245,.60)` | Subtítulos, legendas |
| tertiaryLabel | `rgba(60,60,67,.30)` | `rgba(235,235,245,.30)` | Desabilitado, hints |
| quaternaryLabel | `rgba(60,60,67,.18)` | `rgba(235,235,245,.18)` | Watermark, placeholder sutil |
| placeholderText | `rgba(60,60,67,.30)` | `rgba(235,235,245,.30)` | Placeholder de input (≈ tertiary) |

Só `label`/`secondaryLabel` passam 4.5:1 e servem para leitura; terciário/quaternário são para conteúdo não-essencial.

### 2.4 Fill Colors (preenchimentos sem borda) — 4 níveis

Base translúcida cinza-azulada — de `#787880` (120,120,128) nos níveis 1–2 a `#747480` (116,116,128) no nível 4. As opacidades **sobem no dark**. Escolha o nível pelo **tamanho da forma** (quanto maior, mais opaco).

| Token | Light | Dark | Uso |
|---|---|---|---|
| systemFill | `#787880` @ 20% | `#787880` @ 36% | Thumbnail, campo grande |
| secondarySystemFill | `#787880` @ 16% | `#787880` @ 32% | Switch off track |
| tertiarySystemFill | `#767680` @ 12% | `#767680` @ 24% | Input pill, segment |
| quaternarySystemFill | `#747480` @ 8% | `#767680` @ 18% | Muito sutil |

### 2.5 Separators & Backgrounds em camadas

**Separators** (hairline de 0,5 pt @2x / 0,33 pt @3x):

| Token | Light | Dark |
|---|---|---|
| separator (translúcido) | `rgba(60,60,67,.29)` | `rgba(84,84,88,.60)` |
| opaqueSeparator (sólido) | `#C6C6C8` | `#38383A` |

**Elevação por cor, não por sombra.** Cada superfície que "sobe" usa o próximo nível de background. Escolha o conjunto pelo tipo de tela; o nível pela profundidade de empilhamento.

| System (telas não-agrupadas) | Light | Dark | | Grouped (listas/forms) | Light | Dark |
|---|---|---|---|---|---|---|
| systemBackground | `#FFFFFF` | `#000000` | | systemGroupedBackground | `#F2F2F7` | `#000000` |
| secondarySystemBackground | `#F2F2F7` | `#1C1C1E` | | secondarySystemGroupedBackground | `#FFFFFF` | `#1C1C1E` |
| tertiarySystemBackground | `#FFFFFF` | `#2C2C2E` | | tertiarySystemGroupedBackground | `#F2F2F7` | `#2C2C2E` |

Note a **inversão** do grouped: no light o fundo-base é cinza e os cards são brancos; no dark, base preto e cards cinza. Subir de camada no dark = clarear (`#000` → `#1C1C1E` → `#2C2C2E`).

### 2.6 Contraste & Acessibilidade

| Contexto | Razão mínima (WCAG AA) |
|---|---|
| Texto normal (< ~18 pt reg / 14 pt bold) | **4.5:1** |
| Texto grande (≥ ~18 pt / 14 pt bold) | **3:1** |
| Elementos gráficos / bordas de controle | **3:1** |

`systemYellow` e `systemGreen` sobre branco **falham** para texto pequeno — não use system color viva como cor de texto sem escurecer. Exponha `--accent-high-contrast` via `@media (prefers-contrast: more)` e **nunca** codifique estado apenas por cor (pareie com ícone/forma/texto).

### 2.7 Regras de aplicação de cor
1. **Tokens, não hex cru** para UI.
2. **Hierarquia por opacidade** (labels/fills), não por N cinzas sólidos.
3. **Elevação por camada de background**, não por sombra.
4. **Dark ≠ inversão simples:** grays e grouped-backgrounds invertem direção; fills ficam mais opacos; system colors mais luminosas — mantenha os dois valores por token.
5. **Sobre material → cores vibrant** (§6), nunca sólidas.

---

## 3. Tipografia

Todo o sistema é ancorado na família **San Francisco (SF)**, desenhada in-house e otimizada por **optical sizing**: o tamanho do ponto determina o corte óptico, e cada corte traz *tracking* e desenho próprios. Nunca defina tamanho sem definir também *leading* e *tracking* — os três andam juntos.

### 3.1 Famílias

| Família | Uso | Cortes / eixos | Pesos |
|---|---|---|---|
| **SF Pro** | UI padrão (iOS/iPadOS/macOS/visionOS) | `Text` (≤ 19 pt) e `Display` (≥ 20 pt); variável via eixo `opsz` | Ultralight → Black |
| **SF Pro Rounded** | Numéricos, HealthKit/Home | idem | Ultralight → Black |
| **SF Compact** | watchOS (glifos estreitos) | Text / Display | Ultralight → Black |
| **SF Mono** | Código, dados tabulares | — | Light → Heavy |
| **New York (NY)** | Serifa de leitura longa (Books, Notes) | Small → Extra Large | Regular → Black |

O **breakpoint óptico é 20 pt**: abaixo, **SF Pro Text** (aberturas maiores, mais legível em corpo pequeno); a partir daí, **SF Pro Display** (métricas já comprimidas — é o que "aperta" o tracking dos títulos). Prefira `-apple-system`/`system-ui`, que resolve Text vs. Display automaticamente pelo `font-size`.

```css
--font-sans:  -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, "Helvetica Neue", Arial, sans-serif;
--font-mono:  ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace;
--font-serif: ui-serif, "New York", Georgia, "Times New Roman", serif;
```

### 3.2 Pesos

| Nome | `font-weight` | Uso |
|---|---|---|
| Ultralight → Light | 100–300 | Displays decorativos, hero |
| **Regular** | **400** | Corpo padrão (Body, Callout, Footnote, Captions) |
| **Medium** | **500** | Ênfase suave, rótulos de toolbar |
| **Semibold** | **600** | Headline, botões, ícones de barra |
| Bold | 700 | Títulos "Emphasized", alertas |
| Heavy → Black | 800–900 | Marketing / impacto |

Regra de UI: **corpo = Regular 400; Headline = Semibold 600**.

### 3.3 Escala de estilos (iOS, tamanho *Large* padrão)

Em web, 1 pt ≈ 1 px na densidade base. Conversão de tracking: `letter-spacing(em) = tracking(pt) / tamanho(pt)` — aplique em `em`.

| Estilo | Tam. (pt / rem) | Peso | Emphasized | Line-height (pt) | Tracking (pt / em) |
|---|---|---|---|---|---|
| **Large Title** | 34 / 2.125 | Regular | Bold | 41 (~1.21) | +0.11 / +0.0032 |
| **Title 1** | 28 / 1.75 | Regular | Bold | 34 (~1.21) | +0.13 / +0.0046 |
| **Title 2** | 22 / 1.375 | Regular | Bold | 28 (~1.27) | +0.16 / +0.0073 |
| **Title 3** | 20 / 1.25 | Regular | Semibold | 25 (~1.25) | +0.19 / +0.0095 |
| **Headline** | 17 / 1.0625 | **Semibold** | Bold | 22 (~1.29) | −0.43 / −0.0253 |
| **Body** | 17 / 1.0625 | Regular | Semibold | 22 (~1.29) | −0.43 / −0.0253 |
| **Callout** | 16 / 1.0 | Regular | Semibold | 21 (~1.31) | −0.31 / −0.0194 |
| **Subheadline** | 15 / 0.9375 | Regular | Semibold | 20 (~1.33) | −0.23 / −0.0153 |
| **Footnote** | 13 / 0.8125 | Regular | Semibold | 18 (~1.38) | −0.08 / −0.0062 |
| **Caption 1** | 12 / 0.75 | Regular | Medium | 16 (~1.33) | 0.00 / 0 |
| **Caption 2** | 11 / 0.6875 | Regular | Semibold | 13 (~1.18) | +0.06 / +0.0055 |

**Headline e Body compartilham 17 pt** — o que os separa é o peso (Semibold vs. Regular). É o principal recurso de hierarquia em UI densa. O *leading* nunca é 1.0: cresce conforme o corpo diminui (Body ~1.29 → Footnote ~1.38) e aperta nos títulos (~1.21). O *tracking* **muda de sinal** no breakpoint óptico de 20 pt: corpo e rótulos (SF Pro Text, ≤ 19 pt) usam tracking **negativo** (apertado — ex.: Body −0.43 pt), enquanto títulos (SF Pro Display, ≥ 20 pt) usam tracking **levemente positivo** (+0.11 a +0.19 pt) para abrir as métricas já fechadas do Display — daí o salto aparente na coluna de tracking.

### 3.4 Dynamic Type

O corpo escala com a preferência do usuário: 7 categorias de conteúdo + 5 de acessibilidade (AX). Body (17 pt no padrão) varia de 14 pt (xSmall) a **53 pt (AX5)**.

| Categoria | Body | Categoria | Body |
|---|---|---|---|
| xSmall | 14 | xxxLarge | 23 |
| Small | 15 | AX1 | 28 |
| Medium | 16 | AX2 | 33 |
| **Large (padrão)** | **17** | AX3 | 40 |
| xLarge | 19 | AX4 | 47 |
| xxLarge | 21 | AX5 | 53 |

Títulos escalam menos e têm teto; corpo escala mais (é o que precisa ser lido). **Use *text styles* semânticos**, nunca tamanhos fixos. **Nunca truncar por altura fixa** — em AX3–AX5 o layout reflui para vertical (labels acima de valores, botões em coluna). Teste sempre em AX5.

### 3.5 Hierarquia — como aplicar
- **Tamanho + peso, não cor.** Cor é o último recurso.
- **Máx. 3–4 níveis por tela:** Título (Large Title/Title 1) → seção (Headline/Title 3) → corpo (Body) → metadado (Footnote/Caption).
- Captions (12/11 pt) só para metadados/timestamps, nunca leitura contínua.
- **New York** para leitura longa/editorial; não misture serifa e sans no mesmo bloco funcional.
- **SF Mono** com `tabular-nums` para colunas numéricas, códigos, diffs.
- **Não centralize** blocos longos; alinhe à esquerda. Centralização só para títulos curtos e empty states.

---

## 4. Espaçamento & Grade

A unidade é o **ponto (pt)**, independente de resolução. O ritmo é construído em **múltiplos de 8 pt**, com sub-grade de **4 pt** para ajustes finos. Pense sempre em pt; o sistema rasteriza para px (@2x = 2 px/pt, @3x = 3 px/pt). Prefira vetor (SF Symbols, SVG) a bitmap.

### 4.1 Escala de espaçamento

| Token | pt | Uso típico |
|---|---|---|
| `spacing-2` | 2 | Hairline, ajuste ótico mínimo |
| `spacing-4` | 4 | Gap ícone↔label, entrelinhas finas |
| `spacing-8` | 8 | Interno compacto, gap entre itens relacionados |
| `spacing-12` | 12 | Padding vertical de linhas de lista |
| `spacing-16` | 16 | **Margem de conteúdo (iPhone)**, padding de card |
| `spacing-20` | 20 | **Margem de janela (macOS)**, separação de grupos |
| `spacing-24` | 24 | Separação entre seções |
| `spacing-32` | 32 | Respiro entre blocos maiores |
| `spacing-40/48/64` | 40–64 | Separação de seções em telas amplas (iPad/Mac) |

**Lei da proximidade:** espaço interno relacionado ≤ espaço externo separador (ex.: label a 4 pt do valor, grupo a 16 pt do próximo).

### 4.2 Margens, safe areas & readable width
- **iOS:** `directionalLayoutMargins` padrão **16 pt** (20 pt em telas largas). **macOS:** inset de janela **20 pt**, gap entre controles ~8 pt.
- **`readableContentGuide`** limita blocos de texto a ~60–75 caracteres/linha em iPad/Mac largos.
- **Safe areas:** controles vivem **dentro** dela (exclui notch/Dynamic Island, barra de status, home indicator ~34 pt, barras); fundos decorativos **podem e devem** sangrar (`ignoresSafeArea`). Respeite os cantos arredondados da tela.

### 4.3 Alvos de toque & alturas de barra

| Plataforma | Alvo mínimo | | Barra de sistema | Altura (pt) |
|---|---|---|---|---|
| iOS/iPadOS | **44×44 pt** (≥ 8 pt entre alvos) | | Navigation bar (iOS) | 44 (large title ~96) |
| visionOS | 60 pt (olhar + pinça) | | Tab bar (iOS) | 49 (83 c/ safe area) |
| macOS (ponteiro) | 20–28 pt visual, hit ~28 pt | | Toolbar unificada (macOS) | ~52 |
| tvOS | foco (focus engine), sem toque | | Barra de menu (macOS) | 24 |

---

## 5. Forma & Raios

**Curvatura contínua (squircle).** A Apple usa continuidade G2 (`.continuous`), não arco de círculo simples — visual mais orgânico. Regra: qualquer raio ≥ 6 px deve ser contínuo (`RoundedRectangle(cornerRadius:style:.continuous)` / `layer.cornerCurve = .continuous`).

| Elemento | Raio | Nota |
|---|---|---|
| Controle pequeno (macOS push button) | 5–6 px | Bezel Aqua |
| Campo de texto / botão pequeno | 6–8 px | |
| Botão iOS preenchido/bordered | 8–14 px (comum 10–12) | |
| Card / widget | 12–16 px (widget ~22) | Use `ContainerRelativeShape` |
| Sheet / modal (topo) | 10–13 px | |
| Popover | macOS ~11 / iOS ~13 px | |
| Menu (macOS) | ~6 px | |
| Alert | 14 px (iOS) / ~10 px (macOS) | |
| **Capsule / pill** | `height / 2` | Tags, botões flutuantes iOS 15+, Liquid Glass |
| Ícone de app iOS | **22.37% da largura** (superelipse) | — |

**Concentricidade:** raio interno = raio externo − padding. Alinhe raios internos e externos ao mesmo centro.

---

## 6. Materiais, Profundidade & Sombra

Profundidade vem de **translucidez + desfoque + sombra difusa + hairline** — nunca de bordas grossas, cores chapadas ou sombras duras. Você deve sempre poder inferir o que está *atrás* de uma camada.

### 6.1 Os 5 materiais translúcidos

Quanto mais "espesso", mais opacidade (menos o fundo aparece); o blur permanece parecido. Padrão web: `backdrop-filter: saturate(160–180%) blur(Npx)` + tint semitransparente. A **saturação** é o que faz a cor do fundo "vazar" e dá o ar de vidro fosco.

| Material | SwiftUI | Blur / Sat | Tint light | Tint dark | Onde usar |
|---|---|---|---|---|---|
| Ultra Thin | `.ultraThinMaterial` | 20px / 180% | `rgba(255,255,255,.44)` | `rgba(37,37,37,.55)` | Controles sobre mídia, Control Center |
| Thin | `.thinMaterial` | 20px / 180% | `rgba(255,255,255,.62)` | `rgba(37,37,37,.70)` | Notification Center, popovers |
| **Regular** | `.regularMaterial` | 24px / 180% | `rgba(242,242,242,.80)` | `rgba(37,37,37,.82)` | **Padrão** de sheets e cards |
| Thick | `.thickMaterial` | 30px / 180% | `rgba(255,255,255,.90)` | `rgba(37,37,37,.90)` | Alertas, HUDs |
| Chrome | `.bar` | 30px / 160% | `rgba(255,255,255,.97)` | `rgba(30,30,30,.97)` | Tab/nav/toolbars |

**Gotchas de `backdrop-filter`:** precisa de conteúdo atrás e o elemento **não pode ser 100% opaco** (tint em `1.0` mata o blur); sempre inclua `-webkit-`; use `contain: paint`/`isolation: isolate` para conter custo de GPU; **nunca empilhe dois `backdrop-filter`** na mesma pilha z.

### 6.2 Vibrancy (conteúdo sobre material)

Texto e ícones sobre material **nunca** usam preto/branco puro — usam as cores semânticas translúcidas de **label** (§2.3) e **fill** (§2.4), que se misturam ao desfoque. Cor sólida sobre blur fica "chapada" e perde contraste adaptativo.

### 6.3 Elevação em camadas (máx. 3–4 planos)

Cada plano acima usa material mais espesso e/ou sombra maior — **nunca cor mais escura**.

| Plano | Exemplo | Material | Sombra | Borda |
|---|---|---|---|---|
| 0 — Base | Window/page | Opaco | — | — |
| 1 — Chrome | Sidebar, tab/nav bar | Chrome/Sidebar | — | Hairline |
| 2 — Superfície | Card, agrupamento | Regular | Resting | Hairline opcional |
| 3 — Overlay | Popover, menu | Regular/Thin | Overlay | Hairline + realce de topo |
| 4 — Modal | Alerta, HUD, sheet | Thick | Modal | Hairline |

### 6.4 Sombras (sutis e difusas)

Sempre preto puro, **opacidade baixa**, **raio grande** (≥ 4× o offset Y), offset Y pequeno.

| Nível | Recipe (light) | Uso |
|---|---|---|
| Resting | `0 1px 2px rgba(0,0,0,.10)` | Card em repouso |
| Raised | `0 1px 2px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.10)` | Card destacado, botão flutuante |
| Overlay | `0 2px 6px rgba(0,0,0,.12), 0 10px 30px rgba(0,0,0,.18)` | Popover, menu |
| Modal | `0 8px 24px rgba(0,0,0,.16), 0 20px 60px rgba(0,0,0,.28)` | Sheet, alerta, HUD |

**Dark mode:** sobre superfície escura sólida a sombra de *resting/raised* quase desaparece — nesses planos comunique elevação por **camada de fundo mais clara** (§2.5) e por **hairline superior clara** `inset 0 0.5px 0 rgba(255,255,255,.10)` (a "quina de luz" que faz o material parecer um painel físico), **não** por sombra. Já em *overlays/modais* que flutuam sobre um scrim escurecido, **mantenha ou reforce levemente** a sombra difusa para separá-los do fundo — por isso os tokens `--shadow-overlay`/`--shadow-modal` sobem a opacidade no dark.

### 6.5 Hairlines & refinamento

Separadores translúcidos de **0,33 px (@3x) / 0,5 px (@2x)**, nunca 1 px sólido, usando os tokens `separator`/`opaqueSeparator` (§2.5). Realce de vidro no topo de painéis: `inset 0 0.5px 0 rgba(255,255,255,.5)` (light) / `.1` (dark).

**Detalhe que separa cópia de original:** a hairline da nav/tab bar **só aparece quando há conteúdo passando por baixo**. No topo do scroll, a barra funde-se com o fundo (sem separador, sem tint). Replique com scroll listener (`scrollEdgeAppearance`).

---

## 7. Motion & Interação

Movimento comunica **causalidade** (o que causou o quê), **hierarquia** e **continuidade** (para onde o elemento foi). Toda animação precisa de propósito — se o usuário não aprende nada com ela, corte-a. Faixa de ouro de duração: **0.2–0.4 s**.

### 7.1 Springs (toque direto) vs. easing (transição temporal)

Desde o iOS 17 a Apple descreve springs por **`duration` + `bounce`** (`bounce = 1 − dampingFraction`).

| Preset | duration | bounce | Quando usar |
|---|---|---|---|
| `.smooth` | 0.5 s | 0.0 | Sem overshoot; mudanças de layout sérias |
| **`.snappy`** | 0.5 s | 0.15 | **Default de fato.** Botões, toggles, navegação |
| `.bouncy` | 0.5 s | 0.30 | Elementos lúdicos, drop de drag-and-drop |
| `.interactiveSpring` | resp. 0.15 s | — | **Enquanto o dedo arrasta** (segue o gesto) |

Use **spring** para qualquer coisa disparada por toque direto (devolve sensação de massa). Use **easing** para transições automáticas/temporais (duração default 0.35 s):

| Curva | `cubic-bezier` | Uso |
|---|---|---|
| `.easeOut` | `(0,0,.58,1)` | **Entradas** (aparecer) — o mais usado |
| `.easeIn` | `(.42,0,1,1)` | **Saídas** (sumir) |
| `.easeInOut` | `(.42,0,.58,1)` | Movimento A→B on-screen |
| `.linear` | `(0,0,1,1)` | Só progresso contínuo (spinners) |

### 7.2 Durações por interação

| Interação | Duração | Física/curva |
|---|---|---|
| Toggle, checkbox | 0.1–0.2 s | `.snappy` curto |
| Botão press (scale) | 0.1 s down / 0.2 s up | `.easeOut` / spring |
| Hover (macOS/iPad) | 0.15–0.2 s | `.easeInOut` |
| Fade in/out | 0.2–0.3 s | `.easeOut` in / `.easeIn` out |
| Navegação push | 0.35 s | `.easeInOut` / spring |
| Sheet / modal | 0.35–0.5 s | spring `.smooth`/`.snappy` |
| Hero transition | 0.4–0.5 s | spring bounce 0.2–0.3 |

Elementos que **saem** podem ser ~20% mais rápidos que os que entram. Distâncias maiores → um pouco mais de tempo (não linearmente).

### 7.3 Transições & direção = significado
- **`.asymmetric`** (padrão premium): entra rico (scale + fade), sai discreto (só fade).
- **`matchedGeometryEffect`** (continuidade máxima): a miniatura *vira* a tela cheia — o usuário nunca "perde" o objeto. Menus crescem a partir do botão que os abriu (origem visual = origem causal).
- **Direção:** horizontal = navegação hierárquica; vertical (de baixo) = modal/temporário. Não misture eixos. Sheets sobem com spring, escurecem o fundo e recuam o conteúdo anterior em escala (efeito "stack"); use `presentationDetents([.medium, .large])`.
- **Stagger** de ~0.03–0.05 s por item para entradas escalonadas.

### 7.4 Estados & haptics

| Estado | Transformação | Duração |
|---|---|---|
| **Press** | `scale(0.96)` + opacity 0.85, **reversível** | 0.1 s down / 0.2 s up spring |
| **Hover** (macOS/iPad/visionOS) | highlight de fundo, `scale(1.02)`, lift | 0.15–0.2 s easeInOut |
| **Focus** (tvOS/teclado) | lift + parallax + sombra ampliada | spring |

**Haptics** reforçam causalidade — sempre acompanham um evento visual/de estado, um por evento significativo, pesados pela importância. `Impact` (.light–.heavy) para encaixe físico; `Selection` para valores discretos (picker/stepper); `Notification` (.success/.warning/.error) para resultado de operação. Nunca em scroll contínuo ou hover; sempre `.prepare()` antes.

### 7.5 `prefers-reduced-motion` (obrigatório)

Regra: **não remova o feedback, troque a técnica** — movimento espacial (slide/scale/parallax) vira **cross-dissolve (fade)**. Elimine parallax, auto-play, zoom, bounce (bounce → 0). **Mantenha** hápticos e mudanças de estado (cor, checkmark). Fade curto (~0.2 s) para não parecer lento.

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .01ms !important; transition-duration: .2s !important; }
}
```

---

## 8. Componentes & Controles

**Fundamentos de todo controle:** curvatura contínua (§5); alvo ≥ 44×44 pt (iOS) / ~28 pt clicável (macOS); rótulos em SF Pro, Regular para conteúdo e **Semibold para ação de destaque**. No macOS o `.controlSize` muda altura/fonte/padding: `.mini` (16 pt) → `.small` (19 pt) → `.regular` (21–22 pt) → `.large` (28–30 pt) → `.extraLarge` (34–38 pt). No iOS o rótulo padrão é 17 pt (Body).

### 8.1 Botões

| Estilo | SwiftUI | Preenchimento | Quando usar |
|---|---|---|---|
| **Filled / Prominent** | `.borderedProminent` | Acento sólido, texto branco Semibold | **1 por tela** — ação primária |
| Tinted | `.bordered` + `.tint()` | Acento @ ~15% | Secundária destacada (iOS) |
| Gray / Bordered | `.bordered` | `quaternarySystemFill` | Ação neutra |
| Plain / Borderless | `.plain` | Nenhum | Links, ações em linha |
| Destructive | `+ role:.destructive` | Vermelho sistema | Apagar, remover |

**Raios:** macOS 5–6 px (large 7–8); iOS 8–14 px (comum 10–12); capsule = `height/2`. **Padding:** iOS ~16 px H / altura total ≥ 44 pt; gap ícone↔texto 6–8 px (`Label`). **Estados:** pressed = fill @ opacity 0.8; disabled = opacity 0.3–0.35; focus = anel 3 px na cor de acento; default (Return) via `.keyboardShortcut(.defaultAction)`.

### 8.2 Controles de seleção & entrada

| Componente | Dimensões-chave | Notas |
|---|---|---|
| **Segmented** | iOS 32 pt alt., trilho raio ~8–9 px, thumb raio ~6–7 px inset 2 px | 2–5 segmentos iguais; trilho `tertiarySystemFill`, thumb elevado c/ sombra sutil |
| **Switch / Toggle** | iOS trilho 51×31 pt (capsule), knob 27 pt c/ sombra | ON = `systemGreen` ou tint; OFF = trilho cinza. Só para estado binário imediato |
| **Slider** | iOS trilho 4 pt, thumb 28 pt branco; hit 44 pt | Preenchido em acento, restante `systemGray4` |
| **Stepper** | macOS ~19×22 px, raio 4 px | Par +/−; combine com text field |
| **Text field** | macOS 21–22 px raio ~6 px; iOS 44 pt raio ~10 px | Fundo `tertiarySystemFill`; placeholder `tertiaryLabel` |
| **Search** | `magnifyingglass` à esquerda, `xmark.circle.fill` p/ limpar | `.searchable()` integra à nav/toolbar |

### 8.3 Chrome, listas & superfícies

- **Toolbar (macOS):** material `.toolbar`, ~52 px, itens borderless 28×28 px (SF Symbol 16–18 pt), separador inferior só ao rolar. **iOS:** nav bar 44 pt (large title → ~96 pt); ícones 22–24 pt. Máx. 3–5 ícones; excedente → menu overflow (`•••`).
- **Sidebar:** material `.sidebar`, largura 200–260 px, linha 24–28 px, seleção em pílula (raio ~6–7 px) na cor de acento. Section headers 11–13 pt `secondaryLabel`. Multicolor de ícone permitido aqui.
- **Listas iOS:** Plain (`systemBackground`) ou Inset Grouped (`systemGroupedBackground` + célula `secondarySystemGroupedBackground`, bloco raio **10 px**, margem 16–20 px). Linha ≥ 44 pt; separador 0,5 px com inset 16–20 px. **Tabelas macOS:** linha 24 px (28 com ícone), estilos `.inset`/`.bordered`/`.plain`, seleção na cor de acento.
- **Sheets/Popovers/Menus:** sheet raio 10 px topo + grabber 36×5 px + detents; popover com beak ~15×7 px + material `.popover`; menu macOS raio ~6 px material `.menu`; alert raio 14 px (iOS), botões empilhados (2+) ou lado a lado (2), destrutiva em vermelho, default Semibold. Nunca aninhar sheet sobre sheet no macOS.

### 8.4 Cards & Badges
- **Card:** raio 10–16 px (iOS) / 8–10 px (macOS), fundo `secondarySystemGroupedBackground`, sombra discreta (y 1–2, blur 6–10, preto @ 6–10%). Prefira elevação por cor/material a sombra pesada.
- **Badges:** notification badge em cápsula `systemRed`, texto 12–13 pt bold branco; status dot 8–10 px; tag/chip capsule com fundo tint @ 15%, 11–13 pt, padding 8×4 px. API `.badge(count)`.

### 8.5 Cheat-sheet de chrome nativo
1. **Materiais primeiro** (toolbar/sidebar/popover/menu translúcidos) — nunca cor sólida chapada.
2. **Raios:** 6 px pequenos → 8 px grandes/cards → 10–11 px popovers → capsule para tags. Sempre `.continuous`.
3. **Exatamente 1** `.borderedProminent` por tela.
4. Um `controlSize` por região (toolbar `.small`, conteúdo `.regular`, CTA `.large`).
5. Ícones SF Symbols; monocromático em toolbars, multicolor só em sidebar/listas.
6. Base de espaçamento 8 pt.

---

## 9. Iconografia

### 9.1 SF Symbols — o sistema de ícones

6.000+ símbolos vetoriais desenhados para casar pixel-a-pixel com a família SF. Regra de ouro: **um símbolo é "uma letra" da fonte** — mesmo peso, mesma métrica, mesmo baseline do texto adjacente.

- **Peso:** iguale ao peso do texto ao lado. UI de produtividade: Regular (400) inline em listas; **Semibold (600) em toolbars/tab bars** (presença sem peso excessivo).
- **Tamanho:** point size do símbolo = point size do texto. Escalas `.small` (~0.9×), `.medium` (1.0×, default), `.large` (~1.1×) relativas à cap-height. Ícones "sozinhos" em toolbar: alvo 44×44 pt, glifo ~22–26 pt.
- **Variantes semânticas** em vez de trocar de ícone: `.fill`, `.circle`, `.circle.fill`, `.slash`, `.badge.plus`. **Preenchido = ativo/selecionado; outline = inativo** (regra fixa em tab bar).
- **Animações:** `.bounce` (confirmação), `.pulse` (atenção), `.variableColor` (progresso), `.replace` (troca de estado). Spring ~response 0.3–0.5 s, damping 0.7.

**Modos de renderização** — restrição é a regra: **~90% da UI em Monochrome** no tint de acento.

| Modo | Cores | Uso |
|---|---|---|
| **Monochrome** | 1 cor (tint) | Padrão absoluto — barras, listas, botões |
| **Hierarchical** | 1 matiz, opacidades 100% / 55% / 25% | Profundidade sem policromia |
| **Palette** | 2–3 cores explícitas | Codificar **uma** dimensão semântica (ex.: prioridade) |
| **Multicolor** | cores intrínsecas | Semântica universal (lixeira, coração, estrela) |

Nunca colora ícones "para enfeitar". Use as cores de sistema (§2.1) para tint/palette.

### 9.2 Ícones de aplicativo (App Icons)

- **Forma:** **superelipse (squircle)**, `|x/a|ⁿ + |y/a|ⁿ = 1` com n ≈ 5; raio de canto ≈ **0.2237 × lado** (corner smoothing 60% no Figma). Na web, aproxime com máscara SVG (`clipPath`) — **`border-radius` puro produz o "rounded rect" errado**, denunciável ao lado de ícones nativos.
- **Grade:** desenhe sobre keyline grid (círculos/retângulos concêntricos, proporção áurea φ ≈ 1.618); ~10% de respiro nas bordas. Forneça o **master 1024×1024 quadrado, sem cantos** — o sistema aplica a máscara (cantos pré-arredondados = ícone duplo-arredondado/rejeitado).
- **Profundidade (Icon Composer / Liquid Glass):** camadas `background → midground → foreground`; o sistema gera parallax, sombra e realce especular. Uma única fonte de luz implícita (topo), sem sombras pintadas. Entregue **4 aparências**: Light, Dark, Clear, Tinted (a Tinted deve permanecer legível reduzida a matiz + luminância).
- **Arte:** um conceito por ícone; sem texto/foto/screenshot; gradiente de 2 paradas do mesmo matiz (variação de luminância ~15–25%). Legível a **29 pt**.

**Tamanhos de export (iOS):** App Store master 1024 pt; Home 60 pt (@2x 120 / @3x 180); Spotlight 40 pt; Settings 29 pt.

### 9.3 Rigor óptico
- **Correção óptica, não matemática:** círculos parecem menores que quadrados de mesmo tamanho → cresça-os ~2–4%. Ícones triangulares (play, share) exigem deslocamento óptico do centro.
- Alinhamento à **cap-height**, não à bounding box. Stroke de ícone custom casa com o peso do SF Symbol adjacente (~1.5–1.75 pt para parear Regular a 17 pt).

---

## 10. Voz & Marca

A escrita é parte da identidade tanto quanto o ícone. Três atributos:

| Atributo | Regra | Faça | Não faça |
|---|---|---|---|
| **Conciso** | Frase curta, uma ideia; corte supérfluos | "Sincronizado." | "Seus dados foram sincronizados com sucesso agora." |
| **Confiante** | Voz ativa, presente, sem hedging | "Toque para começar." | "Você poderia, se quiser, tentar tocar aqui." |
| **Humano** | 2ª pessoa, caloroso, sem jargão | "Tudo em dia." | "Fila de sincronização com 0 itens pendentes." |

**Regras de UX writing:**
- **Botões = verbo no imperativo:** "Adicionar tarefa", "Concluir", "Arquivar" — nunca "OK"/"Enviar" genérico.
- **Sentence case** em botões, títulos e labels — não Title Case, não CAPS.
- **Sem "!"** — a confiança vem do conteúdo, não da pontuação.
- **Erros orientam a solução:** "Não foi possível salvar. Verifique sua conexão." em vez de "Erro 500".
- **Estados vazios convidam à ação:** "Nenhuma tarefa ainda. Crie a primeira." (declaração + próximo passo).
- **PT-BR:** prefira "você" (não "tu"); evite gerundismo ("vamos estar sincronizando" → "sincronizando"). Mantenha um glossário de termos (ex.: sempre "projeto", nunca alternar com "quadro"/"board").

**Princípios de identidade da marca:** Simplicidade (um foco/ação primária por tela; ícone reconhecível a 11 pt); Precisão (rigor óptico, grid de 8 pt, alvos ≥ 44 pt); Honestidade material (o material se comporta como o real — vidro refrata, sombra cai, profundidade vem de luz, não de contorno pintado; estado desabilitado *parece* inerte, opacity ~0.3–0.4).

---

## 11. Tokens (resumo)

Bloco de variáveis CSS propondo os tokens da marca. Cores de UI como `rgba` (adaptam a qualquer fundo/material); acento derivável para hover/pressed por luminosidade. Dark mode via `@media (prefers-color-scheme: dark)`.

```css
:root {
  /* ---- Cor: acento & funcionais ---- */
  --color-accent:            #007AFF;   /* systemBlue */
  --color-accent-hc:         #0040DD;   /* prefers-contrast: more */
  --color-success:           #34C759;   /* systemGreen */
  --color-warning:           #FF9500;   /* systemOrange */
  --color-danger:            #FF3B30;   /* systemRed */
  --color-info:              #007AFF;
  --color-flag:              #FFCC00;   /* systemYellow */

  /* ---- Cor: labels (hierarquia por opacidade) ---- */
  --color-label:             rgba(0,0,0,1);
  --color-label-secondary:   rgba(60,60,67,.60);
  --color-label-tertiary:    rgba(60,60,67,.30);
  --color-label-quaternary:  rgba(60,60,67,.18);
  --color-placeholder:       rgba(60,60,67,.30);

  /* ---- Cor: fills ---- */
  --color-fill:              rgba(120,120,128,.20);
  --color-fill-secondary:    rgba(120,120,128,.16);
  --color-fill-tertiary:     rgba(118,118,128,.12);
  --color-fill-quaternary:   rgba(116,116,128,.08);

  /* ---- Cor: backgrounds (elevação por camada) ---- */
  --color-bg:                #FFFFFF;
  --color-bg-secondary:      #F2F2F7;
  --color-bg-tertiary:       #FFFFFF;
  --color-bg-grouped:        #F2F2F7;
  --color-bg-grouped-elev:   #FFFFFF;

  /* ---- Cor: separadores ---- */
  --color-separator:         rgba(60,60,67,.29);
  --color-separator-opaque:  #C6C6C8;

  /* ---- Tipografia ---- */
  --font-sans:  -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, "Helvetica Neue", Arial, sans-serif;
  --font-mono:  ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace;
  --font-serif: ui-serif, "New York", Georgia, "Times New Roman", serif;

  --text-large-title:  2.125rem; --lh-large-title: 41px; --ls-large-title:  .0032em;
  --text-title-1:      1.75rem;  --lh-title-1:     34px; --ls-title-1:      .0046em;
  --text-title-2:      1.375rem; --lh-title-2:     28px; --ls-title-2:      .0073em;
  --text-title-3:      1.25rem;  --lh-title-3:     25px; --ls-title-3:      .0095em;
  --text-headline:     1.0625rem;--lh-headline:    22px; --ls-headline:    -.0253em; --weight-headline: 600;
  --text-body:         1.0625rem;--lh-body:        22px; --ls-body:        -.0253em;
  --text-callout:      1rem;     --lh-callout:     21px; --ls-callout:     -.0194em;
  --text-subheadline:  .9375rem; --lh-subheadline: 20px; --ls-subheadline: -.0153em;
  --text-footnote:     .8125rem; --lh-footnote:    18px; --ls-footnote:    -.0062em;
  --text-caption-1:    .75rem;   --lh-caption-1:   16px; --ls-caption-1:    0;
  --text-caption-2:    .6875rem; --lh-caption-2:   13px; --ls-caption-2:    .0055em;

  --weight-regular: 400; --weight-medium: 500; --weight-semibold: 600; --weight-bold: 700;

  /* ---- Espaçamento (grade 8 pt / sub 4 pt) ---- */
  --space-2: 2px;  --space-4: 4px;  --space-8: 8px;  --space-12: 12px;
  --space-16: 16px; --space-20: 20px; --space-24: 24px; --space-32: 32px;
  --space-40: 40px; --space-48: 48px; --space-64: 64px;
  --margin-content: 16px;   /* iOS */
  --margin-window:  20px;   /* macOS */
  --hit-target:     44px;

  /* ---- Raios (sempre curvatura contínua) ---- */
  --radius-xs:    6px;   /* controles pequenos */
  --radius-sm:    8px;   /* botões, campos */
  --radius-md:    10px;  /* listas inset, sheets */
  --radius-lg:    14px;  /* cards, alerts */
  --radius-xl:    22px;  /* widgets */
  --radius-pill:  9999px;/* capsule = height/2 */

  /* ---- Materiais (backdrop-filter) ---- */
  --material-ultrathin: saturate(180%) blur(20px);
  --material-thin:      saturate(180%) blur(20px);
  --material-regular:   saturate(180%) blur(24px);
  --material-thick:     saturate(180%) blur(30px);
  --material-chrome:    saturate(160%) blur(30px);
  --tint-regular:       rgba(242,242,242,.80);
  --tint-chrome:        rgba(255,255,255,.97);

  /* ---- Sombras (difusas) ---- */
  --shadow-resting: 0 1px 2px rgba(0,0,0,.10);
  --shadow-raised:  0 1px 2px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.10);
  --shadow-overlay: 0 2px 6px rgba(0,0,0,.12), 0 10px 30px rgba(0,0,0,.18);
  --shadow-modal:   0 8px 24px rgba(0,0,0,.16), 0 20px 60px rgba(0,0,0,.28);
  --hairline-glass: inset 0 0.5px 0 rgba(255,255,255,.5);

  /* ---- Motion ---- */
  --dur-instant: .15s; --dur-fast: .25s; --dur-base: .35s; --dur-modal: .5s;
  --ease-out:    cubic-bezier(0, 0, .58, 1);     /* entradas */
  --ease-in:     cubic-bezier(.42, 0, 1, 1);     /* saídas */
  --ease-in-out: cubic-bezier(.42, 0, .58, 1);   /* mover on-screen */
  --spring-snappy: linear(0, .5, .9, 1.02, 1);   /* aprox. spring bounce .15 */
  --press-scale: .96;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-accent:           #0A84FF;
    --color-accent-hc:        #409CFF;
    --color-info:             #0A84FF;
    --color-success:          #30D158;
    --color-warning:          #FF9F0A;
    --color-danger:           #FF453A;
    --color-flag:             #FFD60A;

    --color-label:            rgba(255,255,255,1);
    --color-label-secondary:  rgba(235,235,245,.60);
    --color-label-tertiary:   rgba(235,235,245,.30);
    --color-label-quaternary: rgba(235,235,245,.18);
    --color-placeholder:      rgba(235,235,245,.30);

    --color-fill:             rgba(120,120,128,.36);
    --color-fill-secondary:   rgba(120,120,128,.32);
    --color-fill-tertiary:    rgba(118,118,128,.24);
    --color-fill-quaternary:  rgba(118,118,128,.18);

    --color-bg:               #000000;
    --color-bg-secondary:     #1C1C1E;
    --color-bg-tertiary:      #2C2C2E;
    --color-bg-grouped:       #000000;
    --color-bg-grouped-elev:  #1C1C1E;

    --color-separator:        rgba(84,84,88,.60);
    --color-separator-opaque: #38383A;

    --tint-regular:           rgba(37,37,37,.82);
    --tint-chrome:            rgba(30,30,30,.97);

    --shadow-overlay: 0 2px 6px rgba(0,0,0,.24), 0 10px 30px rgba(0,0,0,.40);
    --shadow-modal:   0 8px 24px rgba(0,0,0,.32), 0 20px 60px rgba(0,0,0,.50);
    --hairline-glass: inset 0 0.5px 0 rgba(255,255,255,.10);
  }
}

@media (prefers-contrast: more) {
  :root { --color-accent: var(--color-accent-hc); }
}

@media (prefers-reduced-motion: reduce) {
  :root { --dur-instant: .2s; --dur-fast: .2s; --dur-base: .2s; --dur-modal: .2s;
          --press-scale: 1; }
}
```

**Regras de uso dos tokens:** consuma sempre os semânticos (`--color-label-*`, `--color-bg-*`, `--color-fill-*`) para UI; reserve hex fixo para marca/ilustração. Derive estados de acento por luminosidade (±8–12% L). Sobre material, use `--color-label-*`/`--color-fill-*` (vibrancy), nunca sólido. Eleve por camada de background, não por sombra. Aplique `letter-spacing` em `em` para acompanhar o `font-size`.
