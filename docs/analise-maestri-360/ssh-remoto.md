# SSH Remoto — Análise 360° (Maestri → Orkestra)

> Documento de pesquisa comparando a funcionalidade **SSH Remoto** do Maestri
> (themaestri.app) com o estado atual do **Orkestra**. Baseado na documentação
> oficial do Maestri (`https://www.themaestri.app/pt-br/docs/ssh`) e na leitura
> direta do código do Orkestra. Data: 2026-07-15.

---

## 1. Visão geral

O **SSH Remoto** permite que os terminais/workspaces de agentes rodem numa
**máquina remota** em vez da máquina local, mantendo a mesma experiência de uso.
No Maestri, a promessa vai além de "abrir um terminal via ssh": o recurso
habilita **comunicação inter-agentes entre máquinas** ou entre ambientes isolados,
transportando não só o shell mas também o canal de coordenação dos agentes através
de um **túnel SSH**.

A ideia central é o **agnosticismo de transporte**: do ponto de vista da interface
(canvas, terminais, orquestração), pouco deveria mudar entre um agente que roda
localmente e um que roda numa VM/servidor remoto. O usuário continua vendo um nó de
terminal no canvas; por baixo, o que muda é *onde* o processo executa e *como* os
bytes trafegam.

Segundo a documentação do Maestri, o objetivo declarado é:

> "O Maestri suporta conexão a servidores remotos via SSH, habilitando comunicação
> inter-agentes entre máquinas ou ambientes isolados."

Casos de uso típicos:

- Rodar agentes num servidor mais potente (GPU, muita RAM) enquanto se controla do
  laptop.
- Isolar a execução de agentes (que rodam comandos arbitrários) numa VM descartável,
  longe da máquina pessoal.
- Trabalhar diretamente num ambiente de deploy/staging onde o código já vive.
- Compartilhar um workspace remoto entre agentes que precisam se coordenar.

---

## 2. Como funciona (modelo do Maestri)

A transcrição integral da documentação do Maestri descreve o fluxo assim:

### 2.1. Habilitando SSH

1. Acessar **Configurações > Geral > SSH Remoto**.
2. Clicar em **Configurar**.
3. Ativar a opção de **habilitar workspaces SSH**.
4. Ajustar opcionalmente a **Porta do Túnel** (configuração padrão: **7433**).

### 2.2. Como o Maestri descreve o funcionamento

> "Quando conectando a um workspace SSH, o Maestri instala um pequeno script no
> servidor remoto e abre um túnel reverso para comunicação entre agentes. O script
> é um simples *wrapper de curl* — você pode inspecioná-lo a qualquer momento.
> Nenhum processo em background é instalado."

Ou seja, o mecanismo tem três peças:

1. **Script helper no remoto** — um pequeno *wrapper de curl* instalado na máquina
   remota (caminho padrão `~/.local/bin/maestri`). Não é um daemon; é um script
   inspecionável, sem processos em background.
2. **Túnel reverso SSH** — aberto no momento da conexão, é o canal por onde os
   agentes remotos falam de volta com o Maestri local. O túnel faz **bind apenas ao
   localhost** (nota de segurança), então não expõe portas à rede.
3. **Terminais rodando no remoto** — os shells dos agentes executam de fato na
   máquina remota, mas aparecem na mesma UI do Maestri.

### 2.3. Configurações por conexão

Para cada conexão SSH é possível personalizar:

- **Host** (hostname ou endereço IP)
- **Usuário** (nome de usuário SSH)
- **Porta** (padrão: 22)
- **Caminho do Script** (padrão: `~/.local/bin/maestri`)
- **Adicionar ao PATH** (para o perfil de shell do usuário remoto)

### 2.4. Uso de `~/.ssh` e autenticação

A nota de segurança é explícita:

- **Utiliza chaves SSH existentes de `~/.ssh`** — o Maestri não gerencia chaves
  próprias; reaproveita a configuração de SSH que o usuário já tem (chaves, agent,
  `config`).
- O **túnel faz bind apenas ao localhost**.
- **Chaves de host alteradas disparam avisos** — delega ao mecanismo padrão do SSH a
  detecção de mudança de fingerprint (proteção contra MITM).

