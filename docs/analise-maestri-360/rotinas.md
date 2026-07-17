# Rotinas — Análise 360° (Maestri → Orkestra)

> Documento de análise da funcionalidade **Rotinas** (prompt agendado via cron + encadeamento) do produto de referência (Maestri), comparada ao estado atual do **Orkestra**. Baseado na documentação oficial de referência e no código/histórico real do repositório. Descrição com palavras próprias; não reproduz marca, texto de UI nem design do produto de referência.
>
> Fonte primária: `https://www.themaestri.app/pt-br/docs/routines` (consultada em 2026-07-15).

---

## 1. Visão geral

**Rotinas** são automações que permitem repetir tarefas dentro do workspace **agendando prompts** que são enviados aos agentes (terminais) em intervalos definidos. Em vez de digitar manualmente os mesmos comandos várias vezes ao longo do dia, o usuário define uma rotina uma vez e o produto passa a disparar aquele prompt periodicamente, em segundo plano, enquanto o usuário se concentra em outro trabalho.

A motivação é direta: muitos fluxos de trabalho envolvem ações repetitivas — rodar a suíte de testes, checar o status do build, puxar as últimas mudanças do repositório, ou pedir a um agente revisor para olhar os commits recentes. Rotinas transformam essas ações recorrentes em automações agendadas.

Conceitualmente, uma rotina é a tripla **{prompt, intervalo/agenda, agente-alvo}**, com um estado de habilitado/pausado. O disparo entrega o prompt ao terminal do agente escolhido como se o usuário o tivesse digitado, e o próprio agente decide o que fazer com a instrução. É uma feature de **orquestração temporal**: adiciona o eixo do tempo (quando) sobre a orquestração espacial (quem faz o quê) que o canvas já oferece.

No Orkestra, esta funcionalidade **foi construída e depois removida por decisão do usuário** — os detalhes precisos e verificados no código estão na Seção 5.

---

## 2. Como funciona

### 2.1 Prompt agendado (gatilho temporal)

O núcleo é um **prompt que executa em intervalos definidos**. No fluxo de referência, criar uma rotina consiste em:

1. Abrir o gerenciador de rotinas pelo menu do aplicativo.
2. Criar uma nova rotina.
3. Escrever o prompt a ser enviado ao agente.
4. Definir o intervalo/agenda (por exemplo, "a cada 5 minutos", "a cada hora").
5. Selecionar qual terminal de agente deve receber o prompt.
6. Salvar.

A rotina começa a executar imediatamente e continua repetindo no intervalo definido até ser **pausada** ou **deletada**. O gatilho é puramente **temporal**: não depende de eventos externos (webhook, mudança de arquivo, etc.), apenas do relógio — é o modelo mental de um **cron**, com granularidade tipicamente de minutos.

### 2.2 Encadeamento de passos/agentes

O encadeamento na referência é feito **dentro de uma única rotina**, separando múltiplos prompts com um delimitador (`&&`) em sua própria linha. Cada trecho é enviado ao agente como uma **mensagem separada**, e o próximo só é disparado **após o anterior ser concluído** (execução sequencial, não paralela). Exemplo conceitual de um encadeamento de três passos:

```
puxe as últimas mudanças
&&
rode a suíte de testes
&&
resuma os resultados
```

Isso resulta em três mensagens enviadas ao mesmo agente, uma após a outra, todas a partir de uma única rotina — efetivamente um mini-pipeline "build → test → deploy" ou "pull → test → summarize" automatizado.

Vale distinguir dois níveis de encadeamento possíveis:

- **Encadeamento de passos (referência):** vários prompts sequenciais para o **mesmo** agente, delimitados dentro da rotina.
- **Encadeamento de agentes (mais amplo):** um passo entregue a um agente e o próximo a outro. Na referência, o roteamento por rotina é para um único terminal-alvo; a coordenação entre agentes diferentes se dá pelos mecanismos já existentes de comunicação (conexões/notas), não por um campo multi-alvo na própria rotina.

### 2.3 Gerenciamento e sinalização

Cada rotina pode ser:

- **Pausada / Retomada** — desativar temporariamente sem apagar.
- **Editada** — trocar prompt, intervalo ou agente-alvo a qualquer momento.
- **Deletada** — remoção permanente.

Rotinas ativas exibem um **indicador visual** para o usuário perceber de relance o que está executando.

### 2.4 Casos de uso destacados na referência

