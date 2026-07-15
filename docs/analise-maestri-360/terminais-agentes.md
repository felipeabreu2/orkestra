# Terminais e Agentes — Análise 360° (Maestri → Orkestra)

> Documento de referência produzido a partir de duas fontes reais: (1) a documentação
> oficial do Maestri em `https://www.themaestri.app/pt-br/docs/terminals` e (2) o código
> atual do Orkestra (`src/main`, `src/renderer/src`, `src/shared`, `src/orq`, `src/preload`).
> O objetivo é entender integralmente como o Maestri trata "Terminais e Agentes", comparar
> com o que o Orkestra já implementa e propor melhorias concretas.

---

## 1. Visão geral

No Maestri, o **terminal** não é um painel acessório — é o lugar central onde o trabalho
acontece. Cada terminal é um **shell interativo completo**, e quando um agente de código
(Claude Code, Codex, Gemini etc.) roda dentro dele, o terminal vira a superfície principal
de execução: você digita, o agente digita, e ambos operam sobre o mesmo TTY. A ideia de
produto é permitir orquestrar **vários agentes em paralelo** sobre um canvas espacial, cada
um num terminal com nome, ícone e um **papel/responsabilidade** próprio.

O Orkestra segue exatamente a mesma filosofia: um canvas visual (React Flow) onde cada nó
`terminal` é um `xterm.js` ligado a um PTY real no processo main (Electron), com presets de
agente (`shell`, `claude`, `codex`, `gemini`), papéis visuais, indicador de "atenção" quando
o agente fica ocioso, notificação do SO, temas tema-aware e um sinal de "gerando"
(border-beam). A orquestração entre agentes existe via um servidor HTTP local (`orq`), o
análogo do CLI `maestri`.

Em resumo, os dois produtos convergem no conceito. As diferenças estão nos **detalhes de
implementação e no alcance de alguns recursos** (papéis que injetam instruções vs. papéis
puramente visuais, catálogo de temas de terminal, ícones por terminal, portabilidade de
papéis via sidecar), detalhadas nas seções 5 e 6.

---

## 2. Como funciona (conforme a documentação do Maestri)

### 2.1 Criando um terminal (shell + agente)

No Maestri, o fluxo é:

1. Selecionar a ferramenta **Terminal** na barra de ferramentas superior.
2. Clicar e arrastar no canvas para desenhar o terminal no tamanho desejado.
3. Um **modal** aparece para escolher um agente de código a partir de uma lista de
   predefinições (presets).

O Maestri **espera que os agentes já estejam instalados** na máquina — ele não instala
Claude Code/Codex por você; apenas os invoca. Cada terminal pode receber um **nome** e um
**ícone** para facilitar a identificação quando há muitos no canvas.

Ponto conceitual importante: um terminal é sempre um **shell**; o "agente" é apenas um
programa (CLI) que roda dentro desse shell. Isso é o que permite que o mesmo terminal sirva
tanto para você digitar comandos quanto para hospedar um agente.

### 2.2 Papéis / Responsabilidades (nome + badge + instruções)

"Responsabilidades" (papéis/roles) são o recurso mais rico da doc. Cada responsabilidade tem
**três atributos**: um **nome**, um **badge colorido** e um **conjunto de instruções**.

- Quando uma responsabilidade é atribuída a um terminal, o Maestri **injeta automaticamente
  essas instruções quando o agente inicia** — você não precisa repetir o mesmo prompt de
  contexto a cada sessão.
- Exemplos de papéis citados na doc:
  - **Líder** — coordenador que delega para os outros;
  - **Desenvolvedor** — foca puramente na implementação;
  - **Revisor** — revisa e critica o código;
  - **Testador** — foca em escrever e executar testes.

**Gerenciamento**: em **Configurações → Agentes** dá para criar, editar e organizar
responsabilidades. Atribui-se uma responsabilidade ao criar o terminal ou depois via clique
com o botão direito.

**Mecânica de injeção**: o Maestri inicia o agente em um **subdiretório do projeto** com seu
próprio `CLAUDE.md` / `AGENTS.md`, de modo que cada agente ganha instruções únicas. Ao lado
desses arquivos ele grava um **sidecar portátil `role.json`** descrevendo a responsabilidade
(nome, cor do badge e prompt), para que o papel **viaje com o diretório** entre workspaces e
entre máquinas.