### 2.5. Compartilhando arquivos com o agente remoto (drag-drop pelo túnel)

> "O sistema intercepta envios de imagem para terminais SSH. Os bytes são
> transferidos para `/tmp/maestri-drops` na máquina remota, permitindo que o agente
> acesse o arquivo. Arquivos com mais de 60 minutos são removidos automaticamente."

Detalhes:

- Quando o usuário **arrasta/cola uma imagem** num terminal que é SSH, o Maestri
  **intercepta** o envio.
- Em vez de escrever bytes no terminal local, ele **transfere o arquivo pelo túnel**
  para `/tmp/maestri-drops` na máquina remota.
- O agente remoto passa a enxergar o arquivo como se fosse local (pode referenciar o
  caminho).
- Há **coleta de lixo**: arquivos com mais de **60 minutos** são removidos
  automaticamente, evitando acúmulo em `/tmp`.

### 2.6. Transporte local vs. remoto agnóstico

O que amarra tudo é que o **transporte** (como os bytes vão e voltam) é abstraído:
localmente é um pipe/PTY direto; remotamente é `ssh` + túnel reverso + script helper.
A camada de cima (terminais, coordenação de agentes, drag-drop de arquivo) funciona
**do mesmo jeito** nos dois casos — só a implementação do transporte muda. É isso que
permite "workspaces SSH" serem cidadãos de primeira classe e não um modo à parte.

---

## 3. Pontos interessantes / diferenciais

- **Túnel reverso para coordenação, não só shell.** O diferencial do Maestri não é
  "abrir um ssh" — é levar o *barramento de comunicação entre agentes* para a máquina
  remota via túnel reverso. Isso é o que viabiliza orquestração multi-agente
  cross-máquina.
- **Zero footprint persistente no remoto.** "Nenhum processo em background é
  instalado" e o helper é "um simples wrapper de curl" inspecionável. Reduz o atrito
  de confiança: o usuário pode auditar exatamente o que roda no servidor dele.
- **Reaproveita `~/.ssh` do usuário.** Não reinventa gestão de chaves — usa
  `config`/chaves/agent que o SO já conhece. Menos superfície de risco, menos setup.
- **Bind só em localhost.** O túnel não abre portas para a rede; o canal só existe
  entre o processo local e o remoto pela sessão SSH. Boa postura de segurança por
  padrão.
- **Drag-drop de arquivo transparente pelo túnel.** A interceptação de imagens e
  transferência para `/tmp/maestri-drops` faz o "arrastar um print pro agente"
  funcionar igual, remoto ou local — com GC automático de 60 min para não sujar o
  `/tmp` remoto.
- **Porta de túnel configurável (7433).** Detalhe pequeno, mas evita colisão e deixa
  o comportamento previsível/auditável.
- **Delegação de segurança ao SSH.** Avisos de host key alterada ficam por conta do
  próprio `ssh` — herda o modelo de confiança maduro do OpenSSH em vez de recriá-lo.

---

## 4. Como seria o backend

Uma implementação completa (nível Maestri) teria quatro blocos:

### 4.1. Túnel SSH (canal de controle)

- Abrir uma sessão SSH e, junto, um **túnel reverso** (`ssh -R`) que faz o remoto
  enxergar uma porta local do host (bind em `127.0.0.1:<porta>`, ex.: 7433).
- Esse túnel é o caminho pelo qual o agente/script remoto chama de volta o servidor
  local (o equivalente ao `orq` → servidor local do Orkestra).
- Ciclo de vida: abrir na conexão, monitorar, reabrir em queda, fechar no encerramento
  do workspace.

### 4.2. PTY remoto (terminal interativo)

- O terminal remoto é, na prática, um **PTY local rodando `ssh <destino>`**: o
  processo `ssh` é o "shell" do ponto de vista do gerenciador de PTY.
- Todo o resto (xterm, resize, scrollback, detecção de atividade) opera sobre esse
  PTY sem saber que é remoto — o output do `ssh` é só mais um stream.