- **Testes contínuos** — rodar a suíte a cada poucos minutos para pegar regressões cedo.
- **Monitoramento de status** — checar deploy/saúde do servidor em intervalos regulares.
- **Ciclos de revisão de código** — um agente revisor verifica periodicamente novos commits e deixa feedback.
- **Fluxos em etapas** — encadear build/test/deploy num único pipeline agendado.
- **Automações na web** — conectar um agente a um portal de navegador e agendá-lo para checar um dashboard, extrair dados ou preencher formulários de forma recorrente.
- **Scraping agendado** — um agente abre um portal, extrai informações de uma página ao vivo e escreve o resultado numa nota — tudo no piloto automático.

---

## 3. Pontos interessantes / diferenciais

- **Orquestração no eixo do tempo.** A maioria dos canvases de agentes coordena *quem fala com quem*; Rotinas acrescenta *quando as coisas acontecem*. Isso converte o canvas de uma ferramenta de sessão interativa em algo que continua trabalhando sem o usuário presente.
- **Reuso do canal de mensagens existente.** O disparo não inventa um subsistema de execução novo — ele reaproveita o mesmo mecanismo de "enviar texto para o terminal do agente". A rotina é uma casca fina (agenda + alvo) sobre uma capacidade que o produto já tem (falar com um agente). Isso mantém o custo de implementação baixo e o comportamento previsível.
- **Encadeamento sequencial simples.** Em vez de um motor de workflow com grafo de dependências, o encadeamento usa um delimitador textual e a regra "só dispara o próximo quando o anterior terminou". É deliberadamente humilde, mas cobre a maioria dos pipelines lineares (pull → test → summarize).
- **Combinação com portais = automação web recorrente.** O par Rotina + Portal (webview dirigível) habilita scraping e checagem de dashboards agendados sem sair da ferramenta — um diferencial que vai além de "rodar comandos de shell".
- **Modelo mental familiar (cron).** Usar semântica de cron/intervalos torna a feature legível para desenvolvedores, que já conhecem `*/5 * * * *`. Baixa curva de aprendizado.
- **Feedback visual do que está ativo.** O indicador de rotina ativa evita o problema clássico de automações "fantasma" rodando sem o usuário saber.

**Limitações inerentes ao modelo (a considerar):**

- **Sem catch-up** — se o app estiver fechado no horário agendado, o disparo é perdido (comportamento esperado para um app desktop, mas relevante para tarefas críticas).
- **Alvo por nome** — a rotina aponta para um terminal por identificador/nome; se o alvo não existir no momento do disparo, o disparo vira um no-op silencioso.
- **Agente não-determinístico** — como o "passo" é um prompt enviado a um agente de IA, a conclusão de um passo e o sucesso real da tarefa nem sempre coincidem; o encadeamento sequencial assume que "mensagem processada" ≈ "passo concluído".

---

## 4. Como seria o backend

Esta seção descreve a arquitetura de backend adequada ao Orkestra (Electron: `main` com Node, `renderer` sem acesso a `fs`/`http`/`node-pty`). Ela reflete tanto o desenho planejado quanto o que efetivamente foi implementado e depois removido (ver Seção 5), servindo de referência caso a feature seja reintroduzida.

### 4.1 Matcher de cron puro

Uma função pura, sem dependências, que decide se uma expressão cron casa com um dado instante:

- Assinatura conceitual: `cronMatches(expr: string, d: Date): boolean`.
- Suporta os 5 campos padrão (`min hour dom mon dow`) com `*`, `N`, `*/N`, `A-B` e listas `A,B`.
- Usa a **hora local** do sistema (`getMinutes/getHours/getDate/getMonth/getDay`), coerente com a expectativa do usuário; expressão malformada retorna `false`.
- Cuidados de borda conhecidos: `*/N` deve contar a partir do mínimo do campo; `dow` aceitar tanto `0` quanto `7` para domingo; guardar partes vazias.

Ser uma função pura torna-a trivialmente testável (entrada `Date` fixa → saída booleana), sem timers.

### 4.2 Scheduler no processo main

Um serviço no `main` (ex.: `RoutineScheduler`) que:

- Mantém as rotinas num mapa em memória (`Map<id, Routine>`), onde `Routine = { id, name, schedule, target, command, enabled }`.
- Expõe operações CRUD: `add`, `list`, `remove`, `setEnabled`.
- Roda um **`tick()`** periódico (ex.: a cada 30s via `setInterval`) que, para cada rotina habilitada cujo `cronMatches(schedule, now)` é verdadeiro, chama um callback `onFire(routine)`.
- Recebe `now` **injetável** (`opts.now`) para testabilidade (testes controlam o relógio sem fake timers); produção usa `() => new Date()`.
- Aplica **dedupe por minuto**: rastreia o minuto-epoch do último disparo de cada rotina para garantir no máximo um disparo por minuto (já que o tick de 30s cruza o mesmo minuto duas vezes).
- Tem `start()`/`stop()` amarrados ao ciclo de vida do app (iniciar no `whenReady`, parar no `before-quit`).
- **Isola erros por tick/rotina** em try/catch para que uma rotina defeituosa nunca derrube o processo main.

