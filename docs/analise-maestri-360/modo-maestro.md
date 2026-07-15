# Modo Maestro — Análise 360° (Maestri → Orkestra)

> Documento de pesquisa. Compara a funcionalidade **Modo Maestro** do produto de referência
> [Maestri](https://www.themaestri.app) com o estado atual do **Orkestra**, e propõe um caminho de
> evolução. Baseado na documentação oficial do Maestro (transcrita na seção 7) e no código real do
> Orkestra (caminhos citados na seção 5).

---

## 1. Visão geral

O **Modo Maestro** do Maestri promove um terminal comum a **gerente de uma equipe montada sob
demanda**. Nas palavras da própria documentação: "O Modo Maestro promove um terminal de um agente
comum para um **gerente** — capaz de recrutar novos agentes no seu canvas, atribuir papéis a eles,
conectá-los às notas certas e dispensá-los quando o trabalho terminar."

A ideia central é dar ao *agente líder* as mesmas ações que o usuário humano teria sobre o canvas:
em vez de o humano criar cada terminal, ligar cada nota e ajustar cada papel na mão, é o próprio
agente que constrói e desmonta sua equipe. O humano dá uma ordem de alto nível ("monte uma pequena
fábrica de software: Dev, Revisor, Testador e Redator de Docs, conecte todos à nota de especificação
e dispense cada um conforme terminar") e o Maestro executa a orquestração inteira.

No **Maestri**, o Maestro é uma **configuração por terminal**: existe uma caixa "Maestro" na aba
Detalhes do modal do terminal; marcá-la concede àquele agente a "skill de gerente", que expõe os
comandos de recrutamento. Um agente comum **não** consegue criar workspaces, andares nem recrutar —
isso é deliberado, para não encher o canvas de ambientes perdidos criados por qualquer agente.

No **Orkestra**, a infraestrutura equivalente já existe e está funcional — a CLI `orq` já implementa
`recruit`, `connect` e `dismiss` de ponta a ponta (cliente → servidor HTTP local → renderer →
store). O que ainda **não** existe é a camada de produto em volta: não há um "modo Maestro" como
toggle/permissão, o onboarding injetado nos agentes não menciona esses verbos, e o recrutamento não
posiciona nem conecta o recruta automaticamente. Ou seja: o **encanamento do Maestro está pronto**, o
**papel de Maestro ainda não foi montado por cima dele**.

---

## 2. Como funciona (no Maestri)

### 2.1 Ativação
O Maestro é ligado por terminal: modal de criação (ou botão direito → **Editar Terminal**) → aba
**Detalhes** → caixa **Maestro** → salvar. Ao ativar, o agente ganha acesso à skill de gerente, que
lhe expõe comandos para gerenciar a própria equipe.

### 2.2 Recrutar (recruit)
Cria um **novo terminal conectado abaixo de si mesmo**, com o agente e a responsabilidade
apropriados. Detalhes relevantes:
- Os recrutas caem no **andar (floor)** do Maestro por padrão.
- A flag `--floor` aponta para um andar específico, colocando o agente em um ambiente isolado
  (working tree própria).
- O layout é automático: os recrutas são posicionados e espaçados uniformemente **abaixo** do
  Maestro; o auto-layout roda no momento do recrutamento (mas o recruta pode ser movido depois como
  qualquer terminal).

### 2.3 Conectar (connect)
Liga um recruta recém-criado a **qualquer nota já conectada ao Maestro**, fazendo os dois
compartilharem a mesma fonte de verdade. Qualquer nota conectada ao Maestro também pode ser
encadeada a recrutas específicos e a outras notas, formando uma **cadeia de contexto**. O Maestro
cria essas conexões deliberadamente, como o humano faria. Recrutas leem e editam as notas como
qualquer agente conectado.

### 2.4 Reatribuir papel / editar prompt mid-task
O Maestro pode **trocar a responsabilidade de um recruta na hora** ou **editar as instruções da
responsabilidade** diretamente, sem recriar o terminal. Ao reatribuir:
- **Posição no canvas, nome e conexões são preservados**.
- Apenas o **processo do agente reinicia** com as novas instruções.

Um Maestro pode **criar, editar, reatribuir e remover** responsabilidades por conta própria (o
gerenciamento manual continua disponível em **Configurações → Agentes**).

### 2.5 Dispensar (dismiss)
Fecha o terminal de um recruta quando o trabalho dele termina, mantendo o canvas organizado. É o que
permite o padrão "dispense cada um conforme terminar".

### 2.6 Recrutar com modelo/agente específico por papel
Por padrão, um Maestro tende a **recrutar cópias de si mesmo**: um Maestro rodando Claude Code cria
recrutas com Claude Code; um rodando Codex cria com Codex. Mas o Maestro enxerga **todos os presets
de agente** configurados em **Configurações → Agentes**, então dá para pedir explicitamente equipes
mistas: "Monte uma equipe em que o **Codex** seja o revisor, o **Claude** seja o desenvolvedor e o
**OpenCode** seja o escritor." O Maestro recruta cada um com o preset correspondente — útil para
jogar as forças de cada ferramenta umas contra as outras.

### 2.7 Coordenação via cadeia de notas
A coordenação entre agentes não passa (só) por mensagens diretas; passa pela **cadeia de notas** do
canvas. Uma nota é a fonte de verdade compartilhada: o Maestro conecta a especificação a todos os
recrutas, e cada agente lê/edita a nota. Como as notas podem ser encadeadas entre si e ligadas a
recrutas específicos, o Maestro pode montar topologias de contexto (ex.: nota-spec → Dev; nota-spec
→ Revisor; nota-de-bugs escrita pelo Revisor → Dev).

### 2.8 Verbos exclusivos do Maestro (provisionamento por CLI)
A CLI do `maestri` expõe comandos **restritos pelas permissões de Maestro** — um agente comum não
consegue rodá-los:
- `maestri workspace create` — provisiona um novo workspace disponível para o Maestro e os recrutas.
- `maestri floor create` — provisiona um novo andar dentro do workspace atual, com working tree
  isolada.

Além do provisionamento, dentro de um recruta o `maestri list` mostra o **nome e a responsabilidade
próprios** junto com as conexões — ou seja, **o recruta sabe quem é** e quais colegas alcança.

---

## 3. Pontos interessantes / diferenciais

- **O agente age no canvas como o humano agiria.** A metáfora não é "chamar uma sub-tarefa" (como um
  sub-agente de LLM), e sim **materializar um terminal real** no mesmo canvas visual, com processo,
  posição, papel e conexões. O humano continua vendo e podendo intervir em tudo.
- **Equipe efêmera com ciclo de vida explícito.** `recruit` … trabalho … `dismiss`. O canvas não
  vira um cemitério de terminais; o Maestro limpa a própria bagunça.
- **Permissão como recurso de produto.** O gating "só Maestro provisiona workspace/floor" evita que
  qualquer agente crie ambientes perdidos. É uma decisão de UX, não só técnica.
- **Reatribuição preservando identidade.** Trocar o papel reinicia só o processo, mantendo nome,
  posição e conexões — o "cargo" do nó é estável mesmo trocando quem o ocupa.
- **Equipes heterogêneas de propósito.** Recrutar Claude como Dev e Codex como Revisor é uma feature
  intencional (adversarial: uma ferramenta pega o que a outra deixa passar).
- **Coordenação por artefato compartilhado (notas), não só por mensagem.** A cadeia de notas é
  memória durável e auditável, ao contrário de um `ask` fire-and-forget.
- **"Recrutas sabem quem são."** `maestri list` dentro de um recruta devolve identidade + conexões —
  o agente descobre o próprio papel sem o humano ter que dizer.

---

## 4. Como seria o backend (arquitetura de referência)

O padrão implícito no Maestri — e já materializado no Orkestra — é um **servidor de orquestração
local** que faz a ponte entre a CLI que roda *dentro* de cada terminal e o app que desenha o canvas.
Os componentes:

1. **Servidor de orquestração local (HTTP em loopback).** Sobe em `127.0.0.1` numa porta efêmera,
   protegido por um token aleatório por sessão. Expõe rotas para: ler o estado do canvas
   (`/list`, `/context`), mutar o canvas (`/note`, `/recruit`, `/dismiss`, `/connect`), delegar
   trabalho a outro agente (`/ask`, `/check`) e dirigir portais (`/portal/*`).

2. **Protocolo entre a CLI e o app.** Cada terminal spawnado recebe, no seu ambiente, a porta e o
   token do servidor, além do id do próprio nó no canvas. A CLI lê essas variáveis, monta as
   requisições HTTP autenticadas e traduz a resposta em texto/exit-code para o agente. O app injeta
   ainda o id do projeto dono do terminal, para **isolar comandos por projeto** (um agente de um
   projeto em segundo plano não pode mutar o canvas de outro projeto exibido).

3. **Espelho leve do canvas.** O renderer (dono do estado visual) envia periodicamente ao processo
   principal um *mirror* enxuto (id/tipo/nome/conteúdo/papel/preset + arestas). O servidor responde
   `/list` e `/context` a partir desse espelho — sem precisar acordar o renderer a cada leitura.

4. **Roteamento de mensagens e spawn de terminais/agentes.** Mutação é assimétrica de leitura:
   comandos que mudam o canvas (recruit/connect/dismiss/note/portal) são **emitidos como eventos**
   para o renderer, que é quem realmente cria/remove nós e desenha arestas (o React Flow é a fonte
   de verdade do canvas). Já `ask`/`check` roteiam direto para o **pty** do agente alvo: o servidor
   resolve *nome do nó → id do pty* e escreve no processo (ou lê o buffer recente).

5. **Detecção de ociosidade / "o agente parou".** Um barramento observa o output de cada pty; quando
   um agente fala e depois fica em silêncio por um intervalo, dispara um sinal de "atenção" (para
   notificar o humano) e um sinal de "ocupado/gerando" (para o feedback visual). Esse mesmo mecanismo
   sustenta o `ask --wait` (bloqueia até o alvo ficar ocioso e devolve o output acumulado).

6. **Camada de permissão (o "modo Maestro").** No topo disso tudo, um flag por terminal decide se
   aquele agente enxerga os verbos de gerência (recruit/connect/dismiss/reassign) e os de
   provisionamento (workspace/floor create). Sem o flag, o agente é "comum" e só participa da equipe.

---

## 5. Estado atual no Orkestra

Resumo: **o encanamento existe e é robusto; a camada de produto "Maestro" ainda não**.

### 5.1 O que já existe (com caminhos reais)

**Servidor de orquestração** — `src/main/orchestration/OrchestrationServer.ts`
- HTTP em `127.0.0.1`, porta efêmera (`listen(0, '127.0.0.1')`), token aleatório de 24 bytes
  comparado em tempo constante (`timingSafeEqual`).
- Rotas implementadas: `GET /list`, `GET /context`, `GET /check`, `GET /portal`, `POST /note`,
  `POST /recruit`, `POST /dismiss`, `POST /connect`, `POST /ask`, `POST /portal/{open,click,fill,eval}`.
- **Escopo de projeto**: header `x-orkestra-project`; se o projeto do terminal não é o ativo,
  responde `409` (fail-closed no mismatch). Também responde `503` quando não há renderer vivo (não
  mente "ok" ao agente) e `413` para corpos acima de 1 MB.
- `GET /context` monta, a partir do espelho, o conteúdo legível de todas as notas/arquivos/sites
  ligados ao nó `from` — em qualquer direção da aresta.

**Barramento de agentes** — `src/main/orchestration/AgentBus.ts`
- `ask()` escreve `prompt + '\n'` no pty; `writeRaw()` envia bytes crus (para TUIs/pagers);
  `read()` devolve o buffer recente (cap 8000 chars).
- `waitForIdle()` sustenta o `ask --wait` (resolve quando o pty fica ocioso ou estoura o teto de
  120s); acumula o delta próprio (imune à truncagem do buffer compartilhado) e resolve na hora se o
  pty morrer.
- Watchers de **atenção** (`onAttention`) e de **ocupado/gerando** (`onBusyChange`) — este último é
  o sinal real por trás do border-beam de "generating".

**CLI `orq`** — `src/orq/orq.ts` (+ `src/orq/bin.ts`, `src/orq/escapes.ts`)
- Comandos: `orq list`, `orq context`, `orq note write [--to] "<txt>"`, `orq ask "<nome>" "<prompt>"`
  (`--wait` / `--raw` / `--batch`), `orq check "<nome>"`, `orq recruit "<nome>" "<preset>" ["<papel>"]`,
  `orq dismiss "<nome>"`, `orq connect "<A>" "<B>"`, `orq portal open|navigate|click|fill|eval|snapshot`.
- Lê `ORKESTRA_PORT`/`ORKESTRA_TOKEN`/`ORKESTRA_PROJECT_ID`/`ORKESTRA_NODE_ID` do ambiente; degrada
  com mensagem amigável quando fora de um terminal do Orkestra ou sem `fetch` (Node < 18).
- `--batch`: um mesmo prompt para uma lista de nomes separados por vírgula, em sequência.

**Injeção no ambiente + onboarding** — `src/main/index.ts` e `src/main/orchestration/installOrq.ts`
- `installOrq()` copia o `orq` compilado para `~/.orkestra/bin/orq`, escreve `~/.orkestra/onboarding.txt`
  e instala um **wrapper `claude`** que injeta o onboarding via `--append-system-prompt` em toda
  invocação. O `buildEnvPath()` prefixa `~/.orkestra/bin` no PATH dos terminais.
- Cada pty nasce etiquetado com `ORKESTRA_NODE_ID` e `ORKESTRA_PROJECT_ID`
  (`src/main/pty/registerPtyIpc.ts`).

**Aplicação dos comandos no canvas (renderer)** — `src/renderer/src/hooks/useOrchestrationSync.ts`
- Envia o mirror ao main quando ele muda de fato (diff serializado — ignora só mudança de posição).
- Aplica os comandos: `recruit` → `store.addTerminalNode(...)`; `dismiss` → `removeNode`; `connect`
  → `onConnect` resolvendo *nome → nó*; `updateNote`; automação de portal.
- Guard de escopo de projeto: descarta comando cujo `projectId` não bate com o canvas exibido.

**Modelos/tipos e presets** — `src/shared/orchestration.ts`, `src/shared/presets.ts`, `src/shared/roles.ts`
- `OrchestrationCommand` já inclui `recruit`/`dismiss`/`connect`.
- Presets disponíveis: `shell`, `claude` (Claude Code), `codex` (Codex CLI), `gemini` (Gemini CLI).
- Papéis pré-definidos: **Líder**, **Dev**, **Revisor**, **Testador** (com cor/hint por papel).

### 5.2 Gaps em relação ao Maestro do Maestri

1. **Não existe o "modo Maestro" como conceito/permissão.** Não há caixa "Maestro" no modal do
   terminal nem gating: hoje **qualquer** agente com `orq` no PATH pode chamar `recruit`/`connect`/
   `dismiss`. Falta a camada de produto que distingue líder de recruta.
2. **O onboarding não ensina os verbos de gerência.** `installOrq.ts` só documenta `orq context/list/
   ask/check/portal` no `ONBOARDING` — `recruit`, `connect`, `dismiss` e `note write` **não aparecem**.
   Na prática, o encanamento existe mas o agente não é instruído a usá-lo (o usuário teria que ensinar
   na mão).
3. **`recruit` não posiciona nem conecta o recruta.** Em `useOrchestrationSync.ts`, `recruit` chama
   `addTerminalNode(undefined, {...})` — posição em cascata genérica, **sem** cair abaixo do Maestro,
   **sem** auto-layout e **sem** auto-conectar ao Maestro nem às notas dele. No Maestri, o recruta
   nasce abaixo, espaçado e conectado.
4. **Não há reatribuição de papel / edição de prompt mid-task via orq.** O store tem
   `updateTerminalRole`, mas nenhum comando `orq` (nem tipo em `OrchestrationCommand`) para o agente
   reatribuir/reprogramar um recruta e reiniciar o processo.
5. **Não há provisionamento de workspace/floor pelo agente.** O Orkestra tem **projetos**
   (equivalentes a workspaces) e não tem "andares" (working trees isoladas). Não existe `orq workspace
   create` nem `orq floor create` — o análogo aos verbos exclusivos do Maestro está ausente.
6. **O onboarding só cobre o `claude`.** O wrapper e o `--append-system-prompt` são específicos do
   Claude Code; agentes `codex`/`gemini` recebem o `orq` no PATH mas **não** o texto de onboarding.
7. **`recruit` não recruta "cópia de si mesmo" por padrão.** O preset do recruta é sempre explícito;
   não há o comportamento default do Maestri de herdar o preset do Maestro quando não especificado.
8. **`orq list` não marca "quem sou eu".** Ele lista todos os nós (tipo/nome/id), mas não destaca o
   nó do próprio agente nem seu papel/conexões — falta o equivalente ao "recrutas sabem quem são".
   O dado existe (`ORKESTRA_NODE_ID` no env), só não é exposto de forma amigável.

---

## 6. Melhorias sugeridas para o Orkestra (priorizadas por valor × esforço)

Ordem = melhor retorno primeiro (alto valor / baixo esforço no topo).

### Prioridade 1 — Alto valor, baixo esforço

- **[P1] Documentar os verbos de gerência no onboarding.** Adicionar `orq recruit`, `orq connect`,
  `orq dismiss` e `orq note write` ao `ONBOARDING` em `installOrq.ts` (best-effort, uma edição de
  string). Sem isso, 90% da funcionalidade fica invisível ao agente. *Esforço: mínimo.*
- **[P1] `recruit` posicionar abaixo do Maestro e auto-conectar.** Passar a posição do nó `from` no
  comando `recruit` (o servidor já tem o mirror) e, no renderer, criar o recruta abaixo/espaçado e
  chamar `onConnect(maestro → recruta)`. Isso reproduz o comportamento-chave do Maestri e transforma
  `recruit` numa ação de fato útil. *Esforço: baixo/médio.*
- **[P1] `orq whoami` (ou `orq list --me`).** Expor nome/papel/conexões do próprio nó a partir de
  `ORKESTRA_NODE_ID`. Baixo esforço (o servidor já tem tudo no mirror) e desbloqueia o padrão
  "recrutas sabem quem são". *Esforço: baixo.*

### Prioridade 2 — Alto valor, esforço médio

- **[P2] Modo Maestro como toggle por terminal + gating.** Adicionar `data.maestro` ao nó terminal
  (store + modal de criação/edição) e injetar um **onboarding estendido** (com os verbos de gerência)
  só quando ligado. Gating leve: o servidor pode recusar `recruit/connect/dismiss` de um nó não-Maestro
  (o mirror já traz o nó de origem via `from`). Materializa o conceito de produto. *Esforço: médio.*
- **[P2] Reatribuir papel / reprogramar recruta mid-task.** Novo comando `orq reassign "<nome>"
  "<papel>"` → tipo `reassign` em `OrchestrationCommand` → `updateTerminalRole` + reinício do pty,
  **preservando** posição/nome/conexões (exatamente a semântica do Maestri). *Esforço: médio.*
- **[P2] Recrutar cópia de si mesmo por padrão.** Quando `recruit` vier sem preset, herdar o preset
  do nó `from` (disponível no mirror). Alinha com o comportamento default do Maestri. *Esforço: baixo,*
  *depende do P1 de posicionamento (passar o `from`).*

### Prioridade 3 — Valor alto, esforço maior (ou dependente de decisão de escopo)

- **[P3] Andares (floors) / working trees isoladas.** Trazer o conceito de ambiente isolado por
  recruta (git worktree por andar) e `orq floor create` — restrito ao Maestro. É a peça que falta para
  equipes trabalharem em paralelo sem pisar umas nas outras, mas mexe em modelo de dados e integração
  com git. *Esforço: alto.*
- **[P3] Onboarding multi-agente (Codex/Gemini).** Generalizar o wrapper/onboarding para além do
  `claude` — cada CLI tem sua própria flag de system-prompt (ou fallback via arquivo de contexto).
  Necessário se equipes mistas (Claude Dev + Codex Revisor) forem um objetivo real. *Esforço: médio/alto.*
- **[P3] `orq recruit --batch` / template de equipe.** Um comando (ou um preset de "esquadrão") que
  monta Dev+Revisor+Testador+Docs de uma vez, já conectados à nota-spec — encapsula o exemplo
  canônico da doc do Maestro numa ação. *Esforço: médio.*

---

## 7. Referência

### 7.1 Documentação do Maestro (Maestri) — transcrição integral
Fonte: <https://www.themaestri.app/pt-br/docs/maestro>

> **Modo Maestro**
>
> "O Modo Maestro promove um terminal de um agente comum para um **gerente** — capaz de recrutar
> novos agentes no seu canvas, atribuir papéis a eles, conectá-los às notas certas e dispensá-los
> quando o trabalho terminar." Transforma um agente líder em ponto de partida de uma equipe montada
> sob demanda.
>
> **Ativando o Maestro** — O Maestro é uma configuração por terminal. Para ativar: (1) Abra o modal
> de criação do terminal (ou clique com o botão direito em um terminal existente → **Editar
> Terminal**). (2) Marque a caixa **Maestro** na aba **Detalhes**. (3) Salve. Uma vez ativado, o
> agente dentro do terminal ganha acesso à skill de gerente, expondo comandos para gerenciar sua
> própria equipe.
>
> **O que um Maestro pode fazer** — Um Maestro age no canvas conforme você agiria, mas pelo próprio
> agente:
> - **Recrutar** — Cria novo terminal conectado abaixo de si mesmo, com agente e responsabilidade
>   apropriados. Os recrutas caem no andar do Maestro por padrão, mas `--floor` aponta para andar
>   específico, colocando agente em ambiente isolado.
> - **Conectar** — Liga novo recruta a qualquer nota já conectada ao Maestro, compartilhando mesma
>   fonte de verdade.
> - **Reatribuir responsabilidades e ajustar prompts** — Troca responsabilidade de recruta na hora
>   ou edita instruções da responsabilidade diretamente. Posição no canvas, nome e conexões
>   preservados; apenas processo do agente reinicia com novas instruções.
> - **Dispensar** — Fecha terminal de recruta quando trabalho termina, mantendo canvas organizado.
>
> *Exemplo de prompt para Maestro:* "Monte uma pequena fábrica de software: um Desenvolvedor para
> entregar a feature, um Revisor para pegar regressões, um Testador para escrever cobertura e um
> Redator de Docs para atualizar o changelog. Conecte todos eles à nota de especificação e dispense
> cada um conforme terminar."
>
> Um Maestro pode criar, editar, reatribuir e remover responsabilidades. Gerenciamento manual ainda
> disponível em **Configurações → Agentes**.
>
> **Provisionando workspaces e andares pelo CLI** — Um Maestro pode criar próprio contêiner para
> equipe. CLI do `maestri` expõe comandos restritos pelas permissões de Maestro:
> - `maestri workspace create` — provisiona novo workspace disponível para Maestro e recrutas.
> - `maestri floor create` — provisiona novo andar dentro do workspace atual com working tree
>   isolada.
>
> Esses comandos exigem permissões de Maestro; agente comum não consegue criar workspaces ou andares
> por conta própria. Isso evita canvas preenchido com ambientes perdidos, deixando agente líder
> montar estrutura necessária.
>
> **Escolhendo o agente** — Um Maestro enxerga os mesmos presets de agente vistos no modal de
> terminal — todos os agentes de código configurados em **Configurações → Agentes** ficam
> disponíveis. Por padrão, Maestro tende recrutar cópias de si mesmo: um Maestro rodando Claude Code
> cria recrutas com Claude Code; um rodando Codex cria com Codex. Contornando padrão: "Monte uma
> equipe em que o **Codex** seja o revisor, o **Claude** seja o desenvolvedor e o **OpenCode** seja o
> escritor." Maestro recruta cada um com preset correspondente. Equipes com agentes mistos úteis para
> jogar forças de cada ferramenta umas contra as outras.
>
> **Layout** — Recrutas posicionados automaticamente, espaçados uniformemente abaixo do Maestro.
> Auto-layout roda no momento do recrutamento. Recrutas podem ser movidos manualmente como qualquer
> terminal.
>
> **Compartilhando contexto via notas** — Qualquer nota conectada ao Maestro pode ser ligada a
> recrutas específicos e outras notas, formando cadeia. Maestro cria conexões deliberadamente
> conforme você faria. Recrutas leem e editam notas do mesmo jeito que qualquer agente conectado —
> veja seções Notas e Conexões.
>
> **Recrutas sabem quem são** — Dentro de recruta, `maestri list` mostra nome e responsabilidade
> próprios junto com conexões, permitindo agente saber qual papel usa e quais colegas alcança.
>
> *Dica:* combine Modo Maestro com responsabilidades bem definidas em **Configurações → Agentes**.
> Quanto mais claras responsabilidades, mais fácil recrutar específicos.

### 7.2 Arquivos do Orkestra citados nesta análise
- `src/main/orchestration/OrchestrationServer.ts` — servidor HTTP local (rotas, auth, escopo de projeto).
- `src/main/orchestration/AgentBus.ts` — ask/waitForIdle, watchers de atenção e "busy".
- `src/main/orchestration/installOrq.ts` — instalação do `orq`, onboarding e wrapper `claude`.
- `src/main/orchestration/envPath.ts` — montagem do PATH dos terminais.
- `src/main/index.ts` — fiação do servidor + AgentBus + injeção de env.
- `src/main/pty/registerPtyIpc.ts` — etiquetagem do pty (`ORKESTRA_NODE_ID`, `ORKESTRA_PROJECT_ID`).
- `src/orq/orq.ts`, `src/orq/bin.ts`, `src/orq/escapes.ts` — a CLI `orq` usada pelos agentes.
- `src/renderer/src/hooks/useOrchestrationSync.ts` — envio do mirror e aplicação dos comandos no canvas.
- `src/renderer/src/components/AskAgentPanel.tsx` — painel "Perguntar ao agente" (ask pela UI).
- `src/renderer/src/store/canvasStore.ts` — `addTerminalNode`, `updateTerminalRole`, `removeNode`, `onConnect`.
- `src/shared/orchestration.ts` — tipos `OrchestrationCommand`, `CanvasMirror`.
- `src/shared/presets.ts` — presets (`shell`, `claude`, `codex`, `gemini`).
- `src/shared/roles.ts` — papéis (Líder, Dev, Revisor, Testador).
