# Ombro — Análise 360° (Maestri → Orkestra)

> Análise da funcionalidade **Ombro** do produto de referência (Maestri, `themaestri.app/pt-br/docs/ombro`) e do que o Orkestra já tem — ou pode ter — de equivalente. Baseada na documentação oficial e no código real do repositório. Descrita com palavras próprias.
>
> Data: 2026-07-15 · Fonte primária: transcrição integral da doc oficial (ver §7).

---

## 1. Visão geral

O **Ombro** (no original, "Shoulder" — a ideia de alguém "olhando por cima do seu ombro") é um **companheiro de IA que roda inteiramente no dispositivo** ("on-device") e cuja função é vigiar os agentes de IA em execução **enquanto você faz outra coisa**. Ele não vive dentro do canvas do app: mora numa **janela flutuante separada**, descrita como "sempre acessível, nunca no caminho", aberta/fechada por um atalho global (**⇧O / Shift+O**).

A proposta central é **eliminar a necessidade de ficar voltando ao app para ler a saída dos terminais**. Em vez de você monitorar N agentes manualmente, o Ombro monitora por você e só te chama quando há algo relevante — e quando chama, já entrega **contexto mastigado**: um resumo do que aconteceu, uma prévia do estado do terminal e uma sugestão de próximo passo.

No Maestri, todo o processamento de linguagem natural do Ombro é feito pelos **Apple Foundation Models** (modelo de fundação local da Apple), o que significa: sem chamadas de API, sem nuvem, sem latência de rede, e — o ponto de venda mais forte — **o código e as saídas do terminal nunca saem da máquina do usuário**. Isso tem um custo de requisito de hardware: exige um Mac com **Apple Silicon** rodando **macOS Tahoe 26 ou posterior**.

Para o Orkestra, este é um caso interessante porque a funcionalidade se divide em duas metades com viabilidades muito diferentes: uma metade **sem LLM** (a notificação passiva "o agente terminou/travou"), que reusa infraestrutura que o Orkestra **já tem construída e funcionando**; e uma metade **com LLM** (resumo, Q&A em linguagem natural, notas automáticas), que hoje está fora de escopo porque o copiloto com LLM foi cortado do produto (ver `docs/maestri-mapa-funcionalidades-2026-07-11.md`).

---

## 2. Como funciona

Segundo a documentação oficial, o Ombro tem quatro capacidades principais:

### 2.1 Monitoramento passivo dos agentes (avisa quando termina/trava)

O Ombro "observa seus agentes em execução de forma passiva". Quando um agente **conclui uma tarefa ou chega a um ponto de parada**, ele notifica o usuário com um pacote de contexto:

- **um resumo** do que aconteceu;
- **uma prévia** do estado atual do terminal;
- **sugestões de próximos passos**.

O objetivo declarado é permitir que o usuário decida o que fazer **sem precisar voltar ao Maestri e ler toda a saída** do terminal. Ou seja: o gatilho é a transição do agente de "trabalhando" para "parado/aguardando", e o valor entregue é a interpretação daquele estado, não só o alerta.

### 2.2 Q&A sobre o estado do workspace

O usuário pode **perguntar diretamente ao Ombro a qualquer momento**, em linguagem natural, sobre qualquer agente. Exemplos citados na doc:

- "Veja o que o Codex está fazendo."
- "O Revisor ainda está rodando?"

O Ombro **lê o estado ao vivo do terminal** e devolve uma resposta concisa. O caso de uso destacado é o usuário estar **em outro app** e querer um status rápido **sem trocar de contexto** de volta para o canvas.

### 2.3 Notas automáticas por linguagem natural

O Ombro pode **criar e manter uma nota chamada "Ombro Notes"** no espaço de trabalho, alimentada por comandos em linguagem natural. Exemplos:

- "Adiciona uma nota dizendo que ainda precisamos escrever testes para o módulo de autenticação."
- "Anota que o problema de rate limit da API foi resolvido."

A nota é **criada automaticamente no canvas na primeira vez** e, nas vezes seguintes, **novas entradas são acrescentadas** à mesma nota. É um registro incremental de decisões/pendências capturadas por voz/texto sem o usuário ter que abrir e editar a nota manualmente.

### 2.4 Resumo de notas do workspace