### 4.3 Disparo de agentes (o "onFire")

O `onFire(routine)` conecta a agenda ao agente:

1. Resolve `routine.target` (nome) para o PTY correspondente (reusando a resolução de terminal por nome já existente na orquestração).
2. Se o PTY existe, envia o comando ao agente através do **barramento de agentes** já existente (o mesmo mecanismo usado quando um agente "fala" com outro), como se o texto tivesse sido digitado.
3. Se o alvo não existe, no-op silencioso (idealmente com log/feedback).

O ponto-chave é o **reuso**: o scheduler não fala diretamente com o `node-pty`; ele delega ao mecanismo de mensagens de agente que já resolve foco, injeção de texto e enter. O encadeamento com `&&` fica a cargo do shell/agente no próprio comando — nenhuma lógica especial no scheduler.

### 4.4 Persistência dos agendamentos

- Rotinas persistem em disco (ex.: `~/.orkestra/routines.json`), sobrevivendo a restart.
- Escrita **atômica** (gravar em arquivo temporário e renomear) para não corromper o JSON em caso de crash no meio da escrita.
- Guardas defensivas na carga (`Array.isArray`, validação de campos) para não quebrar com arquivo malformado.
- O estado `lastFired` (dedupe) é apenas em memória — aceitável que, após um restart, uma rotina possa disparar de novo no mesmo minuto do restart.

### 4.5 Superfícies de controle (UI, IPC, CLI, HTTP)

- **IPC** (`routine:list/add/remove/toggle`) expostos ao renderer via preload (`window.orkestra.routines.*`), pois o renderer não pode tocar `fs`.
- **Painel de UI** (ex.: `RoutinesPanel`) para listar/criar/pausar/remover rotinas.
- **CLI/HTTP para o agente** (`orq routine list|add|remove` + rotas `GET/POST /routines` no servidor de orquestração local, atrás do gate de `127.0.0.1` + token): permite que o **próprio agente** crie e gerencie rotinas programaticamente — coerente com o modelo do Orkestra em que agentes operam a ferramenta.

### 4.6 Riscos/decisões de projeto do backend

- **Granularidade de 1 minuto** (herança do cron) — suficiente para os casos de uso; não serve para sub-minuto.
- **Fuso horário local** — precisa ser documentado para evitar surpresa.
- **Sem catch-up** ao reabrir o app — disparos perdidos não são recuperados.
- **Segurança** — as rotas HTTP de rotina precisam ficar **depois** do gate de token, como as demais rotas do servidor de orquestração.

---

## 5. Estado atual no Orkestra

**Estado: implementado na Fase 10 e depois REMOVIDO POR COMPLETO na Fase 16, por decisão do usuário. Hoje não há nenhum vestígio da feature no código-fonte.**

Este é um caso de funcionalidade **construída, retirada da UI e depois erradicada do backend** — não é um "nunca implementado". A cronologia verificada no histórico do git:

### 5.1 Foi construída (Fase 10)

O plano `docs/superpowers/plans/2026-07-10-fase-10-rotinas.md` especifica exatamente a arquitetura descrita na Seção 4 (matcher cron puro, `RoutineScheduler`, IPC, `orq routine`, rotas HTTP, `RoutinesPanel`, persistência em `routines.json`). Ela foi de fato implementada, conforme os commits:

- `64f82b9` feat: matcher cron puro (Fase 10)
- `4397b15` fix: cron */N conta a partir do mínimo do campo + guarda parte vazia (Fase 10 Task 1)
- `d4b0020` feat: RoutineScheduler + IPC + disparo via AgentBus + persistência (Fase 10)
- `6d591e3` fix: isolamento de erro no tick + validação de rotina (Fase 10 Task 2)
- `92da661` feat: orq routine + rotas HTTP + RoutinesPanel (Fase 10)
- `9ba740a` fix: 404 (não 200) quando `opts.routines` ausente (Fase 10 Task 3)
- `139fee9` feat: … + cron dow=7 (Fase 14) — ajuste posterior no matcher
- `8266a6f` fix: escrita atômica (tmp+rename) na persistência de floors e rotinas

### 5.2 Removida da UI (Fase 15)

