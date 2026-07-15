# Referência — DesignCode UI Kit (Figma) → base do design system do Orkestra

> Extração do arquivo Figma **"DesignCode UI — Figma Design UI Kit & Design System (Community)"**
> (file key `4cfK1maqtzcKGnrzeTYOBx`), feita via inspeção do painel **Variáveis** + páginas de
> foundation, em 2026-07-14. Esta é a **fonte de verdade da NOVA direção** (substitui a tentativa
> violeta/glass rejeitada e o mockup "Maven"). Valores marcados "(inferido)" não foram lidos
> diretamente — confirmar ao implementar.

## Essência da linguagem
Fintech/SaaS **premium**, construído sobre a **paleta de sistema da Apple (HIG)**. Superfícies
**monocromáticas** (preto/branco + alpha), **um** accent azul usado com parcimônia, data-viz
**colorido**, cards com **cantos generosos** e **sombras suaves de blur grande** (light) / **inner
glow** (dark). Tema **claro E escuro** de primeira classe. Gradientes roxo→violeta só como voz de
marca (headlines/decorativo).

---

## 1. Cor — primitivos (coleção `Primitive`, 120 cores)

### Escala azul (o accent)
| step | hex | | step | hex |
|---|---|---|---|---|
| blue-50  | `#E6F2FF` | | blue-500 | **`#007AFF`** (accent light) |
| blue-100 | `#B0D6FF` | | blue-600 | `#006FE8` |
| blue-200 | `#8AC2FF` | | blue-700 | `#0057B5` |
| blue-300 | `#54A6FF` | | blue-800 | `#00438C` (hover dark) |
| blue-400 | **`#3395FF`** (accent dark) | | blue-900 | `#00336B` (hover light) |

### Matizes de sistema (Apple HIG) — passo `-500`
`red #FF3B30` · `orange #FF9500` · `yellow #FFCC00` · `green #34C759` · `mint #00C7BE` ·
`teal #30B0C7` · `cyan #32ADE6` · `blue #007AFF` · `indigo #5856D6` · `purple #AF52DE`
(pink `#FF2D55` — inferido, padrão Apple). Cada matiz tem escala completa `-50…-900`.

Escala laranja (exemplo de escala completa): `50 #FFF4E6 · 100 #FFDEB0 · 200 #FFCE8A · 300 #FFB854 · 400 #FFAA33 · 500 #FF9500 · 600 #E88800 · 700 #B56A00 · 800 #8C5200 · 900 #6B3F00`.

### Neutros — NÃO há escala de cinza; tudo é preto/branco + alpha
- `white #FFFFFF` + `white-a10 … white-a90` (FFFFFF a 10%,20%,30%,40%,50%,60%,70%,80%,90%)
- `black #000000` + `black-a10 … black-a90` (idem, sobre preto)

## 2. Cor — tokens semânticos (coleção `Colors`, 17) — modos **Light | Dark**
| grupo | token | Light | Dark |
|---|---|---|---|
| **Foreground** | primary | `black` | `white` |
| | secondary | `black-a70` | `white-a70` |
| | tertiary | `black-a50` | `white-a50` |
| **Background** | primary | `white` | `black` |
| | secondary | `white-a10` | `black-a10` |
| | blue | `#F2F3FA` | `#060715` |
| | gray | `white-a90` | `#050505` |
| **Container** | background | `white-a60` | `black-a60` |
| | background-secondary | `white-a10` | `black-a10` |
| | border | `white-a50` | `white-a10` |
| | border-secondary | `white-a20` | `white-a10` |
| | divider | `black-a10` | `white-a10` |
| **Button** | foreground | `#FFFFFF` | `#FFFFFF` |
| | normal | `blue-500 #007AFF` | `blue-400 #3395FF` |
| | hover | `blue-900 #00336B` | `blue-800 #00438C` |
| | inactive | `black-a20` | `white-a20` |
| **Instance** | mode | Light | Dark |

Observação-chave: containers usam **fundo translúcido** (`white-a60`/`black-a60`) — daí o efeito de
vidro. Bordas também translúcidas.

## 3. Espaçamento & forma
Base **4px**. Primitivos `Size/N` (px): `half=2 · 1=4 · 1half=6 · 2=8 · 2half=10 · 3=12 · 4=16 · 5=20 · 6=24 · 7=28 · 8=32 · 9=36 · 10=40 · 11=44 · 12=48` (×4).

Spacing semântico é **contextual por componente** com modos Regular/Medium/Large/XL. Valores **Regular**:
- **Button**: radius `8` · padding-v `4` · padding-h `12` · gap `8` · icon `16` · altura `28`
- **Container**: radius `10` · padding `10` · padding-large `20` · gap `10`

→ **Radius: botão 8px, container 10px.**

## 4. Tipografia — **Inter** (+ variante Mono)
Regra do kit: *"For the Inter typeface, line-height 100–140%"*; headings **Semibold**, corpo **Regular/Medium**; usar só pesos que a Inter suporta (sem faux bold/italic).

| estilo | px | peso |
|---|---|---|
| Heading 1 | 60 | Semibold |
| Heading 2 | 50 | Semibold |
| Heading 3 | 40 | Semibold |
| Heading 4 | 30 | Semibold |
| Heading 5 | 24 | Semibold |
| Headline | 20 | Regular / Medium |
| Body Large | 18 | Regular / Medium |
| Body | 16 | Regular / Medium |
| Footnote | 14 | Regular / Medium |
| Caption | 13 | Regular / Medium |
| Small | 11 | Regular / Medium |
| Mobile Heading 1–4 | 40 / 30 / 28 / 24 | Semibold |
| Mono (Body Large/Body/Footnote/Caption) | 18 / 16 / 14 / 13 | — |

## 5. Sombra & blur (estilos de efeito nomeados)
`Shadow-Blur` · `Shadow-Blur-Subtle` · `Shadow-Blur-Strong` · `InnerShadow-Blur` · `Blur`.
Níveis **Elevation 1/2/3** (+ perspectiva 3D). Light = sombra suave de blur grande; **Dark = inner
glow** em vez de sombra escura. (Valores px exatos não capturados — puxar do painel Efeitos ao implementar.)

## 6. Gradientes (voz de marca / decorativo)
`Text Gradient Primary/Secondary` (roxo→violeta, p/ headlines) · `Gradients` · `Angular Gradients`
(coloridos, decorativos — esferas de glow nas telas dark).

---

## 7. Tradução para o Orkestra (a fazer)
Orkestra é um **canvas denso de terminais de agentes** (não um site de marketing). Adotar o
**sistema** (cor/tipo/forma/materiais), na **densidade do app** (texto ~13px, nós compactos):
- `--accent` = `#007AFF` (light) / `#3395FF` (dark) — quase o "Maven #335BFF".
- Superfícies = preto/branco + alpha (mapear `--bg-0/1/2`, `--border`, `--text-1/2/3` para os semânticos).
- Estados: ok=`green-500`, warn=`orange-500`, err=`red-500`; accents de papel/papéis = matizes Apple.
- Tipo = **Inter** (UI) + mono (terminal); escala reduzida (Headline 20 / Body 16 / Footnote 14 / Caption 13 / Small 11).
- Radius 8/10; sombras suaves; vidro só no cromo (topbar/sidebar/menus), conteúdo flat.
- Decisões abertas: tema a prototipar primeiro (claro vs escuro), e **quanto** do gradiente/glass trazer.