O Ombro também **lê e resume todas as notas conectadas no espaço de trabalho atual** ("Resume minhas notas"), produzindo uma visão geral coerente. Os usos citados são: **se atualizar depois de uma pausa** e **passar contexto para um novo agente**.

### 2.5 Execução on-device

Tudo isso roda **localmente no Mac** via Apple Foundation Models — sem API, sem nuvem, sem latência — e o atalho **⇧O** abre/fecha a janela flutuante.

---

## 3. Pontos interessantes / diferenciais

- **Passa de "monitorar" para "ser monitorado".** O diferencial conceitual não é o alerta em si, mas a **inversão do fluxo de atenção**: em vez de o humano vigiar N terminais, um agente vigia por ele e só interrompe com contexto pronto para decisão. Isso escala muito melhor conforme o número de agentes no canvas cresce.
- **Notificação enriquecida, não crua.** A notificação não é só "algo mudou"; ela vem com resumo + prévia + próxima ação. É a diferença entre um alerta e um **briefing**.
- **On-device como recurso de privacidade e latência.** Rodar no Apple Foundation Models resolve de uma vez dois problemas típicos de copilotos: exposição de código/saída de terminal a servidores externos e a latência de ida-e-volta à nuvem. É um posicionamento forte para quem trabalha com código proprietário.
- **Janela flutuante fora do app.** Vive fora do canvas justamente para servir o caso "estou em outro app" — é um companheiro de sistema, não um painel interno. O atalho global reforça isso.
- **Notas como memória compartilhável.** O par "notas automáticas + resumo de notas" transforma o workspace numa **memória de contexto** que pode ser tanto consumida pelo humano (após uma pausa) quanto injetada num agente novo — fecha o ciclo de continuidade de trabalho.
- **Custo do diferencial:** exige Apple Silicon + macOS Tahoe 26+. É um recurso premium amarrado a hardware/SO recente, o que limita o alcance.

---

## 4. Como seria o backend

Reconstruindo a arquitetura provável do Ombro a partir do comportamento descrito:

1. **Monitor de eventos dos agentes (a base, sem LLM).** Um observador contínuo do estado de cada terminal/pty que detecta a transição **trabalhando → ocioso** ("chegou a um ponto de parada"). Na prática é um watcher de ociosidade: houve saída e depois um período de silêncio → o agente parou. Este componente é agnóstico de LLM — ele apenas emite o **evento de gatilho**.

2. **Captura de estado ao vivo.** Para responder Q&A e montar a prévia, é preciso acesso ao **buffer atual do terminal** de cada agente (as últimas N linhas / o estado visível da tela). É a matéria-prima tanto do resumo automático quanto das respostas sob demanda.

3. **LLM local (Apple Foundation Models) como camada de interpretação.** Sobre o evento de gatilho + o buffer capturado, o LLM faz:
   - **Sumarização**: transformar a saída bruta do terminal num "o que aconteceu" legível.
   - **Sugestão de próxima ação**: inferir o próximo passo plausível a partir do estado.
   - **Q&A**: interpretar a pergunta em linguagem natural ("o Revisor ainda está rodando?"), decidir de qual terminal ler, e responder de forma concisa.
   - **Ferramentas de nota**: interpretar "adiciona uma nota…"/"resume minhas notas" e traduzir em operações de criar/anexar/ler nós de nota no canvas (function calling / tool use local).

4. **Camada de notificação e janela flutuante.** Uma janela separada, sempre acessível via atalho global, que recebe os alertas enriquecidos e hospeda o chat de Q&A. A notificação em si sai pelo mecanismo nativo do SO.

5. **Fronteira de privacidade.** Como o LLM é local, o buffer do terminal e o código nunca precisam sair do processo — a chamada ao modelo é in-process/on-device, não HTTP.

O ponto-chave arquitetural: **o item 1 (monitor de ociosidade) e o item 2 (captura de buffer) não precisam de LLM**. O LLM entra só a partir do item 3. É exatamente essa divisão que torna metade do Ombro viável no Orkestra hoje.

---

## 5. Estado atual no Orkestra

O Orkestra **já tem construída e funcionando toda a metade sem LLM** do Ombro — a detecção de ociosidade, o sinal de atenção e a notificação nativa do SO. O que falta é a camada de LLM (resumo, Q&A, notas automáticas), que hoje está fora de escopo.

### 5.1 O que já existe (parte SEM LLM)