**Descoberta**: na tela **Editar** de um terminal local existe um botão **Descobrir
Responsabilidades**, que varre o diretório de trabalho atrás de arquivos `role.json` e
permite importá-los (útil quando você faz checkout de uma branch de um colega que traz sua
própria pasta `.maestri`). Há prévia de cada papel descoberto e seleção múltipla.

**Exclusão**: os cards de responsabilidade suportam **clique direito → Excluir
Responsabilidade** com confirmação.

**Leitura/edição pela CLI** (`maestri`): agentes conectados podem ler e editar papéis:

- `maestri role show "Nome"` — imprime o prompt do papel;
- `maestri role write "Nome" "novo prompt"` — substitui o prompt inteiro;
- `maestri role edit "Nome" "texto antigo" "texto novo"` — substitui uma substring.
- `maestri list` mostra o papel atribuído de cada agente, para que os agentes saibam "com
  quem estão falando".

### 2.3 Indicador de atenção quando o agente fica ocioso + notificação do SO

Quando um terminal **para de produzir saída** — normalmente porque o agente terminou o turno
ou está esperando uma decisão — o Maestri marca o cabeçalho com um **ponto vermelho de
atenção**. O atalho **⇧A** no canvas pula para o próximo terminal com atenção pendente,
percorrendo todos os "andares" (workspaces).

Para quando você não está olhando o canvas, existe **Configurações → Notificações → Notificar
quando um agente precisa de atenção**: o Maestri passa a postar uma **notificação do sistema**
sempre que um terminal acende o ponto — mesmo com o app em primeiro plano. Clicar na
notificação **foca o terminal correspondente**, trocando de workspace/andar automaticamente
se necessário.

### 2.4 Navegação entre terminais (teclado)

Com muitos terminais, a navegação por teclado é essencial: segurando uma tecla modificadora,
um **badge numerado** aparece no cabeçalho de cada terminal, e pressionar o número foca aquele
terminal imediatamente. A doc afirma que dá para alternar entre **9 agentes** quase
simultaneamente sem tocar no mouse.

### 2.5 Ícones e nomes

Além do nome, cada terminal pode ter um **ícone** — puramente para identificação visual quando
há muitos nós no canvas.

### 2.6 Temas de terminal

O Maestri traz quatro cards de tema em **Configurações → Terminal → Aparência**: **Sistema**,
**Escuro**, **Claro** e **Personalizado**.

- O card **Personalizado** abre um seletor em tela cheia com **mais de 30 esquemas de cores
  embutidos** derivados do projeto *iTerm2 Color Schemes* — Dracula, Catppuccin, Tokyo Night,
  Gruvbox, Nord, One Dark, Solarized, Rosé Pine, Everforest e outros. Cada esquema carrega
  dados completos (cor do texto do cursor, fundo/texto da seleção etc.), e **terminais SSH
  também respeitam** o tema.
- **Seguir aparência do sistema**: emparelha um tema claro com um escuro e alterna
  automaticamente quando o macOS troca de modo.
- **Temas próprios**: qualquer arquivo no formato **Ghostty** colocado em
  `~/.maestri/terminal/themes/` aparece no seletor em "Da sua pasta", sem reiniciar.

### 2.7 Teclas brutas / `--raw` para TUIs

Alguns TUIs interativos e pagers precisam de **sequências de controle brutas** que o
`maestri ask` comum não entrega. A flag **`--raw`** envia bytes diretos para um terminal
conectado:

- `maestri ask "Agente" --raw "<bytes>"` — envia teclas brutas, permitindo controlar TUIs e
  pagers (`less`, `vim`, `htop`, ou qualquer coisa que leia de um TTY real) a partir de outro
  agente ou do shell.

### 2.8 Remoção de terminal

Selecionar o terminal e pressionar **⌘W** fecha o terminal e o remove do canvas.

---

## 3. Pontos interessantes / diferenciais

