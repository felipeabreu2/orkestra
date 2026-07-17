# Além do Maestri — Oportunidades de Valor e Diferenciação

> Documento de síntese estratégica sobre os 13 docs da pasta `docs/analise-maestri-360/`
> (índice em [`README.md`](README.md)). **Não é sobre paridade** — é sobre onde o Orkestra
> se diferencia, supera o Maestri e gera valor único. Baseado exclusivamente no conteúdo real
> dos docs, já auditados quanto à fidelidade factual. Data: 2026-07-15.

---

## 1. Onde o Orkestra JÁ supera o Maestri

O Orkestra não é um clone incompleto. Em várias frentes, o código atual já entrega comportamento
**mais robusto ou tecnicamente superior** ao que a documentação do Maestri descreve. Estes são
diferenciais concretos, verificáveis no código:

- **Continuidade de PTY (re-attach com scrollback na troca de projeto).** O `PtyManager` mantém um
  buffer de scrollback por pty (256 KB) e o pty **sobrevive à troca de projeto** — o nó desmonta e
  remonta reidratando o xterm, e o agente/build continua exatamente de onde parou. É o **oposto** da
  estratégia do Maestri, que hiberna e libera os recursos do workspace inativo. Onde o Maestri
  reconstrói, o Orkestra dá continuidade viva. (`terminais-agentes.md` §5.8; `solucao-problemas.md`
  §5.5)

- **Sinal "generating" por conteúdo da tela (border-beam).** Detectar que o agente está *ativamente*
  gerando é difícil, porque a TUI do Claude Code (Ink) repinta a barra de status mesmo ociosa —
  heurísticas de silêncio ficam "presas ligadas". O Orkestra abandonou o silêncio e detecta por
  **conteúdo**: varre as linhas visíveis do xterm procurando `esc to interrupt`
  (`generatingSignal.ts`), com throttle de ~150 ms. É uma heurística que distingue "gerando" de
  "parado" — algo que o gatilho de ociosidade do Maestri não separa. (`terminais-agentes.md` §5.4;
  `canvas.md` §3)

- **Roteamento de resposta sem a regra frágil "receptor desselecionado".** O Maestri detecta a
  resposta de um agente por **ociosidade do terminal** — e o foco do usuário desliga o monitoramento,
  então selecionar o receptor faz a resposta se perder (regra documentada que o usuário *precisa
  saber*). O Orkestra elimina esse atrito com `orq ask --wait` sobre o `waitForIdle` do `AgentBus`:
  bloqueio explícito, **independente de foco**, com fast-path de saída e cap de acumulador.
  (`conexoes.md` §3 e §4.3)

- **Hardening de portal (SEC-3 / SEC-6).** Como o portal carrega web hostil arbitrária, o Orkestra
  aplica barreiras que a doc do Maestri não detalha: validação de esquema de URL (`isSafePortalUrl` —
  bloqueia `file://`/`javascript:`/`data:`), `will-attach-webview` removendo `preload` e forçando
  `nodeIntegration:false`/`contextIsolation:true`, `hardenSession` negando permissões sensíveis em
  toda partição, sanitização por `JSON.stringify` em todo valor injetado, e escopo de projeto (409).
  (`portais.md` §4.5 e §5.3)

- **Validação SSH anti-injeção byte-a-byte.** `isValidSshHost` rejeita host começando com `-` (impede
  injeção de opção do `ssh`), metacaracteres de shell, quebras de linha, NUL e não-ASCII; o handler
  `pty:spawn` usa **allowlist explícito** (o payload cru do renderer nunca é espalhado) e mapeia para
  `spawn('ssh', [host])` **sem shell**. Rigor de segurança de nível de produção. (`ssh-remoto.md` §5.1)

- **Persistência atômica com fsync + self-heal.** `writeJson` faz `tmp` + `fsync` + `rename` + `fsync`
  do diretório; a leitura distingue **quatro estados** (`ok`/`missing`/`corrupt`/`ioerror`) para só
  curar quando é seguro; há backup antes de degradar (`*.corrupt-*`), self-heal do índice
  (`reconstructFromDir` re-adota canvases órfãos em vez de zerar), guard de path-traversal e
  single-instance lock. Resiliência de dados mais forte do que a página de troubleshooting do Maestri
  expõe. (`canvas.md` §4; `solucao-problemas.md` §5.3)