- O binário `ssh` do SO cuida de autenticação (chaves/agent/senha) interativamente
  dentro do próprio PTY.

### 4.3. Transporte agnóstico local/remoto

- Uma **abstração de transporte** decide, por workspace/terminal, se os bytes e o
  canal de controle vão por pipe local ou por `ssh`+túnel.
- A camada acima (UI, orquestração, drag-drop) fala com essa abstração e não sabe a
  diferença — só troca a "cola" embaixo.
- No remoto, um **script helper** (wrapper de curl) instalado em `~/.local/bin/…` faz
  as chamadas de volta pelo túnel; ele é injetado no PATH do shell remoto.

### 4.4. Transferência de arquivos

- Interceptar o **drop/paste de arquivo** num terminal remoto e, em vez de escrever no
  PTY, **enviar os bytes pelo túnel/`scp`/`rsync`** para um diretório conhecido no
  remoto (ex.: `/tmp/…-drops`).
- Expor ao agente o caminho remoto do arquivo.
- **GC por idade** (ex.: apagar o que passa de 60 min) para não acumular no `/tmp`.

---

## 5. Estado atual no Orkestra

O Orkestra implementou a **Fase 27 — SSH Remoto** por completo (as 4 tasks do plano
`docs/superpowers/plans/2026-07-12-fase-27-ssh-remoto.md`). O escopo entregue é
deliberadamente o **MVP: um terminal remoto interativo seguro**, e não o
"workspace SSH com túnel" do Maestri. Abaixo, o que existe *de fato* no código.

### 5.1. O que já funciona (caminho completo, ponta a ponta)

**`src/shared/ssh.ts` — validação de destino (`isValidSshHost`).**
É o coração de segurança da fase. A função pura:

```ts
export function isValidSshHost(host: string): boolean {
  if (typeof host !== 'string') return false
  const h = host.trim()
  if (h.length === 0 || h.length > 255) return false
  if (h.startsWith('-')) return false // evita que o ssh trate o destino como opção
  return /^[a-zA-Z0-9]([a-zA-Z0-9._@-]*[a-zA-Z0-9])?$/.test(h)
}
```

- Guarda de tipo em runtime (`typeof !== 'string'`), rejeita vazio/só-espaços e
  comprimento > 255.
- Rejeita host começando com `-` — **evita injeção de opção do `ssh`** (ex.:
  `-oProxyCommand=...`).
- Regex ASCII estrito: só `[a-zA-Z0-9._@-]`, sem começar/terminar em separador. Assim
  aceita `meuservidor`, `192.168.0.1`, `user@host.com`, `deploy@10.0.0.5` e aliases do
  `~/.ssh/config`; e **rejeita** metacaracteres de shell (`;`, `|`, `&`, `$`, backtick,
  espaço), quebras de linha, NUL e não-ASCII.
- Coberta por `src/shared/ssh.test.ts` (aceitação, injeção de opção, metacaracteres,
  quebras de linha/NUL/não-ASCII, tipo não-string).

**`src/main/pty/PtyManager.ts` — `spawn` aceita `args`.**
O `PtyManager.spawn` ganhou o campo opcional `args?: string[]`, repassado **direto** ao
spawner (`this.spawner(file, opts.args ?? [], {...})`, linha ~47) — **nunca concatenado
numa string de shell**, então não abre brecha de injeção. Localmente `args` fica vazio;
no caminho SSH ele carrega `[host]`.

**`src/main/pty/nodePtySpawner.ts` — spawner real.**
Usa `pty.spawn(file, args, {...})` do `node-pty`, com `file` e `args` como argumentos
separados (execução sem shell). É o mesmo caminho para shell local e para `ssh`.

**`src/main/pty/registerPtyIpc.ts` — validação e mapeamento no *main*.**
O handler IPC `pty:spawn` (async) é o *boundary* de segurança:

- **Allowlist explícito** por *destructure*: `const { cols, rows, nodeId,
  initialCommand, sshHost } = o`. O payload bruto do renderer **nunca** é espalhado —
  `file`/`args` arbitrários do renderer não chegam ao `spawn` (defesa contra RCE de um
  renderer comprometido).