- **Papel = comportamento, não só rótulo.** O grande diferencial do Maestri é que a
  responsabilidade **injeta instruções reais no agente** ao iniciar (via `CLAUDE.md`/`AGENTS.md`
  em subdiretório), em vez de ser apenas um badge decorativo. Isso transforma "papel" de
  metadado visual em **configuração de comportamento**.
- **Portabilidade do papel via `role.json` (sidecar).** Gravar o papel ao lado do código faz
  a configuração viajar com o repositório entre máquinas e colegas — e o botão **Descobrir
  Responsabilidades** fecha o ciclo, importando papéis que chegam junto de uma branch.
- **CLI simétrica para papéis** (`role show/write/edit`): o próprio agente pode **refinar a
  própria responsabilidade entre execuções**, sem sair do terminal. É auto-modificação
  controlada de contexto.
- **Atenção + notificação do SO com foco de retorno.** Não basta acender um ponto: clicar na
  notificação **navega até o terminal exato**, trocando de workspace/andar. Fecha o loop entre
  "algo mudou" e "estou olhando para a coisa que mudou".
- **`--raw` para TUIs.** Reconhecer que um agente às vezes precisa pilotar `vim`/`less`/`htop`
  (não só mandar linhas de texto) é um detalhe de maturidade — envia bytes de controle crus,
  sem o `\n` que o `ask` normal adiciona.
- **Catálogo de temas de terminal de primeira classe.** 30+ esquemas iTerm2, suporte a arquivos
  Ghostty do usuário e pareamento claro/escuro que segue o SO — trata o terminal como algo que
  o usuário quer *customizar de verdade*, inclusive em sessões SSH.
- **Navegação por teclado para N agentes** (badge numerado ao segurar modificador + ⇧A para
  ciclar atenção): projetado para quem realmente roda muitos agentes ao mesmo tempo.

---

## 4. Como seria o backend

Esta seção descreve a arquitetura de backend que sustenta "terminais e agentes" — e que o
Orkestra de fato já implementa (ver seção 5 para os caminhos reais).

### 4.1 PTY (pseudo-terminal) e `node-pty`

Um terminal interativo exige um **pseudo-terminal (PTY)**: um par mestre/escravo em que o
processo filho (o shell, e dentro dele o agente) enxerga um TTY real — com `cols`/`rows`,
sinais de controle e ANSI. Em Electron, isso vive no **processo main** (Node), porque o
renderer não pode fazer `spawn` de processos. A biblioteca padrão é **`node-pty`**, que expõe
`spawn(file, args, { cwd, env, cols, rows })` e eventos `onData`/`onExit`, além de
`write`/`resize`/`kill`.

O front-end (renderer) usa **`xterm.js`** para emular o terminal na tela: ele recebe os bytes
do PTY (`onData` → `term.write`) e envia o teclado de volta (`term.onData` → `pty.write`),
mais `resize` bidirecional. O PTY roda no main; o xterm roda no renderer; a ponte é IPC.

### 4.2 Batching de dados (throughput de IPC)

Um agente gerando saída produz **muitos chunks pequenos** por segundo. Emitir uma mensagem IPC
por chunk sobrecarrega a ponte main↔renderer. A solução é um **batcher**: acumula os chunks de
cada PTY e faz **flush em lote (~1 frame, ~16ms)**, mandando strings maiores e menos vezes. O
renderer continua recebendo `(id, string)` — só com menos mensagens. No **exit** do PTY é
preciso um **flush imediato** para não perder o final do output (o processo pode morrer em menos
de um frame após o último chunk).

### 4.3 Ciclo de vida do processo

- **Spawn**: cria o PTY com `cwd` do projeto ativo, `env` herdado + extras (porta/token da
  orquestração, id do nó, id do projeto), `cols`/`rows` do xterm. Para presets de agente,
  digita-se o comando do CLI (`claude`, `codex`, …) no **primeiro chunk de output** do shell
  (quando o rc já carregou) — abrir o CLI não consome tokens, só manda prompt consome.