- **Isolamento de crash por nó (ErrorBoundary).** Cada nó renderiza dentro do próprio boundary
  (`REN-3`): um nó com dado corrompido mostra fallback local enquanto sidebar, canvas e demais nós
  seguem funcionando — em vez de tela preta. (`solucao-problemas.md` §5.1; `canvas.md` §3)

- **Find-replace + cores nas notas.** A `NoteFindBar` (com `findMatches` puro e testado) oferece
  próximo/anterior, contador `n/total`, Substituir e Substituir Tudo; e há 6 cores de post-it. A doc
  pública do Maestri **não descreve** nenhum dos dois — são recursos próprios do Orkestra.
  (`notas.md` §5.5 e §5.3)

- **Leitura semântica das conexões.** Arestas **tipadas** (`agent`/`chain`/`note`/`portal`/`link`) com
  badge textual e um **ponto viajante** animado exclusivo da aresta de agente dão uma leitura que o
  Maestri transmite mais por cor/forma do que por rótulo. Some-se o **clipboard entre projetos**
  (copiar num projeto, colar em outro). (`conexoes.md` §3; `canvas.md` §3)

- **Escopo de projeto fail-closed no servidor de orquestração.** Header `x-orkestra-project` com
  `409` no mismatch, `503` quando não há renderer vivo (não mente "ok" ao agente) e `413` para corpos
  grandes — endurecimento nascido do incidente de corrupção cross-project. (`modo-maestro.md` §5.1;
  `portais.md` §5.3)

**Leitura estratégica:** a fundação de **engenharia** (resiliência, segurança, continuidade) já é um
diferencial. O trabalho pela frente é quase todo de **produto/UX** — expor valor que o encanamento já
sustenta.

---

## 2. Padrão central: o encanamento está à frente do produto

A tese que emerge dos 13 docs (e está registrada no `README.md`, "Padrões que emergiram"):

> **O encanamento do Orkestra costuma estar à frente da sua camada de produto/UX.** Servidor de
> orquestração, `AgentBus`, detecção de ociosidade e cordas tipadas estão prontos e testados; o que
> falta é *expor* isso como funcionalidade visível ao usuário e ao agente.

Isso é uma vantagem rara: o custo caro (arquitetura correta, segura, testada) já foi pago. As maiores
alavancas são pontos onde uma fina camada de produto sobre infra pronta gera valor desproporcional:

1. **Servidor de orquestração + `orq` (o "Modo Maestro").** `recruit`, `connect` e `dismiss` já
   funcionam ponta a ponta (cliente → HTTP local → renderer → store). Falta só a camada de produto:
   toggle/gating "Maestro", onboarding que ensine os verbos, e `recruit` posicionar/auto-conectar o
   recruta. **Encanamento 100% pronto, produto ~0%.** (`modo-maestro.md` §5)

2. **`AgentBus` (atenção / busy / `waitForIdle`).** Sustenta, hoje, três produtos ainda não montados:
   o Ombro sem-LLM (a notificação já dispara), um fluxo "A pergunta a B e recebe a resposta" imune a
   foco, e um painel de saúde dos agentes. (`ombro.md` §5; `conexoes.md` §6; `solucao-problemas.md`
   §5.6)

3. **Mirror do canvas + arestas tipadas (topologia como fonte de verdade).** O `/context` já resolve
   os vizinhos diretos; a topologia já está no mirror. Falta só usá-la mais: **travessia transitiva**
   da cadeia de notas, gate/priorização por conexão, e contexto roteado automaticamente.
   (`conexoes.md` §4-6; `notas.md` §6)

4. **Modelo de papéis (`roles.ts`).** Papel já tem `label`/`color`/`hint`, badge no header e é
   definível pela paleta. Falta só o campo `prompt` e a **injeção** no arranque do agente — o passo
   que transforma papel de cosmético em comportamento. (`terminais-agentes.md` §5.2 e §6)

