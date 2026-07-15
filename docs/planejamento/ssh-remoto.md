# Plano de Implementação — SSH Remoto

> **Origem:** `docs/analise-maestri-360/ssh-remoto.md` · **Status:** Transporte pronto (Fase 27) — plano cobre a **Onda 2** (refinamentos de alto valor) · **Onda(s):** 2

---

## 1. Objetivo & valor

O Orkestra **já entrega** um terminal remoto interativo seguro: um PTY rodando
`ssh <destino>`, com validação anti-injeção rigorosa no *main* (Fase 27 — verificada
no código, ver §2). Este é um **diferencial de segurança** e **não deve regredir**.

O objetivo desta onda é subir **degraus pequenos e valiosos** sobre esse transporte,
sem entrar no território de alto risco do "workspace SSH com túnel reverso" (ver
§4, "Fora do MVP"). Dois ganhos concretos, sentidos pelo usuário:

1. **Feedback visual de estado de conexão** no nó SSH (`conectando…` → `conectado`
   → `caiu`). Hoje, se o `ssh` cai (host inexistente, timeout, chave recusada), o
   erro aparece "cru" no buffer do terminal e o badge "SSH" continua idêntico — o
   usuário não tem sinal claro de que a sessão morreu. Como consequência natural,
   um botão **reconectar** que re-spawna o mesmo destino.

2. **Drag-drop de arquivo pelo host remoto via `scp`.** Hoje o drop de arquivo
   escreve o **caminho local** no PTY (`pathsToTerminalInput`), o que não faz
   sentido num shell remoto — o agente no servidor não enxerga esse caminho.
   Replicar o comportamento do Maestri: interceptar o drop num terminal SSH,
   enviar o arquivo por `scp` (reusando `~/.ssh`) para um diretório conhecido no
   remoto e escrever o **caminho remoto** no PTY.

Valor: transforma o terminal SSH de "abri um `ssh`" em "trabalho de verdade num
agente remoto" — vejo se a conexão está viva e consigo entregar arquivos ao agente
do outro lado — reusando 100% da infraestrutura de transporte e de segurança já
existente.

---

## 2. Estado atual no código (verificado)

Lido diretamente do código em 2026-07-15. O transporte (Fase 27) está **completo e
endurecido**. Caminhos abaixo conferidos linha a linha.