- **Scrollback + re-attach**: guardar um **buffer de saída por PTY** (com teto, p.ex. 256 KB,
  descartando o começo) permite **reanexar** o mesmo PTY quando o nó desmonta e remonta (troca
  de projeto, suspensão por viewport) sem reiniciar o processo — o agente/build continua de onde
  parou, e o xterm é reidratado com o scrollback.
- **Kill**: por `ptyId` (fechar) ou por `nodeId` (remover o nó do canvas), além de `killAll` ao
  fechar o app. A troca de projeto **não** mata o PTY (ele sobrevive para re-attach); só a
  remoção explícita do nó ou o fechamento do app o encerram.
- **SSH**: um terminal remoto é apenas um PTY cujo processo é `ssh <host>` em vez do shell local
  — validado no main (allowlist de host) e nunca concatenado como string (sem injeção de shell).

### 4.4 Detecção de ociosidade (atenção) e de "gerando"

Há **duas heurísticas distintas**:

1. **Atenção / ociosidade "o agente parou"**: um watcher observa o `onData` de cada PTY
   rastreado; a cada chunk reagenda um timer de ociosidade (p.ex. ~1200ms). Se **nenhum novo
   chunk** chegar dentro dessa janela, dispara `onAttention(ptyId)` — o main resolve
   `ptyId → nodeId`, avisa o renderer (ponto de atenção) e, se a janela **não** estiver em
   foco, posta uma **notificação do SO**. Um `clearAttention` (disparado quando o usuário foca
   o terminal) cancela o disparo pendente e exige novo output para reavisar.

2. **"Gerando" (border-beam)**: detectar que o agente está *ativamente* gerando é mais difícil,
   porque a TUI do Claude Code (Ink) **repinta a barra de status mesmo ociosa** (cursor
   piscando), então "silêncio no stream" quase nunca acontece — heurísticas baseadas em
   silêncio ficam **presas ligadas**. A abordagem robusta abandona "silêncio" e detecta por
   **conteúdo da tela**: varre as linhas **visíveis** do buffer do xterm procurando um marcador
   que só aparece enquanto o agente gera (no Claude Code, o texto `esc to interrupt` na linha de
   status). Quando o agente termina, a tela re-renderiza e o marcador some. A varredura é
   **throttled** (cadência fixa ~150ms), não debounce — sob streaming contínuo um debounce
   nunca dispararia.

---

## 5. Estado atual no Orkestra

Comparação item a item, citando os arquivos reais.

### 5.1 Criação de terminal (shell + agente) — **existe**

- Modal de criação: `src/renderer/src/components/NewTerminalModal.tsx` — escolha de preset
  (Início rápido), nome editável, aba "Detalhes"/"Aparência", checkbox **"Monitorar
  atividade"** e seleção de **papel** (segmented deslizante). Cria o nó via
  `addTerminalNode(...)` do store.
- Presets: `src/shared/presets.ts` — `shell` (sem comando), `claude` (`claude`), `codex`
  (`codex`), `gemini` (`gemini`). Ícones por preset via Lucide em `NewTerminalModal.tsx`
  (`SquareTerminal`/`Sparkles`/`Code2`/`Gem`), **não logotipos de terceiros**.
- Nó do canvas: `src/renderer/src/components/TerminalFlowNode.tsx` (cabeçalho, nome editável,
  badges, botões maximizar/fechar, footer com a pasta ativa) que embute
  `src/renderer/src/components/TerminalNode.tsx` (o `xterm.js` de fato).
- Auto-início do CLI: `TerminalNode.tsx` calcula `initialCommand` a partir do preset; o main
  o injeta no primeiro output (ver `PtyManager.spawn` em `src/main/pty/PtyManager.ts`, bloco
  `initialCommand`). O wrapper `~/.orkestra/bin/claude` é resolvido por **caminho absoluto**
  em `src/main/pty/registerPtyIpc.ts` (para injetar onboarding sem depender do `PATH`).

### 5.2 Papéis / Responsabilidades — **parcial (só visual)**

- Modelo de papéis: `src/shared/roles.ts` — `PRESET_ROLES` (`Líder`, `Dev`, `Revisor`,
  `Testador`), cada um com `label`, `color` (accent de papel, `--accent`/`--paper-*`) e `hint`.
  `roleMeta(role)` resolve por id ou label.
