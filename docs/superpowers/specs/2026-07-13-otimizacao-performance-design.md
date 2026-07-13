# Otimização de performance — mais leve e fluido

**Data:** 2026-07-13
**Status:** aprovado

## Contexto e problema

O Orkestra apresenta três sintomas de peso, confirmados pelo usuário:

1. **Canvas lento ao navegar/zoom**, especialmente com vários nós.
2. **Inicialização demorada** do app e do carregamento de projetos.
3. **Consumo alto de CPU/memória** mesmo em uso contínuo.

A quantidade de nós no canvas varia muito por projeto — a solução precisa escalar bem
em qualquer tamanho de canvas.

### Gargalos identificados (diagnóstico no código)

| # | Gargalo | Onde | Sintoma |
|---|---------|------|---------|
| 1 | `app.disableHardwareAcceleration()` força renderização por software | `src/main/index.ts:142` | canvas, CPU |
| 2 | xterm.js usa renderer DOM (sem WebGL) — centenas de elementos DOM por terminal repintados a cada frame de pan/zoom | `src/renderer/src/components/TerminalNode.tsx` | canvas, CPU |
| 3 | Nenhuma virtualização — todos os nós renderizam sempre, mesmo fora da viewport | `Canvas.tsx` / React Flow | canvas, memória, boot |
| 4 | Cada chunk de output de pty vira uma mensagem IPC individual | `src/main/pty/registerPtyIpc.ts:54` | CPU |
| 5 | Mirror de orquestração (canvas inteiro) reenviado via IPC a cada mudança de nós — inclusive a cada frame de arraste (~60x/s), embora posição nem faça parte do mirror | `src/renderer/src/hooks/useOrchestrationSync.ts:27-40` | CPU |
| 6 | `createWindow()` só roda depois de `await orchestration.start()` + `installOrq` (I/O de disco) | `src/main/index.ts:144-209` | boot |
| 7 | Hidratação monta todos os nós de uma vez: todos os ptys spawnam e todos os webviews carregam no boot | consequência de #3 | boot, memória |

## Decisões de escopo (aprovadas pelo usuário)

- Abordagem **B**: fundação de renderização + suspensão de nós fora da tela.
- Suspensão "à vontade": nós fora da viewport podem parar de renderizar por completo;
  processos (ptys/agentes) continuam rodando por baixo.
- **Portais são exceção**: `<webview>` desmontado recarrega a página (perderia scroll,
  texto digitado). Portais ficam sempre montados.
- Fora de escopo (possível fase futura): pausa de writes de xterm ocultos com flush ao
  reaparecer, memoização fina de componentes.

## Design

### Bloco 1 — Renderização por GPU + WebGL no xterm

**1a. Religar aceleração de hardware.** Remover `app.disableHardwareAcceleration()` de
`src/main/index.ts`. A linha silenciava erros de driver EGL em Macs Intel — ruído de
log, não quebra funcional. Rede de segurança: fallback opt-in via variável de ambiente
`ORKESTRA_NO_GPU=1`, que restaura o comportamento atual sem recompilar:

```ts
if (process.env.ORKESTRA_NO_GPU === '1') app.disableHardwareAcceleration()
```

Validação obrigatória na máquina do usuário (Mac Intel, macOS 12) logo após a mudança.
Se a renderização quebrar de fato, o fallback cobre e a decisão é reavaliada.

**1b. WebGL no xterm.** Adicionar `@xterm/addon-webgl` (dependência nova) ao
`TerminalNode`:

- Após `term.open(el)`, tentar `term.loadAddon(new WebglAddon())` dentro de try/catch.
- Em falha de criação de contexto → seguir com o renderer DOM (comportamento atual).
- Em `webglAddon.onContextLoss` → `webglAddon.dispose()` (xterm volta ao DOM sozinho).
- O navegador limita ~16 contextos WebGL simultâneos; a suspensão do Bloco 4 mantém
  poucos terminais montados por vez, então os dois blocos se complementam. O fallback
  cobre o caso de estourar o limite mesmo assim.
- Com `ORKESTRA_NO_GPU=1`, o WebGL cai no fallback naturalmente (contexto por software
  falha ou funciona degradado — em ambos os casos o try/catch/onContextLoss cobre).

### Bloco 2 — Dieta de IPC

**2a. Batching de `pty:data`.** Em `registerPtyIpc.ts`, substituir o envio direto
(`getSender()?.send('pty:data', id, data)` por chunk) por um acumulador por ptyId com
flush a cada ~16ms (um frame):

- `Map<ptyId, string>` acumula os chunks; um `setTimeout(flush, 16)` é armado no
  primeiro chunk pendente.
- `flush` envia UMA mensagem `pty:data` por pty com a string concatenada e limpa o Map.
- Ordem preservada por pty (concatenação em ordem de chegada). Nenhuma mudança de
  contrato no renderer: `pty:data` continua entregando `(id, string)`.
- No exit do pty, flush imediato do pendente daquele pty (não perder o final do output).
- A lógica de acumulação/flush é extraída como classe/função pura testável
  (ex.: `PtyDataBatcher`), injetando o relógio/scheduler nos testes.

