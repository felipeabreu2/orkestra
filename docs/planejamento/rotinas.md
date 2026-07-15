# Plano — Rotinas (cron)  ·  ⚫ REMOVIDO · reintrodução sob demanda

> **Origem:** `docs/analise-maestri-360/rotinas.md` · **Status:** ⚫ Removido por completo na **Fase 16** (commit `1ed4dea`) · **Onda:** — (fora do roteiro ativo)

## Veredito

**Não reintroduzir proativamente.** Rotinas foi construída (Fase 10, testes verdes), saiu da UI (Fase 15) e foi erradicada do backend (Fase 16) — 17 arquivos, ~1202 deleções. A remoção foi coerente com a virada para **múltiplos projetos**. Parte do valor (monitoramento) já é coberta pela detecção de ociosidade + notificação de atenção — ver [ombro.md](ombro.md). Este documento guia uma reintrodução **bem-feita** caso a demanda volte.

## Gatilho de reintrodução (quando reconsiderar)

Reintroduzir **apenas** sob demanda concreta do usuário, tipicamente um destes casos de uso:
- **Scraping/checagem agendada via portais** (agente abre portal → extrai dados → escreve em nota, no piloto automático) — ver [portais.md](portais.md).
- **Testes contínuos** ou **ping de status** recorrentes que a notificação de atenção não cobre.

## Alternativas de menor esforço (capturam parte do valor SEM cron)

Preferir estas antes do gerenciador completo:
1. **Gatilhos por evento (já existe base):** notificar "agente terminou / travou" cobre boa parte do monitoramento sem scheduler. Ver [ombro.md](ombro.md) — detector "travou vs terminou".
2. **"Repetir prompt a cada N" (mini-rotina por terminal):** um atalho "reenviar este prompt a cada X min até eu parar", com fração da superfície de UI de um gerenciador. **Bom candidato** se a demanda por recorrência voltar.

## Se reintroduzir Rotinas completas — reusar o que já existiu

O plano original está em `docs/superpowers/plans/2026-07-10-fase-10-rotinas.md`; o commit `1ed4dea` pode ser consultado/revertido como base. O desenho já era sólido e testado:
- **Matcher cron puro** `cronMatches(expr, d): boolean` — função pura, `now` injetável, testável sem timers. Suporta `* N */N A-B A,B`, hora local, `dow` 0 e 7 = domingo.
- **`RoutineScheduler`** no main: `Map<id, Routine>`, CRUD, `tick()` a cada 30s com **dedupe por minuto**, isolamento de erro por rotina, `start()/stop()` no ciclo de vida do app.
- **`onFire`** reusa o `AgentBus` (resolução de terminal por nome + injeção de texto) — o scheduler **não** fala direto com `node-pty`.
- **Persistência atômica** (`~/.orkestra/routines.json`, tmp+rename), guardas defensivas na carga.
- Superfícies: IPC `routine:*`, `RoutinesPanel`, `orq routine list|add|remove` + rotas HTTP atrás do gate de token.

### Requisito inegociável na reintrodução

**Escopar rotinas por projeto** — uma rotina pertence a um projeto e só dispara para terminais daquele projeto. Sem isso, reintroduz o risco de disparo cross-project. Ver [[incidente-corrupcao-cross-project]]. As rotas HTTP de rotina ficam **depois** do gate de token + escopo `x-orkestra-project` (`409` no mismatch), como as demais.

## Priorização (valor × esforço)

| Item | Valor | Esforço | Recomendação |
|---|---|---|---|
| Notificação "terminou/travou" (base existe) | Alto | Baixo | Já no roteiro via [ombro.md](ombro.md) — cobre monitoramento sem cron |
| "Repetir prompt a cada N" (mini-rotina) | Médio | Baixo | Candidato se a recorrência voltar |
| Rotinas completas, escopadas por projeto | Médio-Alto (nichos) | Médio (reusa código, exige escopo + UI) | **Só sob demanda concreta** |
| Encadeamento multi-agente (grafo, não só `&&`) | Alto (potencial) | Alto | Não agora — só se virar produto de workflow |

## Referências

- Plano original preservado: `docs/superpowers/plans/2026-07-10-fase-10-rotinas.md`
- Commits: construção `64f82b9`/`d4b0020`/`92da661` (Fase 10); remoção UI `fc26580` (Fase 15); remoção total `1ed4dea` (Fase 16)
- Decisão registrada: `docs/maestri-mapa-funcionalidades-2026-07-11.md`
- Análise completa: `docs/analise-maestri-360/rotinas.md`