- Exibição: `TerminalFlowNode.tsx` mostra o papel como **badge** (`ork-role-badge`) e alimenta
  `--role-color` para a barra de accent do header. O seletor inline de papel foi **removido do
  header** (2026-07-15); o papel agora se define pela Command Palette ("Definir papel de X").
- Definição por Command Palette: `src/renderer/src/components/CommandPalette.tsx`
  (`setTerminalRole` → `updateTerminalRole` do store, `src/renderer/src/store/canvasStore.ts`).
- **Gap crítico**: no Orkestra o papel é **puramente visual** — o próprio comentário em
  `TerminalFlowNode.tsx` diz "Papel do agente — metadado visual (sem efeito no LLM)". **Não há
  injeção de instruções** no agente, **não há** `CLAUDE.md`/`AGENTS.md` por papel, **não há**
  sidecar `role.json`, **não há** "Descobrir Responsabilidades", e o `orq` **não tem** os
  comandos `role show/write/edit` (ver `src/orq/orq.ts` — os comandos são `list`, `context`,
  `note write`, `ask`, `check`, `recruit`, `dismiss`, `connect`, `portal`). O `recruit` aceita
  um `"<papel>"` opcional (`src/shared/orchestration.ts`, `useOrchestrationSync.ts`), mas ele
  também só vira badge.

### 5.3 Atenção quando o agente fica ocioso + notificação do SO — **existe**

- Watcher de ociosidade: `src/main/orchestration/AgentBus.ts` — `track(ptyId)` reagenda um timer
  a cada `onData`; após `DEFAULT_ATTENTION_IDLE_MS` (1200ms) de silêncio dispara `onAttention`.
  `clearAttention(ptyId)` cancela o disparo pendente.
- Fio até o SO: `src/main/index.ts` — no callback `onAttention`, resolve `ptyId → nodeId`
  (`PtyManager.nodeForPty`), envia `agent:attention` ao renderer e, se a janela **não** está em
  foco, dispara `new Notification({ title: 'Agente ocioso', … })`. Respeita
  `data.monitor === false` (checkbox "Monitorar atividade") para silenciar por terminal.
- Preload/IPC: `src/preload/index.ts` — `onAgentAttention` / `clearAgentAttention`.
- Renderer: `TerminalFlowNode.tsx` lê `attention.has(id)` do store e mostra `ork-node-attention`
  (ponto/dot de atenção) + estado `needsInput`; `onFocusCapture` limpa a atenção ao usar o
  terminal. Navegação **⇧A** para ciclar entre nós com atenção: `src/renderer/src/components/
  Canvas.tsx` (`attentionCycleRef`, handler `Shift+A`).
- **Gap**: a doc do Maestri diz que clicar na **notificação** foca o terminal correspondente
  (trocando de workspace). No Orkestra a notificação é informativa; não há handler de clique que
  navegue até o nó. (⇧A cobre a navegação dentro do app, mas não a partir da notificação.)

### 5.4 Sinal "gerando" (border-beam) — **existe (por conteúdo da tela)**

- Detector: `src/renderer/src/terminal/generatingSignal.ts` — `WORKING_MARKER = /esc to
  interrupt/i` e `screenIsGenerating(visibleLines)`.
- Varredura: `TerminalNode.tsx` lê as linhas **visíveis** do buffer do xterm a cada chunk,
  throttled a `GENERATING_SCAN_THROTTLE_MS` (150ms), e grava em `generating` do store
  (`setGenerating`). `TerminalFlowNode.tsx` mapeia para o estado `generating`
  (`src/renderer/src/components/nodeState.ts` → classe `is-generating` / border-beam em
  `nodes.css`).
- Histórico relevante: as duas tentativas anteriores (timer fixo de 500ms; watcher `busy` do
  AgentBus com `idleMs`, via `onBusyChange`/`onAgentBusy` em `AgentBus.ts`/`preload`) ficavam
  **presas ligadas** por repaints ociosos da TUI. O plumbing `onAgentBusy` continua no código,
  porém **dormente** (ver comentário em `Canvas.tsx`).

### 5.5 Ícones e nomes — **parcial**

