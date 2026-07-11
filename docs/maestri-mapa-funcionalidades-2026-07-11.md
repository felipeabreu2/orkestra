# Maestri → Orkestra — Mapa de Funcionalidades & Layout (2026-07-11)

Mapeamento das funcionalidades e do layout documentados no produto de referência (docs oficiais), comparado com o estado atual do Orkestra, para decidir **o que aplicar**. Descrito com palavras próprias (funcionalidades/conceitos, não texto/design/marca). Legenda: ✅ já temos · 🟡 temos mais simples (refinar) · ❌ falta (gap) · 🗑️ removido por decisão do usuário.

## Tabela-resumo

| Área | Referência (o que faz) | Orkestra | Ação |
|---|---|---|---|
| **Workspaces/Projetos** | projeto = canvas+estado; múltiplos concorrentes; pasta de trabalho; sidebar com ícones, colapsável (mini-rail), atalhos, agrupamento em pastas/grupos; `CLAUDE.md`/`AGENTS.md` por projeto; "abrir no editor" | Projetos + pasta (Fases 15, 17); sidebar simples | 🟡 refinar sidebar (ícones, colapsar, atalhos, grupos); ❌ CLAUDE.md por projeto; ❌ abrir-no-editor |
| **Canvas** | canvas infinito; toolbar de ferramentas com atalhos; grupos de nós; alinhar/distribuir/auto-grade; snap (grade + vizinho); **minimap**; navegação por conexões (setas); "pular p/ agente que precisa de atenção" | Canvas + toolbar de criação (Fases 2, 13) | 🟡 atalhos de ferramenta; ❌ minimap, grupos, alinhar, snap, navegação por conexões, pular-p/-atenção |
| **Command palette** | fuzzy multi-palavra em TUDO; ações contextuais por nó selecionado; **modo "perguntar" a um agente com preview do stream**; conectar/desconectar pela palette | Cmd+K busca nós+ações (Fase 12) | 🟡 ações contextuais por nó; ❌ modo perguntar/observar agente; ❌ conectar via palette |
| **Terminais & Agentes** | shell+agente; **papel** (nome+badge colorido+instruções, papéis prontos Leader/Dev/Reviewer/Tester, auto-detect `role.json`, subdir c/ CLAUDE.md próprio); **indicador de atenção quando o agente fica ocioso + notificação do SO**; ícones; temas; `orq ... --raw` (teclas brutas p/ TUIs) | Terminais + presets + papel editável + comunicação (Fases 1,6,7); **detecção de ociosidade** (Fase 14) | 🟡 papéis ricos (badge/instruções/prontos); ❌ **indicador de atenção + notificação** (viável c/ a detecção de ociosidade que já temos!); ❌ ícones, temas, `--raw` |
| **Modo Maestro** | recruit/connect/dismiss; **reatribuir papel mid-task**; recruit c/ modelo específico por papel; coordenação via cadeia de notas; verbos só-maestro | recruit/connect/dismiss (Fase 7) | 🟡 reatribuir papel; modelo por papel; cadeia de notas |
| **Notas** | **markdown com preview + imagens**; raw/formatted; arrastar `.md` do Finder; nome/caminho custom; **cadeia de notas (nota↔nota)** | notas texto editável + orq note (Fases 4,6) | 🟡 markdown+preview, imagens, raw toggle; ❌ arrastar .md; ❌ cadeia de notas |
| **Conexões** | **tipadas** (terminal↔terminal habilita mensagens; terminal↔nota; terminal↔portal; nota↔nota=cadeia); **badge c/ popover**; estilo **corda vs. circuito** | edges simples (Fase 4) | 🟡 tipos + badge/popover + estilo de traçado |
| **Árvore de Arquivos** | ❌ **nó explorador de arquivos**: modos lista/ícones/diff/grafo-git; **arrastar arquivo→terminal (contexto) ou →canvas (preview)**; editor de código embutido; git-aware (branch/commit/push/pull) | — | ❌ **GAP CENTRAL** — implementar por ondas (começar: navegar+abrir+status git) |
| **Portais** | webview dirigível; **sessões isoladas por portal (multi-conta)**; portais linkáveis (compartilham sessão); agente cria portais | portal + orq portal (Fase 9) | 🟡 sessões isoladas (partition), linkar portais |
| **SSH Remoto** | ❌ **workspace/terminais numa máquina remota via túnel SSH** (usa `~/.ssh`; script helper; drag-drop de arquivo via túnel) | — | ❌ GAP (grande/complexo — transporte local vs. remoto agnóstico) |
| **Ombro (IA on-device)** | ❌ companheiro que **avisa quando um agente termina/trava**, com resumo e próxima ação; Q&A sobre estado; notas automáticas | — (copiloto cortado) | ⚠️ **a notificação "agente terminou" é VIÁVEL sem LLM** (reusa a detecção de ociosidade). Resumo/Q&A precisa de LLM (cortado). |
| **Floors** | cópias isoladas via git worktree + hooks + land/merge | 🗑️ removido (Fase 16) | — |
| **Rotinas** | prompt agendado (cron) + encadeamento | 🗑️ removido (Fase 16) | — |

## Layout de referência (síntese)
- **Palco central**: canvas infinito.
- **Sidebar esquerda**: projetos (colapsável a um trilho de ícones). ← Orkestra já tem (mais simples).
- **Toolbar superior**: ferramentas de criação de nós (terminal, nota, texto, desenho, árvore de arquivos, conexão). ← Orkestra tem (criação, sem "ferramentas" com atalhos).
- **Canto inferior-direito**: controles de zoom + **minimap**. ← Orkestra tem zoom (React Flow Controls), falta minimap.
- **Overlay global**: command palette (modal, teclado). ← Orkestra tem (Cmd+K).
- **Nós conectáveis** por cabos visuais (corda/circuito) com badges. ← Orkestra tem edges simples.

## Plano de aplicação sugerido (por valor × viabilidade)

**Onda 1 — alto valor, baixo custo (reusa o que já temos):**
1. **Indicador de atenção do agente** — o header do terminal pisca/marca quando o agente fica ocioso (silêncio), + notificação opcional do SO (Electron `Notification`); clicar foca o terminal. Reusa a detecção de ociosidade da Fase 14. **(Este é o pedaço do "Ombro" que dá pra fazer sem LLM.)**
2. **Minimap** no canto do canvas (React Flow `<MiniMap/>` — quase de graça).
3. **Notas em markdown** (render + preview + toggle raw/formatado).

**Onda 2 — refinamento de canvas/UX (layout mais próximo da referência):**
4. Atalhos de ferramenta + navegação por conexões (setas) + "pular p/ agente que precisa de atenção".
5. Grupos de nós + alinhar/distribuir + snap.
6. Sidebar de projetos refinada (ícones, colapsar, atalhos de troca).

**Onda 3 — features novas grandes:**
7. **Árvore de Arquivos** (nó explorador) — a feature central que falta. Onda própria (navegar → abrir/preview → git status → drag-drop → editor).
8. Conexões tipadas + badge/popover + estilo corda/circuito.
9. Command palette avançado (ações contextuais, modo perguntar-agente com preview).

**Onda 4 — avançado/dependente:**
10. Portais com sessão isolada/linkável.
11. Papéis ricos + modo Maestro avançado (reatribuir, modelo por papel).
12. **SSH Remoto** (grande, transporte agnóstico) — por último.

**Fora de escopo (decisão do usuário):** Floors, Rotinas (removidos); Ombro com LLM (copiloto cortado — só a notificação sem LLM entra na Onda 1).