O plano `docs/superpowers/plans/2026-07-11-fase-15-projetos.md` registra na Task 1 "remover os painéis de Rotinas e Floors da UI", e na linha 138 anota explicitamente: *"Backend de Rotinas/Floors segue dormente (removido só da UI na Task 1); pode ser removido por completo num passo futuro se o usuário confirmar."* Commit:

- `fc26580` feat: remover painéis de Rotinas e Floors da UI (Fase 15)

### 5.3 Erradicada por completo (Fase 16)

O usuário confirmou a remoção total. Commit:

- `1ed4dea` refactor: remover feature de Rotinas (cron) por completo + limpar docs (Fase 16)

Esse commit apagou **17 arquivos / ~1202 deleções**, incluindo (deletados na íntegra):

- `src/shared/cron.ts` e `src/shared/cron.test.ts` (matcher cron)
- `src/shared/routines.ts` (tipo `Routine`)
- `src/main/routines/RoutineScheduler.ts` e `.test.ts`
- `src/main/routines/registerRoutineIpc.ts` e `.test.ts`
- `src/renderer/src/components/RoutinesPanel.tsx`
- e removeu as rotas de rotina de `src/main/orchestration/OrchestrationServer.ts` (+ testes), o subcomando `routine` de `src/orq/orq.ts` (+ testes), a fiação em `src/main/index.ts`, os handlers no `src/preload/index.ts`, além de estilos em `panels.css`/`scrollbars.css` e menções no `README.md`.

### 5.4 Verificação do estado atual (feita agora, no código)

Confirmações executadas sobre a árvore de trabalho atual (branch `feat/designcode-ui`):

- **Não existem** os arquivos `src/shared/cron.ts`, `src/shared/cron.test.ts`, `src/shared/routines.ts`, nem o diretório `src/main/routines/`.
- `grep` por `RoutineScheduler`, `registerRoutineIpc`, `cronMatches`, `routine:list`, `routine:add`, `orkestra.routines`, `RoutinesPanel` em `src` retorna **zero** resultados.
- `src/main/orchestration/OrchestrationServer.ts`, `src/orq/orq.ts`, `src/preload/index.ts` e `src/renderer/src/env.d.ts` **não** têm mais nenhuma referência a `/routines`/`routine`.
- Os únicos matches de "cron/schedule/routine/agendad" em `src` são **falsos positivos não relacionados**: `scheduleGeneratingScan` em `TerminalNode.tsx`, o `schedule` (setTimeout) do `PtyDataBatcher`, e as strings "suspensão agendada" da lógica de visibilidade de nós (`nodeVisibility.ts`). Nenhum deles é a feature Rotinas.

### 5.5 A decisão registrada

A decisão está documentada em `docs/maestri-mapa-funcionalidades-2026-07-11.md`:

- Linha 21: `| **Rotinas** | prompt agendado (cron) + encadeamento | 🗑️ removido (Fase 16) | — |`
- Linha 53: *"**Fora de escopo (decisão do usuário):** Floors, Rotinas (removidos)…"*

E reforçada em `docs/maestri-changelog-analise-2026-07-13.md` (linha 5): *"Exclui o que removemos por decisão do usuário (Floors, Rotinas)…"*

**Resumo do estado:** a feature existiu (Fase 10), saiu da UI (Fase 15) e foi apagada do backend (Fase 16). Hoje o Orkestra **não tem Rotinas** — nem UI, nem scheduler, nem cron, nem CLI, nem persistência — por decisão explícita do usuário.

---

## 6. Melhorias sugeridas para o Orkestra

A feature foi removida por decisão de escopo, não por falha técnica (a implementação existiu e tinha testes verdes). Portanto, uma eventual "melhoria" aqui é **como reintroduzir bem**, caso o valor volte a justificar — ou como capturar parte do valor por outros meios.

### 6.1 Se reintroduzir: aproveitar que o código já existiu

- **Ponto de partida barato:** o commit `1ed4dea` pode ser revertido/consultado como base; o desenho (matcher puro + scheduler com `now` injetável + reuso do `AgentBus` + persistência atômica) já era sólido e testado. O custo de reintrodução é **baixo** justamente porque não parte do zero.
- **Encaixe no novo modelo de projetos:** o grande motivo da remoção foi a virada para **múltiplos projetos** (Fase 15). Uma reintrodução precisa **escopar rotinas por projeto** (uma rotina pertence a um projeto e só dispara para os terminais daquele projeto), evitando o problema de disparo cross-project — alinhado ao incidente de corrupção cross-project já registrado na memória do projeto.

### 6.2 Alternativas de menor esforço que capturam parte do valor