- **Nome**: existe (`updateTerminalName`, input no header, default = label do preset).
- **Ícone por preset**: existe no modal (Lucide). **Gap**: **não** existe ícone *por terminal*
  escolhível pelo usuário como no Maestri — o ícone é derivado do preset, não um atributo
  editável do nó (`addTerminalNode` aceita `preset`, `name`, `monitor`, `role`, `sshHost`, mas
  não `icon`).

### 5.6 Temas de terminal — **parcial (só tema do app)**

- Tema tema-aware: `src/renderer/src/terminal/xtermTheme.ts` (`xtermThemeFromTokens`) deriva o
  `ITheme` do xterm dos tokens de design do app (`--term-bg`/`--term-fg`/`--accent`/`--paper-*`
  etc.), reaplicado a cada flip de `data-theme` via `MutationObserver` em `TerminalNode.tsx`
  (sem recriar o terminal — preserva pty/scrollback/foco).
- **Gap**: **não** há catálogo de esquemas (Dracula/Nord/…), nem seletor "Personalizado", nem
  suporte a temas Ghostty do usuário, nem pareamento claro/escuro configurável independente do
  app. O terminal segue **apenas** o tema (claro/escuro) do Orkestra.

### 5.7 Teclas brutas / `--raw` para TUIs — **existe**

- CLI: `src/orq/orq.ts` — `orq ask "<nome>" "<prompt>" --raw` envia bytes **sem** `\n` final.
- Interpretação de escapes: `src/orq/escapes.ts` (`interpretEscapes`) reconhece `\x03` (Ctrl+C),
  `\e[B` (seta), `\r`, `\n`, `\t`, `\0` etc. — o resto fica literal, nunca lança.
- Backend: `AgentBus.writeRaw(ptyId, data)` escreve no pty exatamente como recebido (ao
  contrário de `ask`, que acrescenta `\n`).

### 5.8 Remoção e ciclo de vida — **existe**

- Remoção: botão `×` no header (`TerminalFlowNode.tsx` → `removeNode`) e limpeza de `attention`
  no store (`canvasStore.ts`). (O Orkestra não usa ⌘W para isso, ao contrário do Maestri.)
- PTY manager: `src/main/pty/PtyManager.ts` — mapa `ptyByNode`, buffer por pty (`MAX_BUFFER`
  256 KB) para re-attach, `kill`/`killByNode`/`killAll`, sobrevivência à troca de projeto.
- Spawner: `src/main/pty/nodePtySpawner.ts` (`node-pty`), shell padrão por plataforma em
  `src/main/pty/shell.ts` (Windows `ComSpec`; POSIX `$SHELL`).
- Batching: `src/main/pty/PtyDataBatcher.ts` (flush ~16ms, `flushOne` no exit), instanciado em
  `registerPtyIpc.ts`.
- Re-attach: `pty:attach` em `registerPtyIpc.ts` devolve `{ ptyId, buffer }`; `TerminalNode.tsx`
  reidrata o xterm ao remontar.
- SSH: `sshHost` validado em `registerPtyIpc.ts` (`isValidSshHost`, `src/shared/ssh.ts`) → mapeado
  para `file:'ssh', args:[host]`; badge `SSH` no header.

### 5.9 Resumo dos gaps

| Recurso Maestri | Orkestra | Situação |
| --- | --- | --- |
| Shell + agente por preset | Sim | Paridade |
| Papel = **injeção de instruções** no agente | Só badge visual | **Gap crítico** |
| Sidecar `role.json` + "Descobrir Responsabilidades" | Ausente | **Gap** |
| CLI `role show/write/edit` | Ausente (`orq` não tem) | **Gap** |
| `maestri list` mostra papel | `orq list` expõe `role` no mirror | Parcial |
| Ponto de atenção + notificação SO | Sim | Paridade |
| Clique na notificação foca o terminal | Ausente | **Gap** |
| Navegação por teclado (⇧A / número) | ⇧A existe; badge numérico não | Parcial |
| Ícone por terminal | Só ícone por preset | **Gap** |
| Catálogo de temas de terminal (iTerm2/Ghostty) | Só tema do app | **Gap** |
| `--raw` para TUIs | Sim (`orq ask --raw`) | Paridade |
| Sinal "gerando" (border-beam) | Sim (por conteúdo) | Diferencial próprio |
| Re-attach / sobrevivência à troca de projeto | Sim | Diferencial próprio |
| SSH remoto | Sim | Paridade |