**Detecção de ociosidade / "agente parou" — `src/main/orchestration/AgentBus.ts`**

- O `AgentBus` mantém um **watcher de atenção** por pty (`track()`): a cada chunk de saída ele marca `sawOutput` e (re)agenda um timer de ociosidade; se nenhum novo chunk chegar em `idleMs`, dispara o callback **`onAttention(ptyId)`** uma única vez. O default é `DEFAULT_ATTENTION_IDLE_MS = 1200` ms (linha 14). Essa é exatamente a semântica "o agente falou e agora parou".
- `clearAttention(ptyId)` (linha 121) marca o output como "visto" e cancela o disparo pendente — exige **novo** output antes de avisar de novo. É chamado quando o usuário volta a olhar aquele terminal.
- `untrack()` limpa tudo quando o pty morre (linha 127), e há auto-untrack no `onExit` (linha 103).
- Existe também `waitForIdle(ptyId, …)` (linha 175): variante **bloqueante** que resolve quando o pty fica ocioso ou estoura o timeout, devolvendo o delta de saída — é o motor do `orq ask --wait`.
- E um watcher de "busy" (`onBusyChange`, linhas 28/85-100) com timer próprio, usado para o sinal visual de "generating" (ver abaixo).

**Notificação do SO + roteamento do sinal — `src/main/index.ts`**

- O `AgentBus` é construído com o callback `onAttention` (linhas 32-54). Quando dispara, ele:
  - resolve `ptyId → nodeId` via `ptyManager.nodeForPty` (linha 34);
  - respeita o toggle "Monitorar atividade": se `node.monitor === false`, não sinaliza nem notifica (linha 38);
  - envia `agent:attention` para o renderer (linha 42);
  - **se a janela não está em foco** (`!mainWindow.isFocused()`, linha 44), dispara uma **notificação nativa do Electron** (`new Notification`, linhas 46-49) com título "Agente ocioso" e corpo "Um agente parou e pode precisar de você." — dentro de `try/catch` para nunca travar o app se o SO negar notificações.
- `onBusyChange` (linhas 62-68) envia `agent:busy` para o renderer (sinal visual local, sem notificar).
- O import de `Notification` do Electron está na linha 1.

**Ponte preload — `src/preload/index.ts`**

- `onAgentAttention(cb)` assina `agent:attention` (linhas 118-122); `clearAgentAttention(nodeId)` envia `agent:attention:clear` (linha 123); `onAgentBusy(cb)` assina `agent:busy` (linhas 129-132).

**Estado efêmero no renderer — `src/renderer/src/store/canvasStore.ts`**

- Dois `Set<string>` efêmeros (não serializados/hidratados): **`attention`** com `setAttention` (linhas 281-282, 446-452) e **`generating`** com `setGenerating` (linhas 296-297, 454-461). Ao remover um terminal, o id sai do `attention` também (linha ~668).

**Badge de atenção no nó — `src/renderer/src/components/TerminalFlowNode.tsx`**

- Lê `hasAttention = attention.has(id)` (linha 22) e renderiza o **badge de atenção** `.ork-node-attention` no header, com `role="status"` e `aria-label`/`title` "Este agente parou e pode precisar de você" (linhas 95-102).
- Combina os sinais num `nodeState`: `generating ? 'generating' : hasAttention ? 'needsInput' : 'idle'` (linha 63) — o `'needsInput'` reusa justamente o sinal de ociosidade.
- `handleFocusCapture` (linhas 74-77) limpa a atenção do próprio id (`setAttention(id, false)` + `clearAgentAttention(id)`) quando o usuário foca qualquer coisa dentro do nó.

**Sinal "generating" (border-beam) — `src/renderer/src/components/TerminalNode.tsx` + `src/renderer/src/terminal/generatingSignal.ts`**

- Em vez de depender de silêncio (que a TUI do Claude Code/Ink não produz — ela repinta a barra de status mesmo ociosa), o `TerminalNode` **varre o conteúdo visível do xterm** a cada chunk (throttled ~150 ms, `GENERATING_SCAN_THROTTLE_MS`) procurando a marca **"esc to interrupt"** (`WORKING_MARKER = /esc to interrupt/i` em `generatingSignal.ts`), que aparece na linha de status do Claude Code **só enquanto ele está gerando**; grava o resultado via `setGenerating` (linhas 92-118, 145-151 de `TerminalNode.tsx`).