| Arquivo real | O que já faz | Relevância |
| --- | --- | --- |
| `src/shared/ssh.ts` | `isValidSshHost(host)` — guarda de tipo runtime, rejeita vazio/`>255`, rejeita host começando com `-` (injeção de opção `ssh`), regex ASCII estrito `^[a-zA-Z0-9]([a-zA-Z0-9._@-]*[a-zA-Z0-9])?$`. **Verificado (7 linhas).** | **Núcleo de segurança. Reusar EXATAMENTE esta função em qualquer novo caminho (scp).** Não duplicar validação. |
| `src/shared/ssh.test.ts` | Cobre aceitação (`user@host`, IP, alias), injeção de opção (`-oProxyCommand=x`), metacaracteres (`;`,`\|`,`&`,`$`, backtick, espaço), `\n`/`\r`/NUL/não-ASCII, tipo não-string. **Verificado.** | Modelo de casos a espelhar nos testes do builder de `scp`. |
| `src/main/pty/registerPtyIpc.ts` | Handler `pty:spawn` (async) com **allowlist explícito por destructure** (`{ cols, rows, nodeId, initialCommand, sshHost }` — payload bruto NUNCA espalhado); se `sshHost` presente → `isValidSshHost` → `throw 'Destino SSH inválido'` ou `sshFields = { file: 'ssh', args: [sshHost.trim()] }`. Já tem `ptyManager.onExit(id, () => batcher.flushOne(id))` (linha ~96). **Verificado.** | Boundary de segurança do transporte. Ponto de enxerto do **encaminhamento de `pty:exit`** (T1). |
| `src/main/pty/registerPtyIpc.test.ts` | Prova: allowlist ignora `file`/`args` do renderer; `sshHost` válido → `spawn('ssh', ['user@host'])`; `sshHost` inválido (`'a; rm -rf /'`) → rejeita e **não** spawna. **Verificado.** | Padrão de teste de IPC (fake `ipcMain`, spawner `vi.fn`) a reusar em T1/T6. |
| `src/main/pty/PtyManager.ts` | `spawn({ file?, args?, … })` repassa `file`/`args` **direto** ao spawner (`this.spawner(file, opts.args ?? [], …)`), nunca concatenado em string. `onExit(id, cb)` multi-subscriber já existe no main. **Verificado.** | Base do spawn sem shell (local e `ssh`). O `onExit` do main é a fonte do sinal de "caiu" (mas **não chega ao renderer** hoje — ver T1). |
| `src/main/pty/nodePtySpawner.ts` | `pty.spawn(file, args, {…})` (node-pty), `file`/`args` separados (sem shell). **Verificado.** | Confirma execução sem shell — mesma garantia vale se reusarmos spawn para o `scp` (mas T6 usa `child_process`, ver Notas). |
| `src/preload/index.ts` | Contrato `pty.spawn({…, sshHost?: string})`; `pty.onData(id, cb)` com unsubscribe; `getPathForFile(file)` (webUtils). **Não existe `pty.onExit` nem canal `pty:exit`.** **Verificado.** | T1 adiciona `pty.onExit`; T7 reusa `getPathForFile` no drop SSH. |
| `src/renderer/src/components/TerminalNode.tsx` | Bifurcação de spawn (linha ~134): `sshHost ? { …, sshHost } : { …, initialCommand }`. `connect(id)` liga `pty.onData`/`onData`/`resize`. Drop atual (linha ~194): `onDrop` → `getPathForFile` → `pathsToTerminalInput` → escreve **caminho local** no PTY. `.catch` já escreve `[spawn failed]` no xterm. **Verificado.** | Ponto de enxerto do **estado de conexão** (T2) e da **interceptação de drop SSH** (T7). |
| `src/renderer/src/components/TerminalFlowNode.tsx` | Lê `data.sshHost`; renderiza `<span className="ork-ssh-badge" title={`Remoto: ${sshHost}`}>SSH</span>` (linha ~109) e passa `sshHost` ao `<TerminalNode>`. `nodeState` derivado de `generating`/`hasAttention`. **Verificado.** | Badge SSH é o lugar do **indicador de estado** (T2) e do **botão reconectar** (T3). |
| `src/renderer/src/store/canvasStore.ts` | `addTerminalNode(pos?, { …, sshHost })` grava `data.sshHost` (linha ~482); **deliberadamente fora** do `delete rest.*` do serialize (`serializeNode`, linha ~54 só remove `autostart`) → **persiste e reconecta** ao reabrir. `updateTerminalName`/`updateTerminalRole` (padrão de mutação de `data`). `generating`/`attention` como `Set` efêmero + `setGenerating`. **Verificado.** | Modelo para: estado de conexão efêmero (T2, Map), `reconnectTerminal` (T3), `updateTerminalSshHost` (T4). |
| `src/renderer/src/terminal/dropPaths.ts` | `quotePathForShell(p)` (aspa simples segura p/ espaços/unicode) + `pathsToTerminalInput(paths)`. **Verificado.** | Reusar `quotePathForShell` para o **caminho remoto** escrito no PTY em T7. |
| `src/renderer/src/palette/paletteCommands.ts` + `CommandPalette.tsx` | Item `action:ssh` "Criar terminal SSH remoto" (input `user@host`) → `addSshTerminal(v)` → `trim` + `isValidSshHost` (UX) → `addTerminalNode({ name: 'SSH: '+h, sshHost: h })`. **Verificado.** | Padrão de item de palette com `input.submit` — reusar em T4 (editar destino). |
| `src/renderer/src/components/nodes.css` | `.ork-ssh-badge` (linha ~227, preenchimento `--accent`); `.ork-node-attention` (glow-pulse). **Verificado.** | Base visual para modificadores `--connecting/--connected/--closed` (T2). |
| `src/main/index.ts` | Wiring: `new PtyManager(nodePtySpawner)`; `registerPtyIpc(ipcMain, ptyManager, () => mainWindow?.webContents ?? null, …)`. **Verificado.** | Local para registrar o novo `registerSshIpc` (T6) e onde o `getSender` de `pty:exit` já existe (T1). |

**Fluxo atual verificado:** `Cmd+K → "Criar terminal SSH remoto" → user@host` → validação
UX → nó com `data.sshHost` + badge "SSH" → `pty:spawn({ sshHost })` → main revalida
(`isValidSshHost`) e mapeia para `spawn('ssh', [host])` **sem shell** → PTY interativo →
persiste e reconecta ao reabrir.

---

## 3. Gaps priorizados

| Gap | Prioridade | Valor | Esforço (S/M/L) | Onda |
| --- | --- | --- | --- | --- |
| `pty:exit` não chega ao renderer (infra do estado de conexão) | **P1** | Habilitante (destrava T2/T3) | **S** | 2 |
| Sem feedback visual de estado da conexão SSH (conectando/conectado/caiu) | **P1** | Alto | **M** | 2 |
| Sem botão "reconectar" ao cair a sessão | **P2** | Alto | **S** | 2 |
| Não dá para editar o destino SSH de um nó existente | **P3** | Médio | **S** | 2 |
| Drop de arquivo em terminal SSH escreve caminho **local** (inútil no remoto) — falta `scp` | **P1** | Alto | **M** | 2 |
| GC de arquivos antigos no diretório de drops remoto | **P3** | Baixo | **S** | 2 (opcional) |
| Túnel reverso + `orq` remoto + helper no remoto | **—** | Muito alto | **L** | **Fora do MVP** |
| UI de "configurações por conexão" (Host/Usuário/Porta separados) | **—** | Médio | **M** | Futuro |

