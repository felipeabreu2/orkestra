# Solução de Problemas — Análise 360° (Maestri → Orkestra)

> Documento de referência interna. Compara a página oficial de _Troubleshooting_ do Maestri
> (`https://www.themaestri.app/pt-br/docs/troubleshooting`) com os mecanismos reais de resiliência,
> observabilidade e recuperação já presentes no código do Orkestra. Baseado no documento público do
> Maestri e na leitura direta do código-fonte (arquivos citados na seção 5). Data: 2026-07-15.

---

## 1. Visão geral

O Maestri se descreve como "um app profundamente interativo — mais próximo de um motor de jogo de
estratégia do que de um utilitário comum para Mac". A página de Solução de Problemas parte dessa
premissa: um app que hospeda muitos processos vivos ao mesmo tempo (terminais, agentes de IA,
portais/webviews) inevitavelmente encontra estados degradados, e o produto precisa oferecer
**caminhos de recuperação sem perder o trabalho do usuário**.

A página é enxuta e cobre apenas três frentes:

1. **Foco/interação travada** no canvas — uma ação de _reset_ que devolve o controle sem mexer no
   trabalho.
2. **Pressão de memória** — com o insight-chave de que a memória vem dos **agentes dentro dos
   terminais**, não do app em si; e duas ferramentas de mitigação (limite por terminal e hibernação
   de workspace).
3. **Relatório de diagnóstico** — um pacote anônimo de metadados + logs/crashes que o usuário baixa
   e envia por e-mail ao suporte.

O fio condutor filosófico é claro: **degradar com elegância e nunca destruir o trabalho**. "Resetar
Foco" não mexe no canvas; hibernar um workspace "acorda de onde parou"; o diagnóstico não carrega
nenhum código nem saída de terminal. Além disso, há uma postura explícita de tratar certos bugs
(perda de foco) como algo "a eliminar, não contornar" — ou seja, o _workaround_ é temporário e o
time quer o report para corrigir a causa raiz.

O Orkestra, sendo o mesmo tipo de app (Electron + React Flow hospedando PTYs, agentes e webviews),
enfrenta exatamente a mesma classe de problemas. Como veremos na seção 5, o Orkestra já investiu
**pesado em resiliência de baixo nível** (persistência atômica, self-heal de dados, isolamento de
crash por nó, observabilidade de processos-filho), mas **ainda não tem a camada voltada ao usuário**
que o Maestri documenta (reset de foco, limite de memória por terminal, hibernação de workspace,
export de diagnóstico).

---

## 2. Como funciona (catálogo do Maestri)

Transcrição estruturada dos problemas comuns documentados na página do Maestri e das soluções
sugeridas, mais os recursos de diagnóstico/reset.

### 2.1. Problema: o canvas para de responder a inputs

**Sintoma.** O gerenciamento de foco entre o canvas e as janelas internas (nós) pode se perder,
impedindo redimensionar nós, mover elementos ou usar atalhos de teclado.

**Solução (reset de foco).**
1. Abrir o menu **Visualizar**.
2. Escolher **Resetar Foco**.

Segundo a doc, essa ação "limpa o estado de foco e devolve o controle ao canvas, **sem mexer no seu
trabalho**".

**Postura do time.** Se isso acontece com frequência em cenários específicos, o usuário deve
reportar — "perda de foco é algo que queremos eliminar, não contornar". Ou seja, o reset é um alívio
imediato, não a correção definitiva.

### 2.2. Problema: o Maestri está usando muita memória

**Diagnóstico do próprio produto.** O app nativo usa "em torno de **200 MB de RAM em repouso**". A
pressão de memória "geralmente vem dos **agentes rodando dentro dos seus terminais**, não do
Maestri". Uma única instância do Claude Code, por exemplo, consome "**500–700 MB**". Esse
enquadramento é importante: ele redireciona a expectativa do usuário do container (o app) para o
conteúdo (os agentes).

**Solução 1 — Limite de memória por terminal.**
1. **Configurações → Terminal**.
2. Ativar **Limite de memória por terminal**.
3. Definir um máximo em MB.

Funcionamento: "quando ativado, o Maestri monitora todos os processos iniciados dentro de um
terminal. Se algum deles ultrapassar o limite, o Maestri **encerra esse processo e mantém o shell
vivo**". É uma poda cirúrgica: mata o processo esbanjador (o agente), mas preserva o shell, então o
terminal não some do canvas.