- **Gatilhos por evento em vez de tempo:** parte dos casos de uso da referência (revisar novos commits, avisar quando algo muda) sobrepõe-se ao **indicador de atenção do agente** e à detecção de ociosidade que o Orkestra já tem. Notificar "agente terminou / travou" já cobre monitoramento sem precisar de um cron.
- **Comando "repetir a cada N" leve:** em vez do gerenciador completo de rotinas, um atalho no terminal do tipo "reenviar este prompt a cada X minutos até eu parar" resolveria os casos triviais (testes contínuos, ping de status) com uma fração da superfície de UI.

### 6.3 Prós e contras de reintroduzir

**Prós:**
- Diferencial real (orquestração no eixo do tempo; automação recorrente; scraping agendado com portais).
- Reuso máximo de infraestrutura existente (AgentBus, resolução de terminal por nome, servidor de orquestração, portais).
- Base de código e testes já existiram — reintrodução de baixo risco técnico.

**Contras:**
- Superfície de UI e conceitual não trivial (gerenciador, estados pausado/ativo, edição).
- Semântica de disparo em app desktop tem arestas (sem catch-up; alvo ausente = no-op silencioso; fuso local).
- Precisa ser **reescopado por projeto** para não reintroduzir risco cross-project.
- Concorre em valor com features já priorizadas (Árvore de Arquivos era o gap central; atenção/notificação já cobre parte do monitoramento).

### 6.4 Priorização (valor × esforço)

| Item | Valor | Esforço | Recomendação |
|---|---|---|---|
| Notificação "agente terminou/travou" (já existe base) | Alto | Baixo | Já entregue / manter — cobre parte do valor de monitoramento sem cron |
| "Repetir prompt a cada N" (mini-rotina por terminal) | Médio | Baixo | Bom candidato se a demanda por recorrência voltar |
| Reintroduzir Rotinas completas, escopadas por projeto | Médio-Alto (nichos: scraping/testes contínuos) | Médio (reusa código removido, mas exige escopo por projeto + UI) | Fazer **apenas** sob demanda concreta do usuário; não é prioridade atual |
| Encadeamento multi-agente (grafo, não só `&&`) | Alto (potencial) | Alto | Não fazer agora — só se virar produto de workflow |

**Conclusão de priorização:** a decisão de remover foi coerente para o momento (foco em projetos + Árvore de Arquivos). A recomendação é **não reintroduzir proativamente**; capturar o subconjunto de maior valor (monitoramento) pelo caminho já existente de atenção/notificação, e reservar a reintrodução completa — com escopo por projeto — para quando houver um caso de uso concreto (por exemplo, scraping agendado via portais).

---

## 7. Referência

- **Documentação de referência (fonte primária):** `https://www.themaestri.app/pt-br/docs/routines` — funcionamento de Rotinas (prompt agendado por intervalo, criação via menu, encadeamento com `&&` sequencial, gerenciamento pausar/editar/deletar, casos de uso). Consultada em 2026-07-15.
- **Plano de implementação original (Orkestra):** `docs/superpowers/plans/2026-07-10-fase-10-rotinas.md` — matcher cron puro (`src/shared/cron.ts`), `RoutineScheduler`, IPC `routine:*`, `orq routine`, rotas HTTP, `RoutinesPanel`, persistência em `~/.orkestra/routines.json`.
- **Decisão de remoção da UI:** `docs/superpowers/plans/2026-07-11-fase-15-projetos.md` (Task 1 e linha 138 — backend dormente após remover painéis).
- **Decisão registrada / mapa de escopo:** `docs/maestri-mapa-funcionalidades-2026-07-11.md` (linhas 21 e 53 — Rotinas 🗑️ removido, fora de escopo por decisão do usuário).
- **Contexto de escopo:** `docs/maestri-changelog-analise-2026-07-13.md` (linha 5 — exclusão de Floors e Rotinas por decisão do usuário).
- **Histórico git relevante:** `64f82b9`, `4397b15`, `d4b0020`, `6d591e3`, `92da661`, `9ba740a` (Fase 10 — construção); `139fee9`, `8266a6f` (ajustes); `fc26580` (Fase 15 — remoção da UI); `1ed4dea` (Fase 16 — remoção completa, 17 arquivos / ~1202 deleções).
- **Verificação de estado atual:** ausência confirmada de `src/shared/cron.ts`, `src/shared/routines.ts`, `src/main/routines/`, e de qualquer referência a `RoutineScheduler`/`RoutinesPanel`/`orkestra.routines`/`/routines` em `src` (branch `feat/designcode-ui`, 2026-07-15).
