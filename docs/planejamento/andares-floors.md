# Plano — Andares (Floors)  ·  ⚫ REMOVIDO · reintrodução sob demanda

> **Origem:** `docs/analise-maestri-360/andares-floors.md` · **Status:** ⚫ Removido por completo na **Fase 16** (commit `42d4db5`) · **Onda:** — (fora do roteiro ativo)

## Veredito

**Não reintroduzir proativamente.** A feature foi implementada (Fase 8) e depois erradicada por decisão do usuário — 20 arquivos, 672 deleções, 18 testes removidos. Hoje o isolamento no Orkestra é **por projeto** (`src/main/projects/ProjectManager.ts`, `cwd` por projeto), sem noção de branch/worktree. Enquanto isso atender, Floors segue fora de escopo. Este documento existe para que, **se** a orquestração de múltiplos agentes em paralelo virar prioridade concreta, a reintrodução comece do lugar certo — não do zero.

## Gatilho de reintrodução (quando reconsiderar)

Reintroduzir **apenas** quando ambos forem verdade:
1. Orquestração de **N agentes em paralelo no mesmo repo** (cada um na sua branch, sem colisão de arquivos) virar caso de uso real e recorrente — é aí que Andares deixa de ser "conveniência git" e vira infraestrutura essencial (ver [modo-maestro.md](modo-maestro.md) §4.1, template de esquadrão).
2. O isolamento por projeto atual passar a ser insuficiente (agentes precisando divergir a working tree do **mesmo** projeto simultaneamente).

## Se reintroduzir — abordagem faseada (reusa a Fase 8)

O plano original está preservado em `docs/superpowers/plans/2026-07-10-fase-8-floors-worktree.md`. Reintroduzir é, em boa parte, "des-reverter com melhorias". Mecanismo: **`git worktree`** (multiplataforma — vantagem sobre a versão APFS/macOS-only do Maestri), não clone APFS.

| Fase | Incremento | Valor | Esforço | Prioridade |
|---|---|---|---|---|
| MVP | Ressuscitar `FloorManager` + IPC `floor:*` + `cwd`-por-andar + painel mínimo (create/land/remove). Sem hooks, sem clone de layout, sem prévia de merge. | Alto | **Baixo** (código já existiu e tinha testes) | 1ª |
| Hooks | setup/run/teardown + env vars com **prefixo próprio** (`ORKESTRA_FLOOR_PATH` etc., sem marca). Resolve o `node_modules` por worktree; torna cada andar reproduzível. | Alto | Médio | 2ª |
| Prévia de land | diff-stat + detecção de conflito **antes** do merge + guard de "working tree limpa". | Médio-Alto | Médio | 3ª |
| Andar ↔ nó de agente | Ligar um andar a um nó de agente no canvas ("este agente trabalha neste andar") e visualizar quem está em qual andar. **É onde o Orkestra vai além do Maestri.** | Alto | Médio-Alto | 4ª |
| Metáfora 3D + clone de layout | Empilhamento visual e clonar layout do Térreo. Polish. | Baixo-Médio | Médio | 5ª |

## Invariantes de segurança (obrigatórios — do plano da Fase 8)

Operações git destrutivas partindo de entrada do renderer exigem rigor:
- Todo `worktreePath` é **sempre** `<floorsDir>/<id>` (UUID) — nunca caminho arbitrário do renderer.
- Toda branch de andar tem prefixo `orkestra/floor-`.
- `git` só via `execFile('git', argsArray, {cwd})` — **nunca** `exec`/shell.
- `create` = `git worktree add`; `remove` = `git worktree remove`; `land` = `git merge` **sem** `--force`/`-X`/`reset`/`rebase`/`push`. Conflito é **reportado, não resolvido**.
- Validar que `repoPath` é repo git antes de qualquer operação.
- **NOVO requisito (pós-incidente cross-project):** escopar andares por projeto — um andar pertence a um projeto e nunca cruza para outro. Ver [[incidente-corrupcao-cross-project]].

## Referências

- Plano original preservado: `docs/superpowers/plans/2026-07-10-fase-8-floors-worktree.md`
- Commits: implementação `9c69129`/`c28df38`/`a1de678`/`01ffd24` (Fase 8); remoção UI `fc26580` (Fase 15); remoção total `42d4db5` (Fase 16)
- Decisão registrada: `docs/maestri-mapa-funcionalidades-2026-07-11.md`
- Análise completa: `docs/analise-maestri-360/andares-floors.md`