---

## 6. Melhorias sugeridas para o Orkestra

Priorizadas por **valor × esforço** (P1 = maior valor/menor esforço primeiro).

### P1 — Papel que realmente injeta instruções no agente (alto valor, esforço médio)

O maior gap funcional. Hoje o papel é só um badge. Proposta:

- Estender `Role` (`src/shared/roles.ts`) com um campo `prompt`/`instructions`.
- No auto-início do agente (`PtyManager.spawn` / `registerPtyIpc.ts`), quando houver papel,
  injetar as instruções — de forma pragmática, digitando um "system/context prompt" logo após
  o CLI abrir, **ou** (mais fiel ao Maestri) gravando um `CLAUDE.md`/`AGENTS.md` num
  subdiretório de trabalho do terminal e apontando o `cwd` para lá.
- Ganho: papéis deixam de ser cosméticos e passam a moldar o comportamento do agente — que é a
  premissa central da orquestração multi-agente.

### P2 — Clique na notificação do SO foca o terminal (alto valor, baixo esforço)

Hoje a notificação (`src/main/index.ts`) é informativa. Adicionar um handler de `click` na
`Notification` que (a) traz a janela ao foco e (b) envia um IPC ao renderer para
enquadrar/selecionar o `nodeId` correspondente (reutilizando o mesmo `fitView` já usado no
maximizar). Reaproveita todo o pipeline `ptyId → nodeId` que já existe.

### P3 — Catálogo de temas de terminal (valor médio-alto, esforço médio)

Adicionar um seletor "Personalizado" com alguns esquemas embutidos (Dracula, Nord, Tokyo
Night, Gruvbox…) que sobrescrevam os tokens usados por `xtermThemeFromTokens`
(`src/renderer/src/terminal/xtermTheme.ts`). Como a ponte de tema já existe (o
`MutationObserver` reaplica sem recriar o terminal), o trabalho é sobretudo: (1) uma fonte de
dados de esquemas, (2) um card em Configurações, (3) persistência da escolha. Suporte a arquivos
Ghostty do usuário pode ser uma fase 2.

### P4 — CLI de papéis no `orq` + portabilidade `role.json` (valor médio, esforço médio)

Depende do P1 (papel com prompt). Acrescentar em `src/orq/orq.ts`:

- `orq role show "Nome"`, `orq role write "Nome" "prompt"`, `orq role edit "Nome" "antigo"
  "novo"` — simétrico ao Maestri, permitindo ao próprio agente refinar seu papel.
- Gravar/ler um sidecar `role.json` no `cwd` do terminal e um comando/varredura "Descobrir
  papéis" para importar papéis que chegam com uma branch. Fecha o ciclo de portabilidade.

### P5 — Ícone por terminal (valor médio, baixo esforço)

Adicionar `icon` como atributo editável do nó terminal (aceito em `addTerminalNode`, guardado em
`data.icon`, escolhível no `NewTerminalModal` e no header). Já existe o componente `Icon`
(Lucide) e o padrão de picker segmentado — é sobretudo UI + persistência.

### P6 — Badge numérico ao segurar modificador (valor médio, esforço baixo-médio)

Complementa o ⇧A já existente: ao segurar uma tecla (ex.: Shift), mostrar um badge numerado no
header de cada terminal e focar via número — o "salto para 9 agentes" do Maestri. O Orkestra já
tem atalhos `Shift+1/2/M` em `Canvas.tsx`, então a infraestrutura de teclado está pronta; falta o
overlay de badges e o mapeamento número→nó.

### P7 — Unificar/limpar o plumbing `onAgentBusy` dormente (baixo valor, baixo esforço; higiene)

O caminho `onBusyChange`/`onAgentBusy` (`AgentBus.ts`, `main/index.ts`, `preload`, `Canvas.tsx`)
está **dormente** desde que o sinal "gerando" passou a ser por conteúdo. Decidir entre remover o
código morto ou documentá-lo explicitamente como reserva — evita confusão de manutenção futura.