**Roteamento no canvas — `src/renderer/src/components/Canvas.tsx`**

- Assina `onAgentAttention` e faz `setAttention(nodeId, true)` (respeitando `monitor === false`) — linhas ~161-180.
- **Atalho Shift+A** cicla o foco entre os nós que estão em `attention` (foca o próximo agente ocioso aguardando) — linhas ~356-367. É o equivalente funcional ao "pular para o agente que precisa de atenção".
- O plumbing de `onAgentBusy` fica **dormente** (linhas ~182-191): o sinal de generating hoje vem da varredura de conteúdo, não do watcher de busy.

**Toggle "Monitorar atividade" — `src/renderer/src/components/NewTerminalModal.tsx`**

- Cada terminal tem a opção `monitor` (default `true`, linhas 36/56/160), que liga/desliga a detecção de atenção + notificação para aquele nó.

**Q&A / leitura de estado ao vivo (sem LLM, via HTTP) — `src/main/index.ts` (`OrchestrationServer`)**

- Já existe `check(name)` que devolve o buffer acumulado de um terminal por nome (linhas 126-128) e `ask/askWait/askRaw` (linhas 104-125). Não é o Q&A em linguagem natural do Ombro, mas é a **fundação de captura de estado ao vivo** que um Q&A (humano ou agente externo) já consegue consultar hoje via `orq check`.

### 5.2 O que falta (parte COM LLM)

- **Resumo do que aconteceu** ao terminar (a notificação atual é genérica: "Um agente parou e pode precisar de você." — não resume a saída).
- **Sugestão de próximo passo.**
- **Q&A em linguagem natural** sobre o estado ("o Revisor ainda está rodando?") — hoje só há `orq check` cru, sem interpretação.
- **Notas automáticas** ("Ombro Notes") criadas/anexadas por linguagem natural, e **resumo de notas** do workspace.
- **Janela flutuante dedicada** fora do app + atalho global (o Orkestra usa notificação do SO + badge no nó + Shift+A dentro do app).
- **LLM local on-device** (Apple Foundation Models ou equivalente) — cortado junto com o copiloto.

---

## 6. Melhorias sugeridas para o Orkestra

Separando pelo eixo LLM/não-LLM e priorizando por valor × esforço.

### 6.1 Viável SEM LLM (reusa o que já existe)

| # | Melhoria | Valor | Esforço | Observação |
|---|----------|-------|---------|------------|
| A | **Notificação nativa ao terminar/travar já está pronta** — só validar e polir | Alto | Baixíssimo | O caminho `onAttention → Notification` (`src/main/index.ts:44-53`) já dispara quando a janela está fora de foco. Falta apenas testar em produção (permissão do SO, macOS/Windows) e talvez tornar o texto configurável. |
| B | **Notificação "clicável"** que foca o app e o terminal culpado | Alto | Baixo | Hoje a `Notification` não tem handler de clique. Adicionar `notification.on('click', …)` para focar a janela e enquadrar aquele `nodeId` (reusar a lógica do Shift+A em `Canvas.tsx`). Fecha o ciclo alerta→ação. |
| C | **Enriquecer o corpo da notificação sem LLM** — incluir o nome do agente e a(s) última(s) linha(s) do buffer | Médio-Alto | Baixo | O buffer já está disponível (`agentBus.read(ptyId)`); dá para colocar a última linha não-vazia no corpo da notificação como "prévia" — uma versão pobre do resumo do Ombro, mas útil e 100% local. |
| D | **Detectar "travou" além de "terminou"** (agente esperando input, erro, prompt de confirmação) | Médio | Médio | Hoje o gatilho é ociosidade genérica. Dá para casar padrões conhecidos no buffer (ex.: prompts "(y/n)", "Do you want to proceed?", stack traces) por regex — mesma técnica já usada em `generatingSignal.ts` — e diferenciar "terminou ok" de "precisa de você agora". |
| E | **Painel/lista de agentes que precisam de atenção** dentro do app | Médio | Baixo-Médio | O `Set` `attention` já é a fonte de verdade; o Shift+A já cicla. Expor uma pequena lista/HUD ("3 agentes aguardando") consolida o valor de monitoramento sem sair do app. |
| F | **Notificação agregada / anti-spam** | Baixo-Médio | Baixo | Com muitos agentes, evitar N notificações; agrupar ("2 agentes ficaram ociosos"). |