5. **Ranking puro + registro de itens da Batuta (`search.ts` + `paletteCommands.ts`).** Ambos são
   funções puras testadas. Evoluir `rankItems` para fuzzy/multi-palavra/sem-acento e indexar o corpo
   das notas é TDD sem tocar na UI — "maior retorno isolado" da paleta. (`batuta-search.md` §5-6)

6. **Automação de portal + `PtyManager`/persistência.** `click`/`fill` já retornam um booleano de
   sucesso (só falta propagar); o re-attach e a persistência atômica já são a base para hibernação de
   projeto, export de diagnóstico e limite de memória por terminal. (`portais.md` §6;
   `solucao-problemas.md` §6)

---

## 3. Quick wins de alto valor (baixo esforço, reusam infra pronta)

Priorizados por valor × esforço. Todos reaproveitam código já existente e testado — são "destravar",
não "construir".

| # | Quick win | Valor | Esforço | Doc de origem | Por que é barato |
|---|-----------|-------|---------|---------------|------------------|
| 1 | **Documentar verbos de gerência no onboarding** (`orq recruit/connect/dismiss/note write` no `ONBOARDING` de `installOrq.ts`) | Alto | Mínimo | `modo-maestro.md` §6 P1 | Uma edição de string. Sem isso, ~90% do Maestro fica invisível ao agente. |
| 2 | **Notificação clicável (Ombro)** — `notification.on('click')` foca a janela e enquadra o `nodeId` | Alto | Baixo | `ombro.md` §6.1-B | Reusa o pipeline `ptyId→nodeId` e a lógica do `Shift+A`. Fecha o ciclo alerta→ação. |
| 3 | **`rankItems` fuzzy + multi-palavra + sem acento (Batuta)** | Alto | Baixo | `batuta-search.md` §6.1 | Função pura já testada; TDD sem tocar na UI. "Maior retorno isolado" da paleta. |
| 4 | **Arrastar arquivo da árvore → terminal (Árvore)** | Alto | Baixo | `arvore-arquivos.md` §6-P1.1 | `dropPaths.ts` (`pathsToTerminalInput`) já transforma caminho em input de shell. "Maior ROI." |
| 5 | **Travessia transitiva da cadeia de notas no `/context`** (BFS/DFS com guarda anti-ciclo) | Alto | Baixo | `conexoes.md` §6.1; `notas.md` §6.3 | Reusa o mirror; entrega "mapa mental navegável pelo agente" quase de graça. |
| 6 | **Papel que injeta instruções (Terminais)** — campo `prompt` no `Role` + injeção no arranque | Alto | Médio | `terminais-agentes.md` §6-P1 | "Maior gap funcional." Papel deixa de ser badge e passa a moldar o agente. |
| 7 | **`recruit` posiciona abaixo + auto-conecta** ao Maestro/notas | Alto | Baixo-Médio | `modo-maestro.md` §6-P1 | O servidor já tem o `from` no mirror; falta passar posição e chamar `onConnect`. |
| 8 | **`orq whoami` / `list --me`** (nome/papel/conexões do próprio nó) | Médio-Alto | Baixo | `modo-maestro.md` §6-P1 | `ORKESTRA_NODE_ID` já está no env; destrava "recrutas sabem quem são". |
| 9 | **Feedback de sucesso em `portal click/fill`** (propagar o booleano) | Médio-Alto | Baixo | `portais.md` §6-A1 | O valor de retorno já existe; falta só encaminhá-lo pela ponte. Elimina o `snapshot` extra. |
| 10 | **Indexar o corpo das notas na busca** (`searchText` no `PaletteItem`) | Alto | Baixo | `batuta-search.md` §6.2 | Notas longas viram alcançáveis por conteúdo sem inflar a UI. |
| 11 | **Nome personalizado da nota** (`data.name` + duplo-clique/renomear) | Alto | Baixo | `notas.md` §6.1 | Melhora a resolução por `--to` no `orq note write`; pouco código. |
| 12 | **Corrigir `relativeToRoot`** (raiz = subdiretório do repo) via `git rev-parse --show-toplevel` | Médio | Baixo | `arvore-arquivos.md` §5.2/§6-P1.4 | Bug real: overlay de status git some em arquivos aninhados. |
| 13 | **Limpeza de paridade do Canvas**: atalho `⇧T` (grade), renomear grupo por duplo-clique, auto-dissolver grupo com <2 membros | Médio | Baixo | `canvas.md` §6.1-3 | `gridArrange`/`ungroupGroupsById` já existem; falta só ligar tecla/input. |