**Solução 2 — Descarregar (hibernar) um workspace.**
1. Botão direito em qualquer workspace na barra lateral.
2. Escolher **Descarregar**.

Efeito: "o workspace hiberna e libera **todos os recursos** que estava segurando — terminais,
agentes, portais, tudo". Na próxima abertura, "ele acorda imediatamente e **retoma de onde parou**".

**Contexto de ciclo de vida.** Na inicialização, apenas o **workspace ativo** é carregado; todos os
outros ficam hibernados até serem clicados. Pista visual: **ícones esmaecidos** indicam workspace
hibernado; **opacidade cheia** indica carregado e rodando.

### 2.3. Recurso de diagnóstico: enviar um relatório

1. Menu **Ajuda**.
2. **Reportar um Problema…**.
3. **Baixar** para salvar o arquivo de diagnóstico.
4. Enviar por e-mail para **bugs@themaestri.app** com a descrição do ocorrido.

**Privacidade.** O arquivo é "totalmente anônimo": contém metadados do sistema e logs/crashes
recentes do app — "nenhum código, nenhuma saída de terminal e nada dos seus workspaces".

**Boa prática.** "Quanto mais detalhe você compartilhar sobre o que estava fazendo logo antes do
problema, mais rápido conseguimos reproduzir e corrigir." Ou seja, o pacote técnico anônimo + a
narrativa humana do usuário são complementares.

### 2.4. Padrões transversais da abordagem

- **Reset localizado, não reinício global.** A solução de foco reseta só o foco; a de memória mata
  só o processo culpado. Nada de "reinicie o app" como primeira resposta.