---

## 4. Tarefas de implementação (TDD, em ordem)

> Convenção: cada tarefa começa por um teste que **falha**, depois a implementação
> mínima, depois o verde. Rodar sempre o arquivo isolado com `npx vitest run <arquivo>`.
> Segurança: **qualquer** caminho que produza argumentos de `ssh`/`scp` reusa
> `isValidSshHost` (nunca reimplementar) e passa argumentos como **array** (nunca
> string de shell), espelhando o transporte já endurecido.

---

### T1 — Encaminhar `pty:exit` do main para o renderer  [P1 · S · Onda 2]

- **Arquivos a tocar:**
  - `src/main/pty/registerPtyIpc.ts`
  - `src/main/pty/registerPtyIpc.test.ts`
  - `src/preload/index.ts`
- **Passos TDD:**
  1. **Teste que falha** (`src/main/pty/registerPtyIpc.test.ts`): novo caso
     `'pty:spawn encaminha pty:exit ao sender com id e exitCode'` — usar o
     `makeFakePty` já existente estendido para expor `emitExit(code)` (o fake atual
     tem `onExit: () => {}`; criar um `makeExitFakePty` que guarda o cb de exit,
     análogo ao `makeMultiSubFakePty`). Após `pty:spawn`, disparar o exit e
     esperar `sender.send` ter sido chamado com `('pty:exit', id, <exitCode>)`.
  2. **Implementação:** dentro do handler `pty:spawn`, no callback já existente
     `ptyManager.onExit(id, () => batcher.flushOne(id))`, adicionar o encaminhamento:
     `ptyManager.onExit(id, (e) => { batcher.flushOne(id); getSender()?.send('pty:exit', id, e.exitCode) })`.
     (`PtyManager.onExit(id, cb)` já entrega `{ exitCode }` — verificado.)
  3. **Verde:** `npx vitest run src/main/pty/registerPtyIpc.test.ts`.
  - Em `src/preload/index.ts`, adicionar ao objeto `pty`:
    `onExit: (id, cb) => { const l = (_e, incomingId, code) => { if (incomingId === id) cb(code) }; ipcRenderer.on('pty:exit', l); return () => ipcRenderer.removeListener('pty:exit', l) }`
    (mesmo formato de `onData`, com unsubscribe).
- **Critérios de aceite:**
  - `pty:spawn` continua retornando o id e todos os testes atuais passam.
  - Ao sair um pty, o renderer recebe `('pty:exit', id, exitCode)` exatamente uma vez.
  - `window.orkestra.pty.onExit(id, cb)` existe e devolve função de unsubscribe.
- **Notas:** infra genérica (serve a qualquer terminal, não só SSH), risco baixo.
  Não alterar a semântica de `flushOne` (o flush final do output precisa continuar
  acontecendo). O `getSender()` é o mesmo já usado por `pty:data` — nada de sender novo.

---

### T2 — Estado de conexão SSH no nó (conectando / conectado / caiu)  [P1 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/terminal/sshConnectionBadge.ts` ((novo))
  - `src/renderer/src/terminal/sshConnectionBadge.test.ts` ((novo))
  - `src/renderer/src/store/canvasStore.ts`
  - `src/renderer/src/components/TerminalNode.tsx`
  - `src/renderer/src/components/TerminalFlowNode.tsx`
  - `src/renderer/src/components/nodes.css`