**Recomendação de arranque:** 1 → 2 → 3/10 → 4 → 5. São os cinco que mais ampliam a percepção de valor
por linha de código escrita, e cada um reaproveita infra já pronta.

---

## 4. Apostas de diferenciação (maior esforço, valor estratégico único)

Ideias que vão **além** do Maestri — não só igualar. Cada uma explora uma vantagem que o Orkestra já
tem na base.

### 4.1 Orquestração multi-agente com contexto roteado pelas conexões

**O que é:** completar o Modo Maestro (toggle + gating por terminal, `reassign` mid-task preservando
posição/nome/conexões, template de "esquadrão" Dev+Revisor+Testador+Docs) **e** tornar a aresta
`agent` semanticamente "carregada" — usando a topologia para rotear/priorizar quem fala com quem e
qual contexto cada agente enxerga. (`modo-maestro.md` §6-P2; `conexoes.md` §6.5; `canvas.md` §3)

**Por que é único:** diferente de um sub-agente de LLM, o Maestro **materializa terminais reais no
canvas** — com processo, posição, papel e conexões visíveis, onde o humano vê e pode intervir. E o
contexto é *puxado* via `orq context`, refletindo o **estado atual** do canvas (fonte de verdade
viva), não injetado estaticamente no prompt. **O que muda para o usuário:** ele dá uma ordem de alto
nível ("monte uma fábrica de software, conecte todos à spec e dispense conforme terminar") e assiste a
equipe se montar, trabalhar e se desmontar — sem virar um cemitério de terminais.

### 4.2 Cadeia de notas como memória compartilhada navegável