- **Preservação do trabalho como invariante.** Toda solução promete não perder estado ("sem mexer no
  seu trabalho", "retoma de onde parou").
- **Educação sobre o modelo de recursos.** A doc ensina que os agentes é que pesam, evitando a
  frustração de "o app está pesado".
- **Diagnóstico com privacidade por padrão.** O pacote é anônimo e não exfiltra conteúdo do usuário.

---

## 3. Pontos interessantes / diferenciais

- **Hibernação com retomada transparente (lazy loading de workspace).** Só o workspace ativo é
  carregado no boot; os demais dormem e "acordam imediatamente de onde pararam". É o mesmo padrão que
  o Orkestra já usa de forma parcial (o pty **sobrevive à troca de projeto** e é re-attachado — ver
  seção 5), mas o Maestri leva ao limite oposto: em vez de manter tudo vivo, ele **libera
  ativamente** os recursos dos workspaces inativos e reconstrói sob demanda.
- **Limite de memória por terminal com granularidade de processo.** Não é um cap global do app, e sim
  por terminal, matando o processo específico e **mantendo o shell**. Isso preserva o nó do canvas e
  a continuidade visual — combina com a filosofia de "não destruir o trabalho".
- **Enquadramento honesto do custo dos agentes.** Assumir "o Maestri em si só usa ~200 MB; o peso são
  os agentes (500–700 MB cada)" transforma uma reclamação típica ("app pesado") em entendimento do
  modelo, reduzindo suporte.
- **Diagnóstico anônimo self-service.** Baixar-e-enviar coloca o usuário no controle do que sai da
  máquina (privacidade), enquanto padroniza o que o suporte recebe (metadados + logs/crashes).
- **Bug tratado como bug, não como recurso.** A nota "perda de foco é algo que queremos eliminar" é
  um sinal de maturidade: o _workaround_ é explicitamente rotulado como paliativo.

---

## 4. Como seria o backend (logging, recuperação de estado, reset de sessão, health checks)

Modelo conceitual de uma camada de resiliência para um app deste tipo — usado a seguir para medir o
que o Orkestra já tem.

- **Logging / observabilidade.**
  - Captura de eventos de baixo nível do runtime: crash do renderer, renderer sem resposta,
    processos-filho (GPU/utility) mortos, falhas de carregamento da UI, erros de console acima de um
    nível.
  - Um **logger com arquivo rotativo** (não só `console`), para que builds empacotados deixem rastro
    diagnosticável fora do DevTools.
  - Coleta de metadados do ambiente (SO, versão, GPU, memória) **sem** conteúdo do usuário.

- **Recuperação de estado (persistência resiliente).**
  - Escrita **atômica** (tmp + rename + fsync) para nunca deixar um arquivo meio-escrito após queda
    de energia.
  - Distinção entre **arquivo ausente** (legítimo), **corrompido** (dado perdido — vale curar) e
    **erro de I/O transitório** (não reescrever!). Só curar por cima quando é seguro.
  - **Backup antes de degradar** (preservar bytes antigos) e **self-heal** (reconstruir índice a
    partir dos dados órfãos, em vez de zerar tudo).
  - Limpeza de artefatos órfãos (`.tmp`) deixados por crashes.

- **Reset de sessão / ciclo de vida de processos.**
  - **Reset localizado** (foco, um nó, um terminal) em vez de reinício global.
  - **Poda de recursos**: matar o processo esbanjador mantendo o container (shell/nó).
  - **Hibernação/descarregamento** de contextos inativos, com re-attach transparente.
  - Encerramento limpo de todos os PTYs no quit (evitar processos zumbis).

- **Health checks.**
  - Detecção de **ociosidade/atividade** dos agentes (o agente falou e parou? travou?).
  - Sinalização de **indisponibilidade** para clientes externos (ex.: um servidor local que responde
    "app indisponível" em vez de mentir "ok").
  - Limites defensivos de recursos por requisição (cap de corpo, cap de buffer, timeouts).
  - Guarda de **instância única** para não corromper dados por concorrência de duas instâncias.

---

## 5. Estado atual no Orkestra (mecanismos reais + gaps)

O Orkestra já tem uma camada de resiliência **substancial** — em vários pontos mais robusta do que o
que a doc do Maestri expõe. O que falta é sobretudo a **camada voltada ao usuário** (reset de foco,
limite de memória por terminal, hibernação, export de diagnóstico). Abaixo, os mecanismos reais com
os caminhos de arquivo.

### 5.1. Isolamento de crash de UI (o equivalente ao "não derrubar tudo")

- `src/renderer/src/components/ErrorBoundary.tsx` — _error boundary_ do React que isola crashes de
  render de uma subárvore. `getDerivedStateFromError` mostra um fallback local ("Falha ao renderizar
  este item." + mensagem), e `componentDidCatch` ecoa o erro em `console.error('[ErrorBoundary]', …)`.
  O comentário do arquivo explica a motivação: sem isso, um erro em UM nó derrubava o React inteiro →
  tela preta.
- Uso real: `src/renderer/src/App.tsx` (boundary raiz), `src/renderer/src/components/Canvas.tsx`
  (comentário `REN-3`: **cada nó** renderiza dentro do seu próprio boundary) e
  `src/renderer/src/components/TerminalFlowNode.tsx`. Um nó problemático mostra fallback local
  enquanto sidebar, canvas e os demais nós seguem funcionando.

### 5.2. Observabilidade de processos e boot (o equivalente ao "logging")

Em `src/main/index.ts`:
- `render-process-gone` → `console.error('[RENDERER-GONE]', …)`.
- `unresponsive` → `[RENDERER-UNRESPONSIVE]` (renderer travado).
- `console-message` com `level >= 2` → `[RENDERER-CONSOLE]` (erros do renderer viram log do processo
  principal — diagnosticável fora do DevTools).
- `did-fail-load` (`BLD-4`) → em vez de janela invisível para sempre, **mostra a janela e um diálogo
  nativo**: "Orkestra não conseguiu iniciar… Tente reinstalar o app; se persistir, reporte o erro."
- `child-process-gone` → `[CHILD-PROCESS-GONE]` (se o processo de GPU/utility morre, o compositor
  para de desenhar e a janela fica preta sem erro no renderer — este log torna o caso silencioso
  diagnosticável).
- `app.whenReady().then(...).catch(...)` (`BLD-3`) → um throw fatal no boot vira `[BOOT] falha fatal`
  + diálogo nativo, em vez de app-zumbi (ícone no Dock, nenhuma janela).

**Gap.** A observabilidade é toda via `console.error` com prefixos — **não há um logger estruturado
com arquivo rotativo** encontrado no código. Em build empacotado o rastro depende do stdout/stderr do
processo; não há um artefato de log/diagnóstico que o usuário possa **exportar** (ver 5.9).

### 5.3. Persistência resiliente e self-heal (o equivalente ao "recuperação de estado")

`src/main/projects/ProjectManager.ts` é o coração da resiliência de dados:
- **Escrita atômica endurecida** (`writeJson`): `mkdir` recursivo do destino (`INT-3`), `openSync` +
  `writeSync` + **`fsyncSync`** do arquivo, `renameSync`, e `fsync` best-effort do diretório
  (`INT-5`) — fecha a janela em que uma queda de energia deixaria o arquivo truncado. Retorna
  boolean (nunca "sucesso de mentira") e nunca lança.
- **Quatro estados de leitura** (`ReadResult`): `ok`, `missing` (legítimo), `corrupt` (dado perdido —
  vale curar) e `ioerror` (transitório — **não reescrever**). A distinção `corrupt`-vs-`ioerror` é o
  ponto crítico (`INT-1`/`INT-2`): só em `corrupt` persiste uma cura por cima.
- **Backup antes de degradar** (`backup`): copia os bytes para `*.corrupt-<timestamp>` antes de
  sobrescrever — nunca destrói em silêncio.
- **Self-heal do índice** (`reconstructFromDir`/`list`): se `projects.json` sumiu/corrompeu,
  **re-adota os canvases órfãos** em `projects/<id>.json` (renomeados como "Projeto recuperado …") em
  vez de zerar tudo.
- **Limpeza de `.tmp` órfãos** (`cleanupTmp`, `INT-7`) deixados por crash entre escrita e rename,
  restrita a `projects/*.tmp` (nunca um sweep cego no `userData`, compartilhado com o Cache do
  Chromium).
- **Path-traversal guard** (`isValidProjectId`, `INT-8`): rejeita ids que não sejam UUID-like, para
  um renderer comprometido não escrever fora de `projects/`.
- `switch()`/`remove()` transacionais, com backup na degradação e invariante "sempre ≥ 1 projeto".

No renderer, `src/renderer/src/hooks/useCanvasPersistence.ts` faz **autosave debounced por
`projectId` explícito** (`projects.saveCanvas`), salva no unmount e trata falha de load com `catch` —
o comentário documenta que este desenho corrige o incidente de corrupção cross-project (o canal
"salvar no projeto ativo do main" foi removido). O contrato de load atômico está em
`src/main/persistence/registerPersistenceIpc.ts` (devolve `{ projectId, snapshot }` num round-trip; o
canal `persistence:save` foi **removido** — `INT-6` — por ser exatamente o vetor de corrupção).

### 5.4. Instância única (prevenção de corrupção por concorrência)

`src/main/index.ts` usa `app.requestSingleInstanceLock()`: uma segunda instância sai imediatamente e
a primeira recebe `second-instance` e traz a janela à frente. O comentário liga isso ao incidente em
que duas instâncias compartilhando o mesmo `userData` sobrescreviam os canvases uma da outra.

### 5.5. Ciclo de vida de PTY, re-attach e limpeza (o equivalente à "sessão/recursos")

- `src/main/pty/PtyManager.ts` — mantém um **buffer de scrollback por pty** (cap `MAX_BUFFER` =
  256 KB) para **restaurar o terminal ao re-montar** o nó (ex.: voltar a um projeto). No `onExit`,
  limpa pty, buffer e mapeamentos. Expõe `kill`, `killByNode`, `killAll`.
- `src/main/pty/registerPtyIpc.ts` — `pty:attach` (re-attach por `nodeId`, devolve `ptyId` +
  scrollback), `pty:kill`, `pty:killForNode`. O spawn usa **allowlist explícito** de campos do
  renderer (nunca espalha o payload cru — proteção contra RCE) e um `PtyDataBatcher` compartilhado
  para agrupar o output em ~1 frame.
- `src/renderer/src/components/TerminalNode.tsx` — ao montar, chama `window.orkestra.pty.attach`; se
  há pty vivo, **restaura o scrollback** e reconecta; senão faz spawn. O pty **sobrevive à troca de
  projeto** (não reinicia o agente à toa). Falha de spawn é tratada: `start().catch` escreve
  `\r\n[spawn failed] …` no próprio xterm (feedback local, sem crash).
- Encerramento limpo: `ptyManager.killAll()` no `closed` da janela e no `before-quit`; ao **remover
  um projeto**, o main mata os ptys dos terminais daquele projeto (`PTY-1`) para não deixar agentes
  vivos consumindo CPU/RAM/tokens e inalcançáveis.

**Observação.** Isto é o **oposto** da estratégia de hibernação do Maestri: o Orkestra **mantém os
ptys vivos** através da troca de projeto (re-attach), enquanto o Maestri **libera** os recursos do
workspace inativo. Boa continuidade, mas sem a válvula de alívio de memória (ver gaps).

### 5.6. Health check de agentes: detecção de ociosidade/atividade

`src/main/orchestration/AgentBus.ts` implementa a "saúde" dos agentes:
- **Watcher de atenção** (`track`): quando um pty tracked produz output e depois fica `idleMs`
  (default 1200 ms) em silêncio, dispara `onAttention` — "o agente falou e parou". Em
  `src/main/index.ts`, isso vira `mainWindow.webContents.send('agent:attention', nodeId)` e, se a
  janela **não está em foco**, uma **`Notification` nativa** ("Agente ocioso — um agente parou e pode
  precisar de você"), com guard `try/catch` (notificação negada pelo SO nunca trava o app) e guard
  `isDestroyed` (`BLD-9`).
- **Watcher de "busy"** (`onBusyChange`) — sinal real por trás do border-beam "gerando", ligando no
  primeiro chunk e desligando após `idleMs` de silêncio; force-off no `untrack`/exit para nunca ficar
  "preso ligado".
- **`waitForIdle`** (usado por `orq ask --wait`): resolve quando o agente fica ocioso **ou** no
  teto de `timeoutMs` (120 s), com **fast-path de saída** (`PTY-8`: se o pty morre no meio, resolve
  na hora em vez de pendurar 120 s) e **cap de acumulador** (`MAX_WAIT_DELTA` = 256 KB) para não
  crescer sem limite.

### 5.7. Health/robustez do servidor de orquestração

`src/main/orchestration/OrchestrationServer.ts`:
- **Auth por token** em tempo constante (`timingSafeEqual`) → `401` sem token válido.
- **Escopo de projeto** (`isForeignProject`) → `409 project not active` quando o agente pertence a um
  projeto que não é o ativo (os ptys sobrevivem à troca, então isso evita misturar canvases).
- **`503 app unavailable`** (`BLD-6`) quando não há renderer vivo para receber o comando — o servidor
  **não mente "ok"** ao agente.
- **Cap de corpo** (`MAX_BODY` = 1 MB → `413`) e `400` para JSON inválido — limites defensivos contra
  payload hostil/gigante.

### 5.8. Segurança defensiva do runtime (evita classes de "tela preta"/falha)

Em `src/main/index.ts`:
- **Aceleração de hardware ligada** com racional documentado (desligar no macOS derruba o WebGL →
  tela preta) e kill-switch `ORKESTRA_NO_GPU=1` para Windows/Linux.
- **CSP** no renderer empacotado (`SEC-1/SEC-4`) com kill-switch `ORKESTRA_NO_CSP=1`.
- **Endurecimento de sessão** (`SEC-6`): nega por padrão permissões sensíveis (câmera/mic,
  geolocalização, USB, etc.) na sessão principal e nas partitions de portal.
- `will-attach-webview` / `setWindowOpenHandler`: remove `webPreferences` perigosas de qualquer
  `<webview>` e impede novas janelas Electron.
- `src/main/pty/shell.ts` — `defaultShell` por plataforma (`BLD-1`): no Windows usa `ComSpec`, senão
  o spawn falhava e **nenhum terminal abria** no artefato Windows.
- `src/main/updater.ts` — checagem de atualização via GitHub Releases com `catch` silencioso
  (offline/sem release nunca derruba o boot); só roda em build empacotado.

### 5.9. Gaps (o que o Maestri documenta e o Orkestra ainda não tem)

1. **Reset de foco (§2.1).** Não há uma ação "Resetar Foco" no Orkestra. Como o canvas hospeda
   xterms, webviews e nós do React Flow, um estado de foco preso é plausível — não há paliativo de
   1-clique documentado.
2. **Limite de memória por terminal (§2.2, Solução 1).** Não há monitoramento de memória por
   terminal nem poda do processo esbanjador mantendo o shell. O Orkestra só mata pty **inteiro**
   (kill/killByNode/killAll), nunca um processo-filho específico dentro do shell.
3. **Hibernação/descarregar workspace (§2.2, Solução 2).** Não há hibernação de projeto. Ao
   contrário: os ptys **sobrevivem** à troca de projeto (re-attach), o que é ótimo para continuidade
   mas **não alivia memória** — N projetos com agentes = N × 500–700 MB vivos ao mesmo tempo. Não há
   boot lazy (só o ativo carregado) nem pista visual de "hibernado vs. rodando".
4. **Relatório de diagnóstico (§2.3).** Não há "Reportar um Problema" nem export de um pacote anônimo
   (metadados + logs/crashes). A observabilidade existe (5.2) mas fica no console/stdout — não há
   logger com arquivo nem UI para o usuário coletar e enviar.
5. **Educação sobre custo de memória.** Sem a mensagem "os agentes é que pesam", o usuário pode
   atribuir o consumo ao Orkestra.

---

## 6. Melhorias sugeridas para o Orkestra (valor × esforço)

Priorização por **valor de suporte/robustez** contra **esforço de implementação**. As quatro
primeiras reaproveitam infraestrutura que o Orkestra já tem.

### Onda 1 — alto valor, baixo/médio esforço (reusa o existente)

1. **Export de diagnóstico anônimo ("Reportar um Problema").** _Valor alto · esforço médio._
   Um item de menu que gera um pacote com: metadados do sistema (SO/versão/GPU/RAM via
   `app.getPath`/`process`), a versão do app, e os **logs que o Orkestra já emite** (5.2:
   `[RENDERER-GONE]`, `[CHILD-PROCESS-GONE]`, `[BOOT]`, `[ORchestration]`…). Passo intermediário
   necessário: **adotar um logger com arquivo rotativo** (ex.: `electron-log`) para que esses
   `console.error` virem um arquivo coletável — hoje só vão para stdout. Manter o princípio do
   Maestri: **anônimo, sem código nem saída de terminal nem conteúdo de canvas**. Isso reduz
   drasticamente o ciclo de suporte.

2. **Mensagem de "custo de memória" + medição por terminal (read-only).** _Valor médio-alto ·
   esforço médio._ Mostrar, no header do nó de terminal ou num painel, a memória aproximada do
   processo daquele terminal (o main já tem o `pid` do pty). Só exibir já educa o usuário ("o app é
   leve; os agentes pesam") sem ainda matar nada — base para o item 3.

3. **Limite de memória por terminal (poda de processo).** _Valor alto · esforço alto._ Evolução
   natural do item 2: monitorar os processos-filho de cada pty e, ao ultrapassar um teto
   configurável, **matar o processo esbanjador mantendo o shell vivo** (o `PtyManager` já isola o
   ciclo de vida do pty; falta enumerar a árvore de processos-filho por plataforma). Exatamente o
   comportamento do Maestri. Alto esforço por ser dependente de SO (enumeração de processos), mas de
   alto valor para quem roda muitos agentes.

4. **Reset de foco.** _Valor médio · esforço baixo-médio._ Ação de menu/atalho que devolve o foco ao
   canvas (blur dos xterms/webviews, `focus()` no container do React Flow) **sem tocar no estado dos
   nós**. Paliativo barato de 1-clique enquanto a causa raiz não é caçada — seguindo a postura do
   Maestri de tratar o bug como "a eliminar, não contornar".

### Onda 2 — robustez estrutural, maior esforço

5. **Hibernação/descarregamento de projeto.** _Valor alto · esforço alto._ Um comando "Descarregar"
   por projeto que mata os ptys (agentes/portais) daquele projeto liberando memória, **preservando o
   canvas em disco** (já persistido atomicamente — 5.3) para retomar de onde parou ao reabrir.
   Exige repensar a política atual de "manter ptys vivos na troca": provavelmente um **modo opcional**
   (manter-vivo vs. hibernar) em vez de trocar o default. Complementos: boot lazy (carregar só o
   projeto ativo) e **pista visual** de projeto hibernado vs. rodando na sidebar.

6. **Health check ativo do renderer + auto-recuperação.** _Valor médio · esforço médio._ Hoje o main
   apenas **loga** `unresponsive`/`render-process-gone` (5.2). Poderia oferecer, no diálogo,
   **"Recarregar a interface"** (`webContents.reload`) como recuperação de 1-clique antes de sugerir
   reinstalar — o canvas volta do último autosave.

7. **Painel de saúde dos agentes.** _Valor médio · esforço médio._ Expor o estado que o `AgentBus` já
   calcula (ocioso/atenção/busy — 5.6) numa visão agregada ("quais agentes estão travados/ociosos
   agora"), reduzindo a caça manual pelo canvas.

### Onda 3 — refinamentos

8. **Logger estruturado + níveis** (pré-requisito compartilhado com o item 1), com rotação e um teto
   de tamanho — a base de observabilidade para todo o resto.
9. **Telemetria de crash opt-in** (estritamente anônima) para capturar `render-process-gone`/
   `child-process-gone` no agregado, priorizando correções por frequência real.

**Resumo da priorização.** Comece por **export de diagnóstico (1)** e **reset de foco (4)** —
maior alívio de suporte pelo menor esforço, reusando o que já existe. **Medição de memória (2)** é o
degrau natural para o **limite por terminal (3)**. **Hibernação (5)** é o item de maior valor de
memória, porém o de maior esforço e o que mais mexe na arquitetura atual de ptys — deixá-lo para
quando 1–4 estiverem no lugar.

---

## 7. Referência

- **Fonte primária (Maestri).** Página oficial de Solução de Problemas:
  `https://www.themaestri.app/pt-br/docs/troubleshooting` — problemas de foco/canvas, memória (limite
  por terminal, descarregar workspace), e relatório de diagnóstico (`bugs@themaestri.app`). Acesso:
  2026-07-15.

- **Código do Orkestra citado (caminhos reais).**
  - `src/renderer/src/components/ErrorBoundary.tsx` — isolamento de crash de render por nó.
  - `src/renderer/src/App.tsx`, `src/renderer/src/components/Canvas.tsx`,
    `src/renderer/src/components/TerminalFlowNode.tsx` — uso do boundary (por nó, `REN-3`).
  - `src/main/index.ts` — observabilidade (`render-process-gone`, `unresponsive`, `console-message`,
    `did-fail-load` `BLD-4`, `child-process-gone`, `whenReady().catch` `BLD-3`), instância única,
    GPU/CSP/hardenSession, `Notification` de agente ocioso, `killAll` no quit.
  - `src/main/projects/ProjectManager.ts` — escrita atômica + fsync (`INT-5`), `ReadResult`
    (`INT-1/INT-2`), backup `*.corrupt-*`, self-heal (`reconstructFromDir`), `cleanupTmp` (`INT-7`),
    `isValidProjectId` (`INT-8`).
  - `src/main/persistence/registerPersistenceIpc.ts` — load atômico `{ projectId, snapshot }`;
    remoção do canal `persistence:save` (`INT-6`).
  - `src/renderer/src/hooks/useCanvasPersistence.ts` — autosave debounced por `projectId` explícito.
  - `src/main/pty/PtyManager.ts` — scrollback por pty (`MAX_BUFFER`), `kill`/`killByNode`/`killAll`.
  - `src/main/pty/registerPtyIpc.ts` — `pty:attach` (re-attach), allowlist de spawn, `PtyDataBatcher`.
  - `src/renderer/src/components/TerminalNode.tsx` — re-attach + restauração de scrollback, tratamento
    de `[spawn failed]`.
  - `src/main/orchestration/AgentBus.ts` — detecção de ociosidade/atenção/busy, `waitForIdle`
    (timeout + fast-path de exit `PTY-8`).
  - `src/main/orchestration/OrchestrationServer.ts` — auth por token, `409` de escopo de projeto,
    `503 app unavailable` (`BLD-6`), cap de corpo `413`.
  - `src/main/pty/shell.ts` — shell padrão por plataforma (`BLD-1`).
  - `src/main/updater.ts` — checagem de update com `catch` silencioso.

- **Documentos internos relacionados.**
  - `docs/maestri-mapa-funcionalidades-2026-07-11.md` — mapa de funcionalidades Maestri → Orkestra
    (inclui a nota de que a notificação "agente terminou" é viável reusando a detecção de ociosidade).
  - `docs/maestri-changelog-analise-2026-07-13.md`, `docs/features.md`.