- **Passos TDD:**
  1. **Teste que falha** (`sshConnectionBadge.test.ts`): função pura
     `sshBadgeMeta(state)` mapeando `'connecting' | 'connected' | 'closed'` para
     `{ label, className, title }`. Casos concretos:
     `sshBadgeMeta('connecting')` = `{ label: 'SSH', className: 'ork-ssh-badge ork-ssh-badge--connecting', title: 'Conectando…' }`;
     `sshBadgeMeta('closed')` inclui `--closed` e `title` "Sessão encerrada — clique para reconectar";
     `sshBadgeMeta('connected')` inclui `--connected`.
  2. **Implementação:**
     - `sshConnectionBadge.ts`: a função pura acima (sem DOM/React → testável direto).
     - `canvasStore.ts`: adicionar `sshConn: Map<string, 'connecting'|'connected'|'closed'>`
       (efêmero, **nunca serializado** — mesmo racional de `generating`/`attention`;
       sempre atribuir NOVA instância de `Map` para o zustand comparar referência) e
       ação `setSshConn(nodeId, state)`.
     - `TerminalNode.tsx`: no `start()`, quando `sshHost` presente, chamar
       `setSshConn(nodeId, 'connecting')` antes do `spawn`; no **primeiro chunk** em
       `connect()` (guardar `let firstData = true`) chamar `setSshConn(nodeId, 'connected')`;
       assinar `window.orkestra.pty.onExit(id, () => setSshConn(nodeId, 'closed'))`
       (guardar o unsubscribe e chamá-lo no cleanup, junto de `disposeData`). No
       `.catch` do `start()`, `setSshConn(nodeId, 'closed')`.
     - `TerminalFlowNode.tsx`: `const sshConn = useCanvasStore((s) => s.sshConn.get(id))`
       (seletor por id, não o Map inteiro); trocar o badge fixo por
       `sshHost && <span {...sshBadgeMeta(sshConn ?? 'connecting')} title={…}>SSH</span>`
       (mantendo `title={`Remoto: ${sshHost}`}` quando `connected`).
     - `nodes.css`: modificadores `.ork-ssh-badge--connecting` (accent esmaecido +
       pulse sutil), `--connected` (accent sólido, atual), `--closed` (`--err`).
  3. **Verde:** `npx vitest run src/renderer/src/terminal/sshConnectionBadge.test.ts`.
- **Critérios de aceite:**
  - Terminal local (sem `sshHost`): badge inexistente, comportamento inalterado, e
    `sshConn` nunca é escrito (nenhum estado para nós locais).
  - Ao criar um SSH: badge mostra "conectando…" e vira "conectado" quando o `ssh`
    emite o primeiro output (prompt/senha).
  - Ao cair o `ssh` (exit): badge vira "caiu" (cor de erro).
  - `sshConn` **não** aparece no snapshot serializado (adicionar/estender um caso em
    `canvasStore.test.ts` que serializa um nó SSH e verifica que só `data.sshHost`
    persiste — `sshConn` fica de fora).
- **Notas:** "conectado" aqui = "o processo `ssh` está vivo e falando", não
  "autenticado com sucesso" (o prompt de senha também conta como output). Isso é
  suficiente e honesto para o MVP — não tentamos parsear sucesso de auth do stream
  (frágil). Edge case: re-attach de um pty sobrevivente (troca de projeto) — o
  `pty.attach` restaura buffer mas não re-dispara "primeiro chunk"; tratar como
  `connected` se `attached` veio com `ptyId` (o processo está vivo). Cleanup deve
  chamar o unsubscribe de `onExit` para não vazar listener (`ipcRenderer` já tem
  teto de 200, mas higiene importa).

---

### T3 — Reconectar sessão SSH (re-spawn do mesmo destino)  [P2 · S · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/store/canvasStore.ts`
  - `src/renderer/src/store/canvasStore.test.ts`
  - `src/renderer/src/components/TerminalFlowNode.tsx`
- **Passos TDD:**
  1. **Teste que falha** (`canvasStore.test.ts`): `'reconnectTerminal incrementa o epoch efêmero do nó SSH'` — criar um nó SSH, chamar
     `reconnectTerminal(id)`, esperar `data._sshEpoch` ter mudado (de `undefined`/`0`
     para `1`) e que o campo **não** sobreviva ao serialize (adicionar `_sshEpoch` ao
     `delete rest.*` de `serializeNode`, junto de `autostart`).
  2. **Implementação:**
     - `canvasStore.ts`: ação `reconnectTerminal(id)` que faz
       `window.orkestra.pty.killForNode(id)` (mata o pty morto/zumbi, se houver) e
       incrementa `data._sshEpoch` do nó (mutação de `data` no padrão de
       `updateTerminalName`). Adicionar `delete rest._sshEpoch` em `serializeNode`
       (efêmero, como `autostart`).
     - `TerminalFlowNode.tsx`: passar `key={`${id}:${sshEpoch}`}` (ou incluir o epoch
       no `key` do `<TerminalNode>`) para **forçar remount** ao reconectar — no
       remount, `pty.attach` não acha pty vivo (exit já ocorreu) e o `start()` faz um
       `spawn` novo de `ssh <sshHost>`. Renderizar um botão "reconectar"
       (`Icon "RotateCw"`) no header **apenas quando** `sshConn === 'closed'`, `onClick
       = () => reconnectTerminal(id)`.
  3. **Verde:** `npx vitest run src/renderer/src/store/canvasStore.test.ts`.
- **Critérios de aceite:**
  - Botão "reconectar" só aparece quando o estado é "caiu".
  - Clicar reconecta ao **mesmo** `sshHost` (id/posição/nome do nó preservados) e o
    badge volta a "conectando…".
  - `_sshEpoch` não persiste (não polui o snapshot nem o undo).
- **Notas:** reusa TODO o caminho de spawn existente — nenhum código novo de
  transporte. Não usar `removeNode`+`addTerminalNode` (perderia id/posição/edges). O
  `killForNode` antes do remount evita dois ptys concorrentes no caso raro de o nó
  ainda ter um pty vivo.

