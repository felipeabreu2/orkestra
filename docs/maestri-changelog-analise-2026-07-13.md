# Análise do changelog do Maestri × Orkestra (2026-07-13)

Leitura do changelog público do produto de referência (v0.13 → v0.32) para achar o que ainda
vale trazer ao Orkestra. Descrito com palavras próprias (capacidades genéricas, implementação
nossa). Exclui o que removemos por decisão do usuário (Floors, Rotinas) e o que é específico do
stack deles (Swift/Metal/SwiftTerm — nós usamos xterm.js).

## Onde o Orkestra JÁ está em dia
Fundamentos + Ondas 1–4: terminais no canvas, notas markdown, portais (sessão isolada/linkável),
árvore de arquivos com git status + preview, conexões tipadas, minimap/snap/grupos/alinhar,
indicador de atenção + notificação, command palette contextual + perguntar-ao-agente, papéis
ricos com badge, SSH remoto, tema claro/escuro, modal Novo Terminal, barra superior, drag-drop
de arquivos p/ o terminal, terminais que sobrevivem à troca de projeto. `orq` = 8 comandos.

## Gaps que valem trazer (priorizados)

### 🔷 Grandes (ondas dedicadas)
| # | Recurso (Maestri) | Estado no Orkestra | Valor |
|---|---|---|---|
| G1 | **Editor de código no canvas** — editar arquivos (não só preview), syntax highlight, find/replace, ir-para-definição, abas, **enviar seleção ao agente** | Só preview read-only na árvore | Alto — vira um mini-IDE |
| G2 | **Integração Git** — diff viewer no canvas, stage/unstage/discard por arquivo/linha, commit/push/pull, branch selector, **"pedir revisão ao agente"** (passa o diff) | Só git *status* (badges) read-only | Alto — coração do fluxo de código |
| G3 | **Busca de arquivos + conteúdo** — fuzzy na árvore (⌘P num nó) e grep dentro dos arquivos (`>termo`) | Palette busca só nós/ações | Médio-alto |

### 🟢 Rápidos (alto valor × baixo esforço) — **R1–R6 ENTREGUES (2026-07-13)**
| # | Recurso | Status |
|---|---|---|
| R1 | **Abrir no IDE externo** (VS Code/JetBrains) — botão que abre a pasta no editor | ✅ feito — botão `</>` na Topbar; `openInEditor` tenta code/cursor/subl/zed/JetBrains, cai no gerenciador de arquivos |
| R2 | **`orq ask --raw`** — envia bytes brutos p/ controlar TUIs/pagers | ✅ feito — `escapes.ts` (\\x03, \\e[B…) + `AgentBus.writeRaw` + `askRaw` |
| R3 | **`orq ask --batch`** — mesmo prompt a vários agentes de uma vez | ✅ feito — lista CSV, N POSTs /ask no cliente |
| R4 | **Add-menu no canvas** — botão direito no vazio → criar nó no cursor | ✅ feito — `CanvasContextMenu`; menu do nó tb faz R6 + excluir |
| R5 | **Estilo de conexão "circuito"** — trilhos ortogonais (90°) | ✅ feito — `getSmoothStepPath`; toggle no palette; persistido |
| R6 | **Remover todas as conexões de um nó** | ✅ feito — `removeEdgesForNode`; palette + menu de contexto |
| R7 | **Temas de terminal** — esquemas de cor do xterm (claro/escuro/importar) | ⬜ pendente — xterm theme API |
| R8 | **User-agent por portal** — trocar o UA (mobile/desktop) p/ testar responsivo | ⬜ pendente — webview.setUserAgent |
| R9 | **Lista "precisa de atenção"** — painel/contagem dos terminais ociosos (além do Shift+A) | ⬜ pendente — extensão da Fase 20 |
| R10 | **Árvore: ordenar + miniaturas** — ordenar por nome/tipo/data + thumbnails | ⬜ pendente — refinamento do FileTreeNode |

### ⚪ Refinamentos menores (nice-to-have)
Colocação inteligente de nós criados por agente (achar espaço livre vs. empilhar); auto-scroll ao
arrastar nó pra borda; estilos de seleção; fundo do canvas (grid/liso/transparente); backup/restore
de snapshots; bracketed-paste (colar caminho/screenshot como attachment); navegar cadeia de notas
com atalho; descarregar terminais p/ liberar memória; papéis compartilháveis (role.json).

## Recomendação de ordem
1. **Onda rápida** (R1–R6): muito ganho por pouco esforço, várias entregas visíveis.
2. **Integração Git (G2)**: o gap mais alinhado ao propósito (revisar o que o agente fez).
3. **Busca de arquivos/conteúdo (G3)** + refinamentos da árvore (R10).
4. **Editor de código (G1)**: a maior — talvez desnecessária se R1 (abrir-no-IDE) bastar ao usuário.
