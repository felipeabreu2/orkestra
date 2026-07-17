# Análise 360° — Maestri → Orkestra (2026-07-15)

Mapeamento 360° de cada funcionalidade documentada no produto de referência **Maestri** (themaestri.app/pt-br/docs), cruzada com o **código real do Orkestra**. Um documento por funcionalidade. Cada doc segue a mesma estrutura de 7 seções:

1. **Visão geral** — o que é, para que serve
2. **Como funciona** — UX, fluxo, atalhos, comportamentos
3. **Pontos interessantes / diferenciais**
4. **Como seria o backend** — arquitetura técnica provável
5. **Estado atual no Orkestra** — o que já existe, com caminhos de arquivo reais
6. **Melhorias sugeridas para o Orkestra** — concretas, priorizadas por valor × esforço
7. **Referência** — URL da doc oficial

> Para o mapa de decisões consolidado (o que aplicar / refinar / descartar), veja [`../maestri-mapa-funcionalidades-2026-07-11.md`](../maestri-mapa-funcionalidades-2026-07-11.md). Esta pasta é o aprofundamento funcionalidade a funcionalidade.

> 🎯 **Síntese estratégica:** [`ALEM-DO-MAESTRI-oportunidades.md`](ALEM-DO-MAESTRI-oportunidades.md) — onde o Orkestra já supera o Maestri e as maiores apostas de valor para ir **além** da paridade (atende à diretriz do usuário de "criar algo muito além e mais avançado, gerando valor").

## Índice

| # | Funcionalidade | Doc | Status no Orkestra | Achado-chave / melhoria de topo |
|---|----------------|-----|--------------------|---------------------------------|
| 1 | O Canvas | [canvas.md](canvas.md) | 🟢 Paridade alta | React Flow + Zustand; faltam snap magnético mosaico, navegação por conexão (`→/←`), `⇧T` grade, renomear grupo por duplo-clique e tela de Configurações |
| 2 | Batuta Search | [batuta-search.md](batuta-search.md) | 🟡 Núcleo presente | Busca é substring simples — tornar `rankItems` **fuzzy / multi-palavra / sem acento** é o maior retorno (função pura já testada) |
| 3 | Terminais e Agentes | [terminais-agentes.md](terminais-agentes.md) | 🟢 Paridade forte (PTY) | **Gap crítico:** papéis são só visuais; no Maestri o papel **injeta instruções** (CLAUDE.md/`role.json`). P1 = papel com injeção |
| 4 | Notas | [notas.md](notas.md) | 🟡 Modelo diferente | Orkestra usa TipTap→HTML no JSON; Maestri usa `.md` real em disco. Tem find-replace e cores próprios. Gaps: toggle raw, arrastar `.md`, nome/local, cadeia navegável |
| 5 | Conexões | [conexoes.md](conexoes.md) | 🟢 Paridade visual alta | Cordas/circuito, badge, ponto viajante. Gaps: cadeia de notas resolve só 1 salto (falta **travessia transitiva**), sem popover de inspeção |
| 6 | Modo Maestro | [modo-maestro.md](modo-maestro.md) | 🟡 Encanamento pronto, produto não | `orq recruit/connect/dismiss` funcionam ponta a ponta; falta toggle/gating "Maestro", onboarding omite verbos de gerência, `recruit` não posiciona/conecta |
| 7 | Árvore de Arquivos | [arvore-arquivos.md](arvore-arquivos.md) | 🟡 Fundação somente-leitura | Lista + git status + preview. Gaps: sem editor, sem git de escrita, sem fs-watch, sem busca. **Top: arrastar arquivo→terminal**. Bug real anotado: `relativeToRoot` |
| 8 | Portais | [portais.md](portais.md) | 🟢 Implementação sólida | `<webview>` + partições isoladas/compartilhadas + `orq portal` + hardening. Gaps: screenshot, console/rede, back/reload/scroll dedicados, agente criar portais |
| 9 | Andares (Floors) | [andares-floors.md](andares-floors.md) | ⚫ Removido (Fase 16) | Implementado na Fase 8, erradicado no commit `42d4db5`. Reintroduzir só se orquestração paralela isolada virar prioridade |
| 10 | Solução de Problemas | [solucao-problemas.md](solucao-problemas.md) | 🟡 Resiliência baixa forte, UX ausente | Base robusta (ErrorBoundary, persistência atômica, re-attach PTY). Gaps: reset de foco, limite de memória por terminal, hibernação de projeto, export de diagnóstico |
| 11 | Ombro | [ombro.md](ombro.md) | 🟡 Metade sem-LLM já existe | Detecção de ociosidade + notificação nativa funcionam; falta a camada LLM (resumo/Q&A/notas). Viável sem LLM: **notificação clicável** que foca o terminal |
| 12 | SSH Remoto | [ssh-remoto.md](ssh-remoto.md) | 🟢 Transporte implementado (Fase 27) | PTY rodando `ssh` com validação anti-injeção. Gap deliberado: sem túnel reverso, script helper, drag-drop pelo túnel |
| 13 | Rotinas | [rotinas.md](rotinas.md) | ⚫ Removido (Fase 16) | Construída na Fase 10, erradicada no commit `1ed4dea`. Sem vestígios em `src` hoje |

**Legenda de status:** 🟢 paridade alta · 🟡 parcial / modelo diferente / encanamento pronto · ⚫ removido por decisão.

## Padrões que emergiram da análise

- **O encanamento do Orkestra costuma estar à frente da sua camada de produto/UX.** Maestro, Ombro e Conexões têm a infraestrutura (servidor de orquestração, `AgentBus`, detecção de ociosidade, cordas tipadas) pronta; o que falta é expor isso como funcionalidade visível ao usuário/agente.
- **Ganhos de maior valor × menor esforço reaproveitam infra existente:** notificação clicável (Ombro), fuzzy no `rankItems` (Batuta), arrastar arquivo→terminal (Árvore), papel que injeta instruções (Terminais), travessia transitiva da cadeia de notas (Conexões).
- **Duas features foram removidas deliberadamente** (Floors e Rotinas, ambas na Fase 16) — os docs registram como reintroduzir caso a prioridade mude.
- **Gaps grandes e estruturais** (fora de MVP): editor de código embutido na Árvore, persistir notas como `.md` em disco, túnel reverso SSH, camada LLM do Ombro.

## Metodologia

Cada doc foi produzido por um subagente dedicado que: (1) transcreveu integralmente a doc oficial do Maestri via fetch, (2) cruzou com o código real do Orkestra por grep/leitura direta, e (3) escreveu a análise citando caminhos de arquivo reais. Os documentos passaram por uma auditoria de fidelidade factual em contexto limpo.