---

### T4 — Editar o destino SSH de um terminal existente  [P3 · S · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/store/canvasStore.ts`
  - `src/renderer/src/store/canvasStore.test.ts`
  - `src/renderer/src/palette/paletteCommands.ts`
  - `src/renderer/src/palette/paletteCommands.test.ts`
  - `src/renderer/src/components/CommandPalette.tsx`
- **Passos TDD:**
  1. **Teste que falha** (`canvasStore.test.ts`): `'updateTerminalSshHost troca data.sshHost quando válido e ignora inválido'` —
     `updateTerminalSshHost(id, 'deploy@10.0.0.9')` altera `data.sshHost`;
     `updateTerminalSshHost(id, 'a; rm -rf /')` **não** altera (revalida com
     `isValidSshHost`). Também em `paletteCommands.test.ts`: um nó SSH selecionado
     gera o item de contexto `ctx:sshhost:<id>` "Editar destino SSH".
  2. **Implementação:**
     - `canvasStore.ts`: `updateTerminalSshHost(id, host)` — `trim` + `isValidSshHost`;
       se válido, atualiza `data.sshHost` (padrão `updateTerminalRole`) e **bumpa
       `_sshEpoch`** (reusa T3) para forçar o re-spawn com o novo destino.
     - `paletteCommands.ts`: para nó `terminal` com `data.sshHost`, empurrar item de
       contexto com `input.submit = (v) => actions.updateSshHost(n.id, v)`.
     - `CommandPalette.tsx`: fiar `updateSshHost` → `updateTerminalSshHost` (validação
       UX igual a `addSshTerminal`; boundary real segue no main).
  3. **Verde:** `npx vitest run src/renderer/src/store/canvasStore.test.ts src/renderer/src/palette/paletteCommands.test.ts`.
- **Critérios de aceite:**
  - Só nós SSH oferecem "Editar destino SSH".
  - Destino inválido é rejeitado silenciosamente (padrão dos outros inputs de palette).
  - Trocar o destino re-spawna no host novo sem recriar o nó.
- **Notas:** puramente aditivo, reusa `isValidSshHost` e o `_sshEpoch` de T3. Se T3
  não for feito, `updateTerminalSshHost` ainda troca o `data.sshHost` (efeito só na
  próxima reabertura/remount) — dependência **fraca**, não bloqueante.

---

### T5 — Builder puro de comando `scp`/`ssh mkdir` (escapa e sanitiza)  [P1 · S · Onda 2]

- **Arquivos a tocar:**
  - `src/shared/scp.ts` ((novo))
  - `src/shared/scp.test.ts` ((novo))
- **Passos TDD:**
  1. **Teste que falha** (`src/shared/scp.test.ts`): função pura
     `buildScpDrop({ localPath, host, remoteDir })` que **reusa `isValidSshHost`** e
     devolve `{ mkdirArgs, scpArgs, remotePath }`. Casos concretos:
     - `buildScpDrop({ localPath: '/tmp/a.png', host: 'user@h', remoteDir: '/tmp/orkestra-drops' })`
       → `mkdirArgs = ['user@h', 'mkdir', '-p', '/tmp/orkestra-drops']`,
       `scpArgs = ['/tmp/a.png', 'user@h:/tmp/orkestra-drops/a.png']`,
       `remotePath = '/tmp/orkestra-drops/a.png'`.
     - **Injeção de host:** `buildScpDrop({ localPath:'/tmp/a', host:'-oProxyCommand=x', remoteDir:'/tmp/d' })`
       → **lança** (mesma barra de `isValidSshHost`).
     - **Sanitização do nome remoto:** um `localPath` cujo basename tenha
       metacaracteres (ex.: `/tmp/foo;$(rm -rf ~).png` ou espaços) → `remotePath`
       usa um **nome sanitizado** (só `[A-Za-z0-9._-]`, resto vira `_`), evitando
       interpretação pelo shell remoto (o destino remoto do `scp` é expandido pelo
       shell do servidor).
     - **`localPath` vazio/`..`** → lança (não deixa subir caminho).
  2. **Implementação:** `buildScpDrop` — (a) `if (!isValidSshHost(host)) throw`;
     (b) derivar `base = safeRemoteName(basename(localPath))` onde
     `safeRemoteName` faz `.replace(/[^A-Za-z0-9._-]/g, '_')` e recusa vazio/só-pontos;
     (c) montar `mkdirArgs`/`scpArgs`/`remotePath` com `remoteDir` **literal fixo**
     (constante do módulo, não vindo do usuário). Exportar também a constante
     `REMOTE_DROP_DIR = '/tmp/orkestra-drops'`.
  3. **Verde:** `npx vitest run src/shared/scp.test.ts`.