**O que é:** além da travessia transitiva (quick win #5), enquadrar a cadeia de notas como **memória
durável e auditável** do agente — um "caderno compartilhado que sobrevive a reinícios" — com
topologias de contexto deliberadas (nota-spec → Dev; nota-de-bugs escrita pelo Revisor → Dev) e uma UI
de navegação da cadeia. (`conexoes.md` §6.7; `notas.md` §6.3; `modo-maestro.md` §2.7)

**Por que é único:** escala contexto grande **sem estufar um único prompt**, e o registro é humano-
legível e versionável (rumo às notas como `.md` em disco, `notas.md` §6.4). **O que muda para o
usuário:** o canvas vira uma base de conhecimento navegável por humano e agente, não um amontoado de
post-its — coordenação por artefato compartilhado, não só por mensagem fire-and-forget.

### 4.3 Papéis ricos + biblioteca portátil de papéis

**O que é:** sobre o papel-com-`prompt` (quick win #6), acrescentar o sidecar `role.json` no `cwd` do
terminal, "Descobrir Responsabilidades" (varredura/importação ao trocar de branch) e `orq role
show/write/edit` — o próprio agente refina o próprio papel entre execuções. (`terminais-agentes.md`
§6-P1/P4)

**Por que é único:** o papel **viaja com o repositório** (git, entre máquinas e colegas), e o agente
tem auto-modificação controlada de contexto. **O que muda para o usuário:** papéis deixam de ser
locais e efêmeros e viram um ativo portátil e compartilhável — a base para templates de equipe e uma
futura biblioteca curada de papéis, indo além do gerenciador local do Maestri.

### 4.4 Árvore de arquivos como IDE colaborativo agente-humano

**O que é:** evoluir o explorador somente-leitura para mini-IDE — editor embutido (CodeMirror), git de
escrita (commit/branch/diff), watch de filesystem com auto-refresh — e, o fecho, **"citar seleção/diff
→ agente conectado"**. (`arvore-arquivos.md` §6-P2/P3)

**Por que é único:** o "citar seleção → agente" fecha o loop **ler → editar → perguntar** sem trocar
de janela, amarrando o explorador à orquestração — a essência do produto. Múltiplas árvores por
subprojeto, cada uma com estado próprio, superam a sidebar única de uma IDE tradicional. **O que muda
para o usuário:** o caminho de "dúvida sobre um trecho" a "mudança pronta" passa a viver inteiramente
no canvas, ao lado dos agentes.

### 4.5 Ombro sem-LLM evoluído (timeline de eventos dos agentes)

**O que é:** além da notificação clicável, um **HUD de agentes que precisam de atenção**, detecção de
"travou" vs. "terminou" (regex de prompts `(y/n)`/stack traces no buffer — mesma técnica de
`generatingSignal.ts`), prévia da última linha no corpo da notificação e notificação agregada
anti-spam. (`ombro.md` §6.1-C/D/E/F; `solucao-problemas.md` §5.6)

**Por que é único e estratégico:** entrega o **valor** do Ombro (saber o que seus agentes fizeram, ser
avisado com contexto) **sem o LLM local e sem o lock-in de hardware** do Maestri (Apple Silicon +
macOS Tahoe 26+). Uma "timeline de eventos dos agentes" 100% local, multiplataforma, é um
diferenciador de alcance. **O que muda para o usuário:** ele monitora dezenas de agentes sem voltar ao
app, em qualquer máquina.

### 4.6 Portais dirigíveis com feedback e criação pelo agente

**O que é:** `orq portal create` (agente cria portais sozinho), `screenshot` (via
`webContents.capturePage()` — o agente multimodal "vê" a página), `back/forward/reload/scroll`,
`console`, `snapshot --html/--dom` (expor seletores) e indicador visual de "agente dirigindo".
(`portais.md` §6-A2/A3/B1/B2/B3/C4)

**Por que é único:** com screenshot + DOM, o agente fecha o loop **ler → agir** sem adivinhar
seletores; combinado ao encadeamento agente→agente→portal, viabiliza **pipelines de automação web sem
MCP** (um agente pesquisa, passa a outro). **O que muda para o usuário:** automação de navegador
autônoma e auditável, com o humano vendo a página mudar em tempo real no canvas.

---

## 5. O que NÃO perseguir (e por quê)

Para focar energia, evitar features de baixo retorno ou já descartadas por decisão:

- **Andares / Floors (git worktree).** Removido deliberadamente na Fase 16 (`42d4db5`). A complexidade
  de UX é real — merge, conflitos, "working tree suja", e `node_modules` por worktree tornaria os
  *hooks* quase obrigatórios (escopo mínimo maior). O isolamento **por projeto** atende hoje.
  Reintroduzir **só se** a orquestração de múltiplos agentes em paralelo virar prioridade concreta —
  aí começando pelo MVP que reusa a Fase 8. (`andares-floors.md` §5-6)

- **Rotinas / cron.** Removido na Fase 16 (`1ed4dea`, sem vestígios em `src`). O monitoramento por
  atenção/notificação já cobre boa parte do valor sem um scheduler. Não reintroduzir proativamente; se
  voltar, **escopar por projeto** (senão reintroduz o risco cross-project). Alternativa leve: um
  "repetir este prompt a cada N" por terminal. (`rotinas.md` §6)

- **Túnel reverso SSH ("workspace SSH" completo).** Explicitamente fora do MVP. Alto esforço/risco:
  segurança do túnel, ciclo de vida, e escopo de projeto no remoto (vide o incidente de corrupção
  cross-project). O **transporte de terminal** remoto (`ssh <host>` com validação rigorosa) já
  funciona e cobre os casos comuns; drag-drop via `scp` e feedback de conexão são degraus menores e
  mais valiosos antes do túnel. (`ssh-remoto.md` §5.3 e §6.6)

- **Camada LLM do Ombro (resumo / Q&A / notas automáticas).** Cortada junto com o copiloto. Exige LLM
  (local para privacidade equivalente = Apple Foundation Models/Ollama, com custo de hardware; ou
  remoto, contrariando o "on-device"). Alto esforço. Capturar primeiro **todo o valor sem-LLM** (§4.5)
  — o gatilho e a matéria-prima já existem; se um dia reativar, é só plugar o modelo. (`ombro.md` §6.2)

- **Polimentos de nicho / alto custo por ora:** localização/i18n da Batuta, catálogo de temas de
  terminal estilo Ghostty, entrada "real" via CDP nos portais, modo Graph (`git log --graph`) e grade
  de ícones com Quick Look. Bons no fim da fila — nenhum bloqueia o fluxo central de agentes.
  (`batuta-search.md` §6; `terminais-agentes.md` §6-P3; `portais.md` §6-C2; `arvore-arquivos.md` §6-P4)

---

## 6. Roteiro sugerido (ondas)

Sequência pragmática: destravar o valor barato primeiro, depois diferenciar, depois apostar grande.

### Onda 1 — Quick wins (destravar a infra pronta)
Objetivo: transformar o "encanamento à frente do produto" em valor visível com esforço mínimo.
- Onboarding dos verbos de gerência (#1) + `recruit` posiciona/auto-conecta (#7) + `orq whoami` (#8).
- Notificação clicável do Ombro (#2).
- Batuta: `rankItems` fuzzy/multi-palavra/sem-acento (#3) + indexar corpo das notas (#10).
- Árvore: arrastar arquivo → terminal (#4) + corrigir `relativeToRoot` (#12).
- Conexões: travessia transitiva da cadeia de notas (#5).
- Portais: feedback de sucesso em `click`/`fill` (#9).
- Notas: nome personalizado (#11). Canvas: limpeza de paridade barata (#13).

*Resultado esperado:* grande parte do valor latente da orquestração e da busca fica exposta,
reaproveitando código testado.

### Onda 2 — Diferenciação (montar produto sobre a base)
Objetivo: converter as alavancas em recursos que já superam o Maestri.
- **Papéis ricos** (§4.3): papel-com-`prompt` (#6) → `role.json` portátil + "Descobrir" + `orq role`.
- **Modo Maestro completo** (§4.1): toggle + gating, `reassign` mid-task, template de esquadrão,
  aresta `agent` "carregada" (contexto roteado por conexão).
- **Ombro evoluído** (§4.5): HUD de atenção, "travou" vs. "terminou", prévia no corpo, agregação.
- **Portais** (§4.6): `orq portal create` + `back/forward/reload/scroll` + `snapshot --html` +
  indicador "agente dirigindo".
- **Árvore, fase 1** (§4.4): editor CodeMirror embutido + "citar seleção → agente".

### Onda 3 — Apostas grandes (valor estratégico)
Objetivo: recursos que definem a categoria e exigem investimento dedicado.
- **Árvore como IDE colaborativo completo** (§4.4): git de escrita, modo Diff, watch de filesystem,
  citar diff → agente.
- **Portais multimodais** (§4.6): `screenshot` + `console` → pipelines de automação web sem MCP.
- **Cadeia de notas como memória navegável** (§4.2): UI de navegação + rumo a notas `.md` em disco.
- **Busca cross-projeto** (`batuta-search.md` §6.9): indexar e saltar entre projetos.
- **Sob demanda concreta:** reintroduzir Floors escopado por projeto, túnel reverso SSH e LLM local do
  Ombro — **apenas** se orquestração paralela cross-máquina ou privacidade on-device virarem
  prioridade de produto.

---

*As maiores oportunidades, em uma frase: o Orkestra já venceu a parte cara (infraestrutura segura,
resiliente e contínua) — o valor está em expor o Modo Maestro pronto, rotear contexto pelas conexões,
tornar papéis comportamentais e portáteis, e entregar o Ombro sem o lock-in de hardware do Maestri.*