**2b. Mirror só quando muda.** Em `useOrchestrationSync.ts`, guardar o último mirror
enviado (ref com a forma serializada, ex.: `JSON.stringify`) e comparar antes de
enviar. Arrastar nós muda apenas `position`, que não entra no mirror → mirror idêntico
→ zero IPC durante drag. A comparação é O(tamanho do mirror), barata (o mirror é leve
por construção).

### Bloco 3 — Boot mais rápido

Reordenar `app.whenReady()` em `src/main/index.ts`: `createWindow()` passa a rodar
ANTES do bloco `await orchestration.start()` + `installOrq`. A janela aparece enquanto
o servidor de orquestração sobe em paralelo.

- Seguro porque `orchestrationEnv` já é late-bound: `registerPtyIpc` recebe
  `() => orchestrationEnv` e lê no momento de cada spawn. Um terminal spawnado antes do
  servidor subir nasce sem `ORKESTRA_PORT/TOKEN` (mesmo comportamento atual quando a
  orquestração falha — degradação já prevista).
- Os registros de IPC (`registerPtyIpc`, `registerPersistenceIpc`, etc.) e o
  `ProjectManager.bootstrap()` continuam ANTES de `createWindow()` — o renderer depende
  deles no load. Só a orquestração (start + installOrq) vai para depois, sem `await`
  bloqueante do caminho da janela.

### Bloco 4 — Suspensão de terminais fora da tela

**4a. Hook `useNodeVisibility`.** Novo hook no renderer:

- `IntersectionObserver` sobre o elemento raiz do nó (ref no wrapper `.ork-node`),
  observando contra a viewport (root default), com `rootMargin` generoso
  (ex.: `200px`) para pré-montar nós que estão quase entrando na tela.
- Histerese temporal: ao sair da viewport, aguarda ~500ms antes de reportar
  "invisível" (cancela se voltar antes) — evita pisca-pisca durante pan rápido.
  Ao entrar, reporta "visível" imediatamente.
- Retorna `boolean` (visível/suspenso). A lógica de decisão (entra/sai/timer) é
  extraída como função pura testável; o hook é só a cola com o observer.

**4b. `TerminalFlowNode` suspende o corpo.** Quando invisível:

- Desmonta o `<TerminalNode>` (o cleanup atual já NÃO mata o pty — Fase 31) e renderiza
  no lugar um placeholder leve do mesmo tamanho (div estilizada, ex.: nome + "suspenso").
- O pty segue vivo no main acumulando buffer (cap 256KB já existente).
- Ao voltar à viewport, `<TerminalNode>` remonta e o fluxo de `pty.attach` existente
  restaura o scrollback e reconecta os streams. Nenhuma mudança no main é necessária.
- Header do nó (nome, papel, badges, ×) continua renderizado — só o corpo pesado some.
- Indicador de atenção (Fase 20) continua funcionando: vem do main via nodeId,
  independente do xterm montado.

**4c. Efeito colateral desejado no boot:** num canvas grande, terminais fora da
viewport inicial não spawnam/attacham no load — só quando entram na tela.

**Não incluídos na suspensão:** portais (sempre montados — ver decisões de escopo),
notas, filetree e grupos (baratos).

## Fluxo de dados (suspensão)

```
nó entra na viewport ──▶ useNodeVisibility=true ──▶ monta TerminalNode
                                                      └▶ pty.attach(nodeId)
                                                          ├▶ pty vivo? restaura buffer + reconecta
                                                          └▶ não? spawn normal
nó sai da viewport ──▶ (500ms) useNodeVisibility=false ──▶ desmonta TerminalNode
                                                             └▶ pty CONTINUA vivo no main
```

## Tratamento de erros

- WebGL indisponível/contexto perdido → fallback silencioso para renderer DOM.
- GPU problemática na máquina → `ORKESTRA_NO_GPU=1` restaura renderização por software.
- Flush de batching no exit do pty → o final do output nunca se perde.
- Suspensão durante spawn em voo → o guard `disposed` existente no `TerminalNode` já
  cobre (não conecta após desmonte; pty fica vivo para o re-attach).

## Testes

- **Unitários:** `PtyDataBatcher` (acumulação, ordem, flush por timer e por exit);
  diff do mirror (mudança de posição não reenvia; mudança de nome/role/preset reenvia);
  função pura de decisão de visibilidade (histerese de saída, entrada imediata).
- **Manuais (validação na máquina do usuário):** renderização correta com GPU ligada;
  fluidez de pan/zoom com múltiplos terminais; suspensão/re-attach preservando
  scrollback e processos; boot com canvas grande; portais não recarregam ao navegar.

## Critérios de sucesso

1. Pan/zoom do canvas fluido com múltiplos terminais abertos.
2. Janela do app aparece perceptivelmente mais rápido no boot.
3. CPU em repouso e durante output intenso de agentes visivelmente menor
   (menos mensagens IPC, terminais suspensos não processam DOM).
4. Nenhuma regressão funcional: re-attach preserva scrollback, portais mantêm estado,
   atenção de agente continua funcionando, autosave/troca de projeto inalterados.