- **Critérios de aceite:**
  - Host inválido nunca produz argumentos (lança antes).
  - Nome remoto é sempre um único segmento seguro (sem `/`, sem metacaractere,
    sem espaço) — nada que o shell remoto reinterprete.
  - Argumentos saem como **arrays** prontos para `spawn` sem shell.
- **Notas de segurança:** este é o gêmeo do `isValidSshHost` para o lado do `scp`.
  Dois vetores distintos: (1) o **host** (reusa a validação existente — arg[0] do
  `scp`, e o `-` inicial já é barrado); (2) o **nome do arquivo**, que vira parte de
  `host:remoteDir/nome` e é **expandido pelo shell remoto** — por isso sanitiza-se o
  basename em vez de confiar em aspas locais. O `remoteDir` é constante, nunca do
  usuário. Não passar `-r` nem flags derivadas de input.

---

### T6 — Handler IPC `ssh:scpDrop` no main (valida, spawna `scp` sem shell)  [P1 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/main/ssh/registerSshIpc.ts` ((novo))
  - `src/main/ssh/registerSshIpc.test.ts` ((novo))
  - `src/main/index.ts`
  - `src/preload/index.ts`
- **Passos TDD:**
  1. **Teste que falha** (`registerSshIpc.test.ts`): usar o padrão de `fakeIpcMain`
     de `registerPtyIpc.test.ts` e **injetar um runner** `runProcess` (`vi.fn`) que
     resolve `{ code: 0 }` — assim o teste **não** spawna `scp`/`ssh` de verdade.
     Casos:
     - `'ssh:scpDrop com host válido roda mkdir e scp com args de array e devolve o caminho remoto'`:
       chamar o handler com `{ host: 'user@h', localPath: '/tmp/a.png' }`; esperar
       `runProcess` chamado com `('ssh', ['user@h','mkdir','-p','/tmp/orkestra-drops'], …)`
       depois `('scp', ['/tmp/a.png','user@h:/tmp/orkestra-drops/a.png'], …)`; retorno
       `= '/tmp/orkestra-drops/a.png'`.
     - `'ssh:scpDrop com host inválido rejeita e não roda nada'`:
       `{ host: 'a; rm -rf /', localPath: '/tmp/a' }` → `rejects.toThrow` e
       `runProcess` **não** chamado.
     - `'ssh:scpDrop propaga falha do scp (code != 0)'` → rejeita.
  2. **Implementação:**
     - `registerSshIpc(ipcMain, runProcess = defaultRunProcess)`: `ipcMain.handle('ssh:scpDrop', async (_e, { host, localPath }) => { const { mkdirArgs, scpArgs, remotePath } = buildScpDrop({ localPath, host, remoteDir: REMOTE_DROP_DIR }); await runProcess('ssh', mkdirArgs); await runProcess('scp', scpArgs); return remotePath })`.
       `buildScpDrop` já lança em host inválido → vira Promise rejeitada (padrão de
       `pty:spawn`). `defaultRunProcess` = `child_process.spawn(file, args, { stdio: 'ignore' })`
       envolto numa Promise que resolve no `close`/rejeita em `code != 0` ou `error`
       (mesma disciplina do transporte: **sem `shell: true`**, args como array).
     - `src/main/index.ts`: `registerSshIpc(ipcMain)` junto dos demais `register*Ipc`.
     - `src/preload/index.ts`: adicionar `ssh: { scpDrop: (host, localPath) => ipcRenderer.invoke('ssh:scpDrop', { host, localPath }) }`.
  3. **Verde:** `npx vitest run src/main/ssh/registerSshIpc.test.ts`.
- **Critérios de aceite:**
  - `scp`/`ssh` sempre spawnados com `file` + `args[]` separados, **sem shell**.
  - Host inválido nunca chega a spawnar (barrado por `buildScpDrop`/`isValidSshHost`).
  - Retorno é o caminho remoto absoluto; falha do `scp` vira rejeição da `invoke`.
- **Notas:** reusa `~/.ssh` do SO (chaves/agent/config) exatamente como o `ssh` do
  transporte — nada de gestão de chaves própria. `mkdir -p` garante o diretório
  (idempotente); o argumento é **literal fixo**, sem input do usuário. **GC (opcional,
  P3):** um terceiro `runProcess('ssh', [host,'find',REMOTE_DROP_DIR,'-type','f','-mmin','+60','-delete'])`
  best-effort (ignorar falha) replica o "remove após 60 min" do Maestri — deixar como
  passo separado/flag para não bloquear o caminho feliz. Risco: `scp` pode pedir
  senha interativa se a chave não estiver no agent — no MVP isso falha (sem TTY) e o
  drop é rejeitado; T7 mostra o erro no PTY. Aceitável (documentar); a maioria dos
  usuários de SSH remoto usa chave/agent.