### Considerações de esforço

- **P2** e **P5** são "quick wins" (baixo esforço, valor visível).
- **P1** é o item de maior impacto no produto (transforma a orquestração), mas exige decisão de
  arquitetura (injeção por prompt vs. `CLAUDE.md` em subdiretório) e cuidado com consumo de
  tokens/idempotência.
- **P4** só faz sentido depois do **P1**.

---

## 7. Referência

**Fonte primária (Maestri):**

- Documentação oficial — "Terminais e Agentes": `https://www.themaestri.app/pt-br/docs/terminals`
  (transcrita e analisada na seção 2).

**Fontes de código (Orkestra) — caminhos reais consultados:**

- Backend / PTY:
  - `src/main/pty/PtyManager.ts` — gestão de PTYs, mapa `ptyByNode`, buffer/re-attach, kill.
  - `src/main/pty/PtyDataBatcher.ts` — batching de output (~16ms) + `flushOne` no exit.
  - `src/main/pty/nodePtySpawner.ts` — spawner `node-pty`.
  - `src/main/pty/shell.ts` — shell padrão por plataforma.
  - `src/main/pty/registerPtyIpc.ts` — IPC `pty:spawn/write/resize/kill/attach/killForNode`,
    allowlist, SSH, wrapper `claude` absoluto, env de projeto.
- Orquestração / atenção / geração:
  - `src/main/orchestration/AgentBus.ts` — watcher de atenção/ociosidade, `busy`, `waitForIdle`,
    `writeRaw`.
  - `src/main/index.ts` — callbacks `onAttention`/`onBusyChange`, `Notification` do SO.
- Renderer / UI do terminal:
  - `src/renderer/src/components/TerminalNode.tsx` — xterm, tema, drag-drop, varredura "gerando".
  - `src/renderer/src/components/TerminalFlowNode.tsx` — nó do canvas, badges, atenção, estados.
  - `src/renderer/src/components/NewTerminalModal.tsx` — modal de criação (preset/nome/papel/monitor).
  - `src/renderer/src/components/nodeState.ts` — mapeamento de estados → classes CSS.
  - `src/renderer/src/components/Canvas.tsx` — atalhos, ⇧A (ciclo de atenção), plumbing dormente.
  - `src/renderer/src/components/CommandPalette.tsx` — "Definir papel de X".
  - `src/renderer/src/store/canvasStore.ts` — `attention`, `generating`, `addTerminalNode`,
    `updateTerminalName`, `updateTerminalRole`.
- Terminal helpers:
  - `src/renderer/src/terminal/generatingSignal.ts` — `WORKING_MARKER` (`esc to interrupt`).
  - `src/renderer/src/terminal/xtermTheme.ts` — `xtermThemeFromTokens` (tema tema-aware).
  - `src/renderer/src/terminal/terminalRegistry.ts` — registry `nodeId → ptyId` no renderer.
  - `src/renderer/src/terminal/ansi.ts` — `stripAnsi`.
- Compartilhado / CLI:
  - `src/shared/roles.ts` — `PRESET_ROLES`, `roleMeta`.
  - `src/shared/presets.ts` — presets de agente.
  - `src/shared/orchestration.ts` — modelo do mirror (`role`, `preset`, `monitor`) e comandos.
  - `src/shared/ssh.ts` — `isValidSshHost`.
  - `src/orq/orq.ts` — CLI `orq` (`list/context/note/ask [--raw|--wait|--batch]/recruit/…`).
  - `src/orq/escapes.ts` — `interpretEscapes` (bytes de controle para `--raw`).
  - `src/preload/index.ts` — ponte IPC (`pty.*`, `onAgentAttention`, `onAgentBusy`).

---

*Documento gerado a partir da doc oficial do Maestri e da leitura direta do código do Orkestra
no branch `feat/designcode-ui` (data de referência: 2026-07-15). Nenhuma informação foi
inferida sem base em fonte real — funcionalidades ausentes estão marcadas explicitamente como
"Gap".*