- Se `sshHost` está presente: valida com `isValidSshHost`; se inválido, `throw new
  Error('Destino SSH inválido')` (a `ipcMain.handle` async transforma isso em rejeição
  da `invoke`); se válido, mapeia para `sshFields = { file: 'ssh', args: [sshHost.trim()] }`.
- **Só por esse caminho** (após validar) um binário diferente do shell padrão pode ser
  spawnado. O `ssh` do SO lê `~/.ssh/config` + chaves/agent automaticamente; se pedir
  passphrase/senha, o prompt aparece no próprio PTY (interativo).
- Coberto por `src/main/pty/registerPtyIpc.test.ts` (`sshHost` válido spawna `ssh` com
  o host como arg; `sshHost` inválido é rejeitado e não spawna nada).

**`src/preload/index.ts` — contrato do preload.**
O tipo das opções de `spawn` inclui `sshHost?: string`, repassado inteiro via `invoke`.

**`src/renderer/src/store/canvasStore.ts` — persistência (`data.sshHost`).**
`addTerminalNode(position?, opts?)` aceita `opts.sshHost?: string` e grava
`data.sshHost = opts?.sshHost` no nó (linha ~482). O campo é **deliberadamente
persistido** (não entra na lista de `delete` do serialize, ao contrário de `autostart`,
que é efêmero) — então sobrevive ao round-trip serialize → hydrate: ao reabrir o app, o
terminal SSH **re-spawna `ssh <host>` e reconecta**.

**`src/renderer/src/components/TerminalNode.tsx` — bifurcação de spawn.**
No mount, decide o modo (linha ~134):

```ts
const spawnOpts = sshHost
  ? { cols: term.cols, rows: term.rows, nodeId, sshHost }
  : { cols: term.cols, rows: term.rows, nodeId, initialCommand }
```

Com `sshHost`, manda `{ sshHost }` e **omite `initialCommand`** (o processo já *é* o
`ssh <host>`). Sem ele, comportamento local de sempre. Todo o resto — ligação de dados,
resize, registro no `terminalRegistry`, re-attach de PTY que sobreviveu à troca de
projeto (Fase 31) — é **idêntico** nos dois casos.

**`src/renderer/src/components/TerminalFlowNode.tsx` + `nodes.css` — badge "SSH".**
Lê `data.sshHost`; quando presente, exibe um badge **"SSH"** no header (com
`title={`Remoto: ${sshHost}`}`) e passa `sshHost` ao `<TerminalNode>`. O CSS
`.ork-ssh-badge` usa preenchimento sólido `--accent` para deixar claro que **não é um
shell local**.

**`src/renderer/src/palette/paletteCommands.ts` + `CommandPalette.tsx` — criação pela palette.**
Item global `action:ssh` — **"Criar terminal SSH remoto"** — com campo de input
(placeholder `destino (ex.: user@host ou alias do ~/.ssh/config)`). O `submit` chama
`actions.addSshTerminal(v)`, que em `CommandPalette.tsx` faz: `trim`, revalida com
`isValidSshHost` (validação de UX; o *boundary* real é o main) e chama
`addTerminalNode(undefined, { name: `SSH: ${h}`, sshHost: h })`.

### 5.2. Resumo do fluxo atual

`Cmd+K → "Criar terminal SSH remoto" → digita user@host (ou alias)` → validação de UX
no renderer → nó de terminal com `data.sshHost` + badge "SSH" → `pty:spawn({ sshHost })`
→ main revalida e mapeia para `spawn('ssh', [host])` sem shell → PTY interativo conectado
ao remoto (prompt/senha, se preciso, aparecem no terminal) → detecção de atenção,
papéis, palette e re-attach funcionam igual → persiste e reconecta ao reabrir.

### 5.3. O que **falta** (gap para o modelo Maestri)

O Orkestra hoje entrega **um PTY rodando `ssh <destino>`** — um terminal remoto
interativo. Ele **não** implementa o "workspace SSH" completo do Maestri. Falta:

- **Túnel reverso SSH.** Não há `ssh -R`/canal de controle. Consequência prática: um
  agente remoto **não** enxerga o servidor local do Orkestra — não há `orq`
  cross-máquina, nem coordenação inter-agentes na máquina remota. (Explicitamente "fora
  do MVP" no plano.)
- **Script helper no remoto.** Nada é instalado no servidor (sem wrapper de curl, sem
  `~/.local/bin/…`, sem "Adicionar ao PATH").
- **Porta de túnel configurável (7433).** Inexistente (não há túnel).
- **Drag-drop de arquivo pelo túnel.** Não há interceptação de imagem nem transferência
  para um `/tmp/…-drops` remoto (marcado como refinamento futuro no plano). O drop de
  arquivo atual assume caminho local.
- **UI de "configurações por conexão".** O Orkestra pede **apenas um destino string** e
  **delega tudo ao `~/.ssh/config`** do SO — não há campos separados de Host/Usuário/
  Porta/Caminho do Script/PATH, nem tela de "SSH Remoto" em Configurações.
- **Avisos de host key / autenticação gerenciada.** Delegados ao próprio `ssh` (o aviso
  de fingerprint alterado aparece dentro do terminal). O Orkestra **não** gerencia
  chaves — o que é uma decisão de design deliberada, alinhada ao "usa `~/.ssh`" do
  Maestri, mas sem a camada de UX.

Em uma frase: o Orkestra tem o **transporte de terminal** remoto (a parte "PTY roda
`ssh`"), com segurança rigorosa; **não** tem o **transporte de coordenação** (túnel
reverso + helper) nem a **transferência de arquivos** que fazem o Maestri ser um
"workspace remoto" de verdade.

---

## 6. Melhorias sugeridas para o Orkestra

Priorizadas por **valor × esforço** (do maior retorno relativo para o menor).

### Alto valor, baixo/médio esforço

1. **Feedback de estado da conexão SSH no nó.** Hoje, se o `ssh` falha (host
   inexistente, timeout, recusa de chave), o erro aparece "cru" no terminal. Um pequeno
   indicador de estado no badge ("conectando…", "desconectado", cor de erro),
   detectado pelo `exitCode`/output do PTY, melhora muito a leitura sem tocar no
   backend. *Valor alto, esforço baixo.*

2. **Reconexão explícita / retry.** Ao cair a sessão remota, oferecer um botão
   "reconectar" no nó (re-spawn do mesmo `sshHost`) em vez de o usuário ter que
   recriar o terminal. Aproveita todo o caminho já existente. *Valor alto, esforço
   baixo.*

3. **Editar o destino de um terminal existente.** Hoje o `sshHost` é definido só na
   criação. Um `updateTerminalSshHost(id, host)` (revalidando com `isValidSshHost`),
   análogo a `updateTerminalName`/`updateTerminalRole` que já existem, permite corrigir
   um destino sem recriar o nó. *Valor médio, esforço baixo.*

4. **Preset de agente em terminal SSH.** Hoje o modo SSH **omite `initialCommand`**
   (o processo é o `ssh`). Seria valioso poder, opcionalmente, rodar um preset
   (ex.: `claude`) **no shell remoto** após a conexão — enviando o comando como um
   *initialCommand* digitado no PTY já conectado (não como arg do `ssh`, para não abrir
   brecha de injeção). Isso destrava "agente rodando no servidor remoto". *Valor alto,
   esforço médio* (exige cuidado de segurança: o comando vai como *input* do PTY, não
   como argumento).

### Alto valor, esforço maior

5. **Transferência de arquivo para o remoto (drag-drop via `scp`).** Replicar o
   `/tmp/…-drops` do Maestri: ao dropar um arquivo/imagem num terminal SSH, enviá-lo via
   `scp`/`sftp` (usando o mesmo `~/.ssh`) para um diretório remoto conhecido e expor o
   caminho ao agente, com GC por idade. É o próximo passo mais "sentido" pelo usuário e
   já estava previsto como refinamento futuro. *Valor alto, esforço médio/alto.*

6. **Túnel reverso + `orq` remoto (paridade real com o Maestri).** O grande salto:
   abrir um `ssh -R` (bind localhost) e instalar um pequeno helper no remoto para que o
   `orq`/agente remoto fale de volta com o servidor local do Orkestra. Habilita
   orquestração multi-agente cross-máquina. É a feature de maior valor estratégico e a
   de maior esforço/risco (segurança do túnel, ciclo de vida, escopo de projeto no
   remoto — vide o incidente de corrupção cross-project). *Valor muito alto, esforço
   alto.* Deve vir depois de (1)–(5) e de um plano dedicado.

### Menor prioridade / polimento

7. **UI de "configurações por conexão".** Campos separados de Host/Usuário/Porta e um
   catálogo de destinos salvos (talvez lendo aliases do `~/.ssh/config`). Melhora a UX
   de quem não quer digitar `user@host`, mas é conveniência sobre uma base que já
   funciona. *Valor médio, esforço médio.*

8. **Documentação do requisito de `ssh` no PATH (Windows).** O spawn assume `ssh` no
   PATH (OpenSSH client, presente no Windows 10+); documentar e, se ausente, dar uma
   mensagem clara em vez de um erro cru de spawn. *Valor baixo, esforço baixo.*

---

## 7. Referência

**Documentação oficial do Maestri (transcrição integral):**
`https://www.themaestri.app/pt-br/docs/ssh`

- **SSH Remoto** — "O Maestri suporta conexão a servidores remotos via SSH,
  habilitando comunicação inter-agentes entre máquinas ou ambientes isolados."
- **Habilitando SSH:** Configurações > Geral > SSH Remoto > Configurar > habilitar
  workspaces SSH > Porta do Túnel (padrão **7433**).
- **Como funciona:** instala um pequeno script no servidor remoto e abre um **túnel
  reverso** para comunicação entre agentes; o script é "um simples wrapper de curl —
  você pode inspecioná-lo a qualquer momento. Nenhum processo em background é
  instalado."
- **Configurações por conexão:** Host (hostname/IP), Usuário (username SSH), Porta
  (padrão 22), Caminho do Script (padrão `~/.local/bin/maestri`), Adicionar ao PATH.
- **Compartilhando arquivos com o agente remoto:** intercepta envios de imagem para
  terminais SSH; os bytes são transferidos para `/tmp/maestri-drops` na máquina remota;
  arquivos com mais de 60 minutos são removidos automaticamente.
- **Notas de segurança:** utiliza chaves SSH existentes de `~/.ssh`; o túnel faz bind
  apenas ao localhost; chaves de host alteradas disparam avisos.

**Código e artefatos do Orkestra (lidos para esta análise):**

- `src/shared/ssh.ts` — `isValidSshHost(host)` (validação pura de destino).
- `src/shared/ssh.test.ts` — testes de aceitação/rejeição da validação.
- `src/main/pty/PtyManager.ts` — `spawn` com `args?: string[]` (repassado sem shell).
- `src/main/pty/nodePtySpawner.ts` — `pty.spawn(file, args, …)` (node-pty).
- `src/main/pty/shell.ts` — shell padrão por plataforma (base do `file` local).
- `src/main/pty/registerPtyIpc.ts` (+ `.test.ts`) — handler `pty:spawn`: allowlist,
  validação de `sshHost` no main e mapeamento para `spawn('ssh', [host])`.
- `src/preload/index.ts` — `sshHost?: string` no contrato de `spawn`.
- `src/renderer/src/store/canvasStore.ts` (+ `.test.ts`) — `addTerminalNode({ sshHost })`,
  persistência de `data.sshHost`.
- `src/renderer/src/components/TerminalNode.tsx` — bifurcação de spawn (modo SSH).
- `src/renderer/src/components/TerminalFlowNode.tsx` + `src/renderer/src/components/nodes.css`
  — badge "SSH".
- `src/renderer/src/palette/paletteCommands.ts` (+ `.test.ts`) e
  `src/renderer/src/components/CommandPalette.tsx` — item "Criar terminal SSH remoto".
- `docs/superpowers/plans/2026-07-12-fase-27-ssh-remoto.md` — plano de implementação da
  Fase 27 (contexto de escopo, segurança e itens "fora do MVP").