---

### T7 — Interceptar drop em terminal SSH → `scp` → escrever caminho remoto no PTY  [P1 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/renderer/src/components/TerminalNode.tsx`
  - `src/renderer/src/terminal/dropPaths.ts` (reuso; sem mudança de assinatura)
  - `src/renderer/src/terminal/dropPaths.test.ts` (se necessário, novo caso)
- **Passos TDD:**
  1. **Teste que falha:** a lógica de decisão do drop é hoje inline no `useEffect` do
     `TerminalNode` (difícil de testar). **Extrair uma função pura**
     `remoteDropText(remotePaths: string[])` em `dropPaths.ts` — na prática é o mesmo
     `pathsToTerminalInput` aplicado aos **caminhos remotos** já resolvidos; adicionar
     um teste `'remoteDropText aspa e junta os caminhos remotos'`
     (`remoteDropText(['/tmp/orkestra-drops/a.png'])` = `"'/tmp/orkestra-drops/a.png' "`).
     (Se preferir não duplicar, testar que `pathsToTerminalInput` já cobre o caso e
     apenas garantir a orquestração no componente por revisão.)
  2. **Implementação (`TerminalNode.tsx`, handler `onDrop`):** bifurcar por modo —
     - **Local (sem `sshHost`)**: comportamento atual inalterado (`getPathForFile` →
       `pathsToTerminalInput` → `pty.write` do caminho local).
     - **SSH (`sshHost` presente)**: para cada arquivo, `getPathForFile` → chamar
       `await window.orkestra.ssh.scpDrop(sshHost, localPath)` (sequencial ou
       `Promise.all`), coletar os **caminhos remotos** retornados, montar o texto com
       `pathsToTerminalInput` (que usa `quotePathForShell`) e `pty.write` no PTY +
       `term.focus()`. Em erro do `scpDrop`, escrever no xterm uma linha discreta
       (`\r\n[scp falhou] …\r\n`, mesmo tom do `[spawn failed]` já existente) e não
       escrever caminho nenhum. Enquanto o `scp` roda, opcionalmente marcar o badge
       (reusar `sshConn`? não — é ortogonal; deixar simples: só o feedback de erro).
  3. **Verde:** `npx vitest run src/renderer/src/terminal/dropPaths.test.ts` + revisão
     manual do componente (o `onDrop` é integração de UI; a parte pura é o texto).
- **Critérios de aceite:**
  - Drop em terminal **local**: idêntico ao de hoje (caminho local escrito).
  - Drop em terminal **SSH**: arquivo aparece em `/tmp/orkestra-drops/<nome-seguro>`
    no remoto e o **caminho remoto** (aspado) é inserido no PTY — o agente remoto
    referencia o arquivo.
  - Falha de `scp` mostra erro legível no terminal, sem inserir caminho.
- **Notas:** o `host` passado ao `scpDrop` é o `sshHost` do próprio nó (já validado na
  criação e revalidado no main por `buildScpDrop`). **Nunca** montar comando de shell
  no renderer — o renderer só passa `(host, localPath)` para o IPC; toda a construção
  de argumentos e a validação vivem no main (T5/T6). Múltiplos arquivos: enviar em
  sequência para não saturar conexões `scp` paralelas. Edge: arquivo grande → `scp`
  demora; o `await` no `onDrop` é aceitável (o drop é uma ação pontual), mas evitar
  bloquear a UI (o `await` é assíncrono, não trava o render).

---

## Fora do MVP: túnel reverso ("workspace SSH" completo)

O grande salto do Maestri — `ssh -R` (túnel reverso com bind em `127.0.0.1:7433`) +
**script helper** instalado no remoto (`~/.local/bin/…`, wrapper de curl) para que o
`orq`/agente remoto **fale de volta** com o servidor local do Orkestra — está
**deliberadamente fora desta onda**. Motivos concretos, não preguiça:

- **Segurança do túnel.** Abrir um canal de rede persistente muda o modelo de
  ameaça: bind, ciclo de vida, reabertura em queda, autenticação do callback. É um
  novo *boundary* de segurança inteiro, não um refinamento do que já existe.
- **Escopo de projeto no remoto vs. incidente de corrupção cross-project.** O
  transporte de coordenação faria o `orq` remoto emitir comandos contra o servidor
  local. O Orkestra **já teve** um incidente de corrupção cross-project (memória
  `incidente-corrupcao-cross-project.md`) e o escopo de projeto do `orq` ainda é um
  follow-up. Trazer agentes de **outra máquina** para dentro desse barramento antes de
  o escopo estar sólido é reintroduzir o mesmo risco amplificado pela rede.
- **Instalar coisa no servidor do usuário.** O helper (mesmo "inspecionável") é
  footprint no host alheio: caminho, PATH, permissões, versão. Exige UX de confiança e
  manutenção que não cabem num degrau pequeno.