**Prioridade recomendada (sem LLM):** A → B → C. São incrementais sobre código já existente e entregam a essência do "Ombro sem LLM" (avisar quando termina/trava, com um clique de volta e uma prévia). É exatamente o item marcado como **viável** no mapa de funcionalidades (`docs/maestri-mapa-funcionalidades-2026-07-11.md`, Onda 1).

### 6.2 Precisa de LLM (fora do escopo atual — copiloto cortado)

| # | Melhoria | Valor | Esforço | Observação |
|---|----------|-------|---------|------------|
| G | **Resumo do que aconteceu** no corpo da notificação | Alto | Alto | Requer LLM sobre o buffer. Se reativado, o gatilho (`onAttention`) e a matéria-prima (`agentBus.read`) já existem; só falta a chamada ao modelo. |
| H | **Sugestão de próximo passo** | Alto | Alto | Idem G. |
| I | **Q&A em linguagem natural** sobre o estado ("o Revisor ainda está rodando?") | Alto | Alto | O `orq check`/`OrchestrationServer` já expõe o estado ao vivo; um agente externo com LLM (local ou remoto) poderia consumir isso e responder — caminho de menor esforço se um dia quiser reintroduzir sem LLM embarcado no app. |
| J | **Notas automáticas ("Ombro Notes") + resumo de notas** | Médio | Alto | O Orkestra já tem nós de nota no canvas; faltaria a camada de interpretação (criar/anexar/resumir por linguagem natural). |

**Nota estratégica:** se o objetivo for privacidade equivalente ao Ombro (código nunca sai da máquina), a rota é um **LLM local** (Ollama/llama.cpp, ou os próprios Apple Foundation Models em Mac Apple Silicon). Se privacidade não for requisito duro, um LLM remoto barato aplicado só ao delta de buffer resolveria G/H/I com bem menos esforço de infra — mas contraria o diferencial "on-device" do original.

---

## 7. Referência

- **Documentação oficial (fonte primária):** Maestri — "Ombro", `https://www.themaestri.app/pt-br/docs/ombro` (transcrição integral obtida em 2026-07-15). Pontos-chave: companheiro de IA on-device em janela flutuante (atalho ⇧O); monitoramento passivo com notificação enriquecida (resumo + prévia + próximos passos) quando um agente conclui/para; Q&A sobre estado ao vivo do terminal; notas automáticas "Ombro Notes" e resumo de notas; movido pelos Apple Foundation Models (sem API/nuvem/latência; exige Mac Apple Silicon + macOS Tahoe 26+).
- **Mapa interno:** `docs/maestri-mapa-funcionalidades-2026-07-11.md` — linha do "Ombro (IA on-device)" e item 1 da Onda 1 ("Indicador de atenção do agente"), que registra que **a notificação "agente terminou" é viável sem LLM** (reusa a detecção de ociosidade), enquanto resumo/Q&A precisam do LLM que foi cortado.
- **Código real do Orkestra citado (§5):**
  - `src/main/orchestration/AgentBus.ts` — watcher de atenção (`onAttention`, `clearAttention`), `waitForIdle`, `onBusyChange`, `DEFAULT_ATTENTION_IDLE_MS`.
  - `src/main/index.ts` — construção do `AgentBus`, `onAttention` → `Notification` do Electron + envio `agent:attention`, `onBusyChange` → `agent:busy`, toggle `monitor`, `OrchestrationServer` (`check`/`ask`/`askWait`).
  - `src/preload/index.ts` — `onAgentAttention` / `clearAgentAttention` / `onAgentBusy`.
  - `src/renderer/src/store/canvasStore.ts` — Sets efêmeros `attention` / `generating` e setters.
  - `src/renderer/src/components/TerminalFlowNode.tsx` — badge de atenção `.ork-node-attention`, `nodeState`, `handleFocusCapture`.
  - `src/renderer/src/components/TerminalNode.tsx` + `src/renderer/src/terminal/generatingSignal.ts` — sinal "generating" por conteúdo (`WORKING_MARKER = /esc to interrupt/i`).
  - `src/renderer/src/components/Canvas.tsx` — roteamento de `onAgentAttention` e atalho Shift+A (ciclar agentes ociosos).
  - `src/renderer/src/components/NewTerminalModal.tsx` — toggle "Monitorar atividade" (`monitor`).