- **Ciclo de vida complexo.** Monitorar/reabrir o túnel, lidar com múltiplos
  workspaces, GC do helper — esforço **L** com risco alto, ao contrário dos degraus
  **S/M** desta onda que reusam 100% do transporte já endurecido.

**Registro como aposta futura:** vale um plano dedicado, depois de (a) o escopo de
projeto do `orq` estar fechado e auditado, e (b) as tarefas T1–T7 acima estarem no ar
(feedback de conexão e transferência de arquivo já dão a maior parte do valor
percebido de "trabalhar num agente remoto"). A UI de "configurações por conexão"
(Host/Usuário/Porta/Caminho do Script/PATH separados) é conveniência sobre uma base
que já funciona via `~/.ssh/config` — também futuro, prioridade menor.

---

## 5. Dependências & riscos

- **Ordem:** T1 é habilitante de T2 e T3 (sem `pty:exit` no renderer não há sinal de
  "caiu"). T5 é habilitante de T6, que é habilitante de T7. T4 depende **fracamente**
  de T3 (só para o re-spawn imediato ao trocar destino). T2 é independente de T5–T7.
  Duas trilhas paralelas: **(A)** T1→T2→T3→T4 (estado/conexão); **(B)** T5→T6→T7 (scp).
- **Não regredir o transporte (crítico):** nenhuma tarefa pode afrouxar o allowlist de
  `pty:spawn` nem a validação `isValidSshHost`. `scp`/`ssh` novos passam pelo mesmo
  padrão: args em **array**, host por `isValidSshHost`, sem `shell: true`. Rodar a
  suíte inteira (`npm run test` / os `*.test.ts` de pty e ssh) após cada tarefa para
  garantir que os testes de segurança existentes continuam verdes.
- **`scp` sem TTY:** se a autenticação exigir senha interativa, o `scp` do handler
  (stdio ignorado) falha. Mitigação MVP: reportar erro no terminal (T7). Documentar
  que o drop remoto pressupõe chave/agent (o mesmo `~/.ssh` que o transporte usa).
- **Nome de arquivo hostil no remoto:** mitigado por `safeRemoteName` (T5) — o destino
  do `scp` é expandido pelo shell remoto, então sanitizar o basename é obrigatório
  (aspas locais não protegem o lado remoto).
- **Windows:** `ssh`/`scp` assumidos no PATH (OpenSSH client, presente no Win10+),
  mesma premissa do transporte atual. Fora do escopo desta onda endurecer a mensagem
  de ausência (item 8 da análise, prioridade baixa).
- **Efêmeros no serialize:** `sshConn` (Map, T2) e `_sshEpoch` (T3) **não** podem
  vazar para o snapshot/undo — cobrir com teste de serialize (mesmo cuidado que
  `generating`/`autostart`).
- **Verificação final por tarefa:** `npx vitest run <arquivo>` (verde) → `npm run
  typecheck` → `npm run lint`; validação de UX real com `npm run dev` (criar SSH, ver
  badge mudar de estado, cair a conexão, reconectar, arrastar um arquivo e conferir o
  caminho remoto no prompt).

---

## 6. Referências

- **Origem/pesquisa:** `docs/analise-maestri-360/ssh-remoto.md` (§5 estado atual, §6
  melhorias 1–5).
- **Doc oficial Maestri:** `https://www.themaestri.app/pt-br/docs/ssh` (drag-drop para
  `/tmp/maestri-drops`, GC 60 min, bind localhost, usa `~/.ssh`).
- **Código verificado (transporte — não regredir):**
  - `src/shared/ssh.ts` · `src/shared/ssh.test.ts`
  - `src/main/pty/registerPtyIpc.ts` · `src/main/pty/registerPtyIpc.test.ts`
  - `src/main/pty/PtyManager.ts` · `src/main/pty/nodePtySpawner.ts`
  - `src/preload/index.ts`
  - `src/renderer/src/components/TerminalNode.tsx` · `TerminalFlowNode.tsx`
  - `src/renderer/src/store/canvasStore.ts`
  - `src/renderer/src/terminal/dropPaths.ts`
  - `src/renderer/src/palette/paletteCommands.ts` · `CommandPalette.tsx`
  - `src/renderer/src/components/nodes.css`
  - `src/main/index.ts` (wiring dos `register*Ipc`)
- **Arquivos novos previstos:** `src/renderer/src/terminal/sshConnectionBadge.ts`
  (+ `.test.ts`); `src/shared/scp.ts` (+ `.test.ts`); `src/main/ssh/registerSshIpc.ts`
  (+ `.test.ts`).
- **Memória relacionada:** `incidente-corrupcao-cross-project.md` (motiva adiar o
  túnel reverso até o escopo de projeto do `orq` estar fechado).
