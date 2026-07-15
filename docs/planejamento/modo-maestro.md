# Plano de Implementação — Modo Maestro
> **Origem:** `docs/analise-maestri-360/modo-maestro.md` · **Status:** Proposto (pronto para execução) · **Onda(s):** 1 e 2 (com apontamentos de Onda 3)

## 1. Objetivo & valor

Promover um terminal-agente comum a **Maestro**: um gerente que recruta, posiciona, conecta,
reatribui e dispensa colegas no próprio canvas — exatamente como o humano faria na mão. O
**encanamento já existe e é robusto** (servidor de orquestração HTTP local + CLI `orq` +
espelho do canvas + relay de comandos para o renderer): `orq recruit`/`connect`/`dismiss`
funcionam **ponta a ponta** hoje (verificado — ver §2). O que falta é a **camada de produto**:

1. O agente **não sabe** que esses verbos existem — o `ONBOARDING` injetado no system prompt do
   `claude` documenta só `context/list/ask/check/portal`. Sem isso, ~90% do Maestro é invisível
   ao agente (ele nunca chamaria um comando que ninguém lhe ensinou).
2. `recruit` cria o terminal numa **posição em cascata genérica**, **sem** cair abaixo do Maestro
   e **sem** auto-conectar — então recrutar não reproduz o gesto do Maestri e o recruta nasce solto.
3. Não existe o **conceito de Maestro** (toggle por terminal + gating), nem **reatribuição de papel
   mid-task**, nem **template de esquadrão**, nem o **"recrutas sabem quem são"** (`orq whoami`).

Valor: transformar um encanamento pronto num **papel de produto usável** — o humano dá uma ordem de
alto nível ("monte uma fábrica de software e dispense cada um ao terminar") e o Maestro orquestra.

## 2. Estado atual no código (verificado)

| Arquivo real | O que já faz | Relevância |
| --- | --- | --- |
| `src/main/orchestration/OrchestrationServer.ts` | HTTP em `127.0.0.1` porta efêmera, token 24 bytes (`timingSafeEqual`); rotas `GET /list,/context,/check,/portal`, `POST /note,/recruit,/dismiss,/connect,/ask,/portal/*`; **409** em mismatch de projeto (`x-orkestra-project` vs `getActiveProjectId`), **503** sem renderer vivo, **413** corpo > 1 MB. | Base de todos os verbos. `/recruit` (L165-182) aceita só `{name,preset,role?}`; **`/note` (L151-164) já aceita `from`** — o padrão a copiar para recruit/connect/dismiss. |
| `src/orq/orq.ts` | CLI: `list`, `context`, `note write [--to]`, `ask [--wait/--raw/--batch]`, `check`, `recruit`, `dismiss`, `connect`, `portal *`. Lê `ORKESTRA_PORT/TOKEN/PROJECT_ID/NODE_ID` do env; envia `x-orkestra-project`; `errOut()` traduz 409/503 em orientação ao agente. | `recruit` (L145-153) manda `{name,preset,role}` **sem `from`**; `context` (L45-55) **já** usa `env.ORKESTRA_NODE_ID` como `from` — o precedente exato para `recruit`/`whoami`. |
| `src/main/orchestration/installOrq.ts` | Constante `ONBOARDING` (L8-18) injetada via wrapper `claude` + `--append-system-prompt`; instala `orq` em `~/.orkestra/bin`. | **Documenta só `context/list/ask/check/portal`** — falta `recruit/connect/dismiss/note write`. Wrapper é **só do `claude`** (codex/gemini recebem `orq` no PATH, sem onboarding). |
| `src/main/orchestration/AgentBus.ts` | `ask()`/`writeRaw()`/`read()`; `waitForIdle()` (sustenta `ask --wait`); watchers `onAttention`/atenção. | Sustenta `ask`/`check`. Não muda para o Maestro, mas é o barramento por trás de `reassign` reiniciar processo. |
| `src/renderer/src/hooks/useOrchestrationSync.ts` | Envia o **mirror** ao main (diff serializado, ignora posição); aplica comandos: `recruit`→`addTerminalNode(undefined,{...})`, `dismiss`→`removeNode`, `connect`→`onConnect` (resolve nome→nó), `updateNote`, portais. Guard de escopo de projeto. | **Ponto-chave do recruit**: L95-96 cria em cascata, **sem posição do Maestro e sem `onConnect`**. É aqui que a Onda 1 (posicionar+conectar) atua. |
| `src/shared/orchestration.ts` | `MirrorNode {id,type,name,content?,role?,preset?,monitor?}` (**sem `position`**); `MirrorEdge{source,target}`; `OrchestrationCommand` inclui `recruit/dismiss/connect` (recruit **sem `from`**; note **com `from`**). | O mirror **não carrega posição** — corrige a nota da análise ("o servidor já tem `from` no mirror"): o servidor **relaya o `from`** (id), mas a **posição** vive no store do renderer. Posicionar o recruta é no renderer. |
| `src/renderer/src/store/canvasStore.ts` | `addTerminalNode(pos?, {preset,role,name,sshHost,monitor})` (L463-496, gera id interno, **retorna void**); `updateTerminalRole(id,role)` (L616, só toca `data.role` — preserva posição/nome/edges); `onConnect(Connection)` (L867, deriva kind pelos tipos); `removeNode` mata pty. `serialize` só remove `autostart` (então `data.monitor`/`maestro` **persistem**). | `updateTerminalRole` é a base do `reassign`. `addTerminalNode` não devolve o id — bloqueia auto-conectar; precisa de uma ação que crie+posicione+conecte atômica. `data.monitor` é o **precedente exato** de um `data.maestro`. |
| `src/main/pty/registerPtyIpc.ts` | Cada pty nasce com `ORKESTRA_NODE_ID` (L70) e `ORKESTRA_PROJECT_ID` (L71) no env; auto-início do `claude` pelo wrapper absoluto. | `ORKESTRA_NODE_ID` **já disponível** — desbloqueia `whoami`, `recruit --from`, gating por origem. |
| `src/main/index.ts` | Fia o `OrchestrationServer` (`onCommand`→`webContents.send('orchestration:command', cmd, projectId)`, `ask/askWait/askRaw/check`, `getActiveProjectId`) e o `AgentBus`. | Onde novos `opts` do servidor (ex.: gating não precisa de nada aqui; `reassign` reusa o relay `onCommand`). |
| `src/renderer/src/components/NewTerminalModal.tsx` | Modal de criação: presets, abas **Detalhes/Aparência**, checkbox **"Monitorar atividade"** (`data.monitor`), segmented de **Papel** (`PRESET_ROLES`). | O lugar do checkbox **"Maestro"** — copia a mecânica do checkbox `monitor` (L159-169). |
| `src/shared/roles.ts` | `PRESET_ROLES`: Líder, Dev, Revisor, Testador (cor/hint). | Falta **Docs/Redator** para o template de esquadrão canônico (Dev+Revisor+Testador+Docs). |
| `src/renderer/src/edges/edgeKind.ts` | `deriveEdgeKind` → `'agent'` para terminal↔terminal; kinds `agent/chain/note/portal/link`. | A aresta `agent` **já existe** visualmente, mas **não roteia contexto** — território do **plano de Conexões**. |

**Conclusão da verificação:** recruit/connect/dismiss funcionam ponta a ponta (testes em
`OrchestrationServer.test.ts` L234-323 e `orq.test.ts` L237-267 provam). O que falta é produto,
não encanamento.

## 3. Gaps priorizados

| Gap | Prioridade | Valor | Esforço | Onda |
| --- | --- | --- | --- | --- |
| #1 Documentar verbos de gerência (`recruit/connect/dismiss/note write`) no `ONBOARDING` | P1 | Altíssimo (destrava ~90% do Maestro) | S | 1 |
| #8 `orq whoami` / `list --me` — "recrutas sabem quem são" (usa `ORKESTRA_NODE_ID`) | P1 | Alto | S | 1 |
| #3 `recruit` posiciona abaixo do Maestro + auto-conecta (`from` + `onConnect`) | P1 | Alto (reproduz o gesto-chave do Maestri) | M | 1 |
| #7 `recruit` herda o preset do Maestro quando omitido ("cópia de si mesmo") | P2 | Médio | S (depende do `from` do #3) | 1/2 |
| Modo Maestro como **toggle por terminal** (`data.maestro`) + onboarding ciente | P2 | Alto (materializa o conceito) | M | 2 |
| Gating server-side: recusar recruit/connect/dismiss de nó **não-Maestro** | P2 | Alto (permissão como produto) | M | 2 |
| #4 `reassign` mid-task (troca papel + reinicia processo, preserva posição/nome/conexões) | P2 | Alto | M | 2 |
| Template de **esquadrão** (Dev+Revisor+Testador+Docs, conectados à nota-spec) | P2 | Alto (encapsula o exemplo canônico) | M | 2 |
| Aresta `agent` **carregada** (contexto roteado por conexão entre terminais) | P2 | Alto | M/L | 2 → **plano de Conexões** |
| #6 Onboarding multi-agente (codex/gemini) | P3 | Médio | M/L | 3 |
| #5 Andares (floors) / working trees isoladas (`orq floor create`) | P3 | Alto | L | 3 |

## 4. Tarefas de implementação (TDD, em ordem)

### T1 — Documentar os verbos de gerência no `ONBOARDING`  [P1 · S · Onda 1]
- **Arquivos a tocar:** `src/main/orchestration/installOrq.ts` (edição da string `ONBOARDING`), `src/main/orchestration/installOrq.test.ts`.
- **Passos TDD:**
  1) **Teste que falha** — em `installOrq.test.ts`, estender o caso "o onboarding descreve os comandos orq" (L60-67) com asserts novos: `expect(onboard).toContain('orq recruit')`, `toContain('orq connect')`, `toContain('orq dismiss')`, `toContain('orq note write')`. Falha hoje (a string não menciona nenhum deles).
  2) **Implementação** — acrescentar, na constante `ONBOARDING`, um bloco descrevendo os verbos de gerência com a assinatura exata do `orq.ts`:
     - `orq recruit "<nome>" "<preset>" ["<papel>"]` — cria um novo terminal-agente **abaixo de você**, já conectado a você (presets: `shell`/`claude`/`codex`/`gemini`; papéis: `Dev`/`Revisor`/`Testador`/`Docs`).
     - `orq connect "<A>" "<B>"` — liga dois terminais (ou um recruta a uma nota já conectada a você).
     - `orq dismiss "<nome>"` — fecha o terminal de um recruta quando o trabalho dele termina.
     - `orq note write [--to "<nome/id>"] "<texto>"` — escreve numa nota (sem `--to`, na nota ligada à sua saída).
     - `orq whoami` — mostra seu próprio nome, papel e conexões (ver T2).
     - Incluir a ressalva: *"Estes verbos de gerência só têm efeito se este terminal for um **Maestro**; caso contrário o Orkestra recusa o comando"* (alinha com o gating de T6, que é a aplicação real da permissão — a documentação é incondicional por simplicidade).
  3) **Verde** — `npx vitest run src/main/orchestration/installOrq.test.ts`.
- **Critérios de aceite:**
  - `~/.orkestra/onboarding.txt` (reescrito a cada boot) contém `orq recruit`, `orq connect`, `orq dismiss`, `orq note write`, `orq whoami`.
  - O teste `o wrapper gerado tem sintaxe sh válida` (L40-44) continua verde (a string entra em `onboarding.txt`, não no script `sh` — sem risco de escape, mas conferir que nenhuma crase/`$` novo vaze para `CLAUDE_WRAPPER`).
  - **Checklist manual textual:** revisar o texto em português correndo o app em dev e abrindo um `claude` num terminal — pedir "quais comandos orq de gerência você tem?" e confirmar que ele lista recruit/connect/dismiss.
- **Notas:** edição de string pura, best-effort (se falhar, `orq` segue funcionando). É o item de maior alavancagem do plano — priorizar. Não altera o wrapper `sh` em si.

### T2 — `orq whoami` (e `list --me`)  [P1 · S · Onda 1]
- **Arquivos a tocar:** `src/orq/orq.ts`, `src/orq/orq.test.ts`, `src/orq/whoami.ts` ((novo), helper puro), `src/orq/whoami.test.ts` ((novo)).
- **Passos TDD:**
  1) **Teste que falha** — em `whoami.test.ts`, testar um helper puro `describeSelf(mirror, nodeId)`:
     - caso "nó com papel e conexões": `mirror = { nodes:[{id:'t1',type:'terminal',name:'Líder',role:'Líder'},{id:'n1',type:'note',name:'Spec'},{id:'t2',type:'terminal',name:'Dev'}], edges:[{source:'n1',target:'t1'},{source:'t1',target:'t2'}] }`, `describeSelf(mirror,'t1')` retorna string contendo `Líder`, `papel: Líder`, e as conexões `Spec` e `Dev`.
     - caso "id ausente no mirror" → string amigável tipo `orq: não foi possível identificar este terminal`.
     - Em `orq.test.ts`, caso de integração: `runOrq(['whoami'], {...env, ORKESTRA_NODE_ID:'t1'})` retorna `code 0` e `out` contém o nome do próprio nó (buscando `/list`, que já devolve nodes+edges).
  2) **Implementação** — `describeSelf(mirror: CanvasMirror, nodeId: string): string` puro em `whoami.ts` (resolve o nó por id; lista vizinhos via `edges` em qualquer direção, mapeando id→name). Em `orq.ts`, ramo `if (cmd === 'whoami')`: `GET /list` (já existe), parseia o mirror, chama `describeSelf(mirror, env.ORKESTRA_NODE_ID ?? '')`. Também aceitar `list --me` como alias (no ramo `list`, se `argv.includes('--me')`, delega ao mesmo helper). Atualizar a string de uso (L224-228) com `whoami`.
  3) **Verde** — `npx vitest run src/orq/whoami.test.ts src/orq/orq.test.ts`.
- **Critérios de aceite:**
  - `orq whoami` num terminal com `ORKESTRA_NODE_ID` setado imprime nome + papel + nomes dos blocos/agentes conectados.
  - Sem `ORKESTRA_NODE_ID` (orq externo/legado), degrada com mensagem clara, `code != 0`.
  - Nenhum endpoint novo no servidor (reusa `/list`); herda o escopo de projeto (409) de graça.
- **Notas:** manter a lógica em helper puro `describeSelf` (fácil de testar sem servidor). Direção da aresta não importa (mesma semântica de `context`). `list --me` é conveniência; `whoami` é o comando principal (mais legível para o agente).

### T3 — `recruit` posiciona abaixo do Maestro e auto-conecta  [P1 · M · Onda 1]
- **Arquivos a tocar:** `src/orq/orq.ts`, `src/orq/orq.test.ts`, `src/main/orchestration/OrchestrationServer.ts`, `src/main/orchestration/OrchestrationServer.test.ts`, `src/shared/orchestration.ts`, `src/renderer/src/store/canvasStore.ts`, `src/renderer/src/store/canvasStore.test.ts`, `src/renderer/src/hooks/useOrchestrationSync.ts`.
- **Passos TDD:** (três camadas testáveis; a integração pty fica para verificação manual)
  1) **Testes que falham:**
     - **CLI** (`orq.test.ts`): `runOrq(['recruit','Dev','claude','Dev'], {...env, ORKESTRA_NODE_ID:'t1'})` emite `{type:'recruit', name:'Dev', preset:'claude', role:'Dev', from:'t1'}`. Falha hoje (não manda `from`). Ajustar também o caso existente L237-243 para o novo shape com `from`.
     - **Servidor** (`OrchestrationServer.test.ts`): `POST /recruit` com `{name,preset,role,from:'t1'}` emite comando com `from:'t1'`; sem `from` (legado) continua emitindo sem o campo (retrocompat, como `/note`).
     - **Store** (`canvasStore.test.ts`, jsdom): novo action `recruitBelow(fromId, {name,preset,role})` — dado um terminal `t1` em `{x:100,y:100}`, `recruitBelow('t1',{name:'Dev',preset:'claude'})` (a) cria um terminal cuja `position.y` é **maior** que a de `t1` (abaixo) e `position.x` alinhada; (b) adiciona uma **edge** `t1 → novo` com kind `agent`; (c) retorna o id do novo nó. Segundo recrutamento a partir de `t1` posiciona **espaçado ao lado** do primeiro (offset por nº de filhos já ligados abaixo). Fallback: `fromId` inexistente → cai na posição em cascata atual (sem quebrar).
  2) **Implementação:**
     - `OrchestrationCommand` recruit ganha `from?: string` (`src/shared/orchestration.ts` L36), espelhando `updateNote`.
     - `orq.ts` ramo `recruit`: enviar `from: env.ORKESTRA_NODE_ID ?? ''` no body (igual a `note write`).
     - `OrchestrationServer.ts` rota `/recruit` (L165-182): ler `from` opcional (`typeof parsed.from === 'string' ? parsed.from : undefined`) e incluir no comando emitido.
     - `canvasStore.ts`: adicionar action `recruitBelow(fromId, opts): string` — resolve o nó `fromId`, conta as edges `source===fromId && target é terminal` para o offset horizontal, computa `pos = { x: from.position.x + count*(from.width+40), y: from.position.y + (from.height ?? 320) + 80 }`, cria o terminal (reusando a fábrica de `addTerminalNode`) e chama `onConnect({source:fromId, target:novoId, ...})`, retornando o id. (Refatorar `addTerminalNode` para extrair a criação do nó num helper compartilhado que devolve o nó, evitando duplicar a lógica de `data`.)
     - `useOrchestrationSync.ts` (L95-96): trocar `store.addTerminalNode(undefined, {...})` por: se `cmd.from` presente e resolve a um terminal → `store.recruitBelow(cmd.from, {name,preset,role})`; senão manter `addTerminalNode` (fallback legado).
  3) **Verde** — `npx vitest run src/orq/orq.test.ts src/main/orchestration/OrchestrationServer.test.ts src/renderer/src/store/canvasStore.test.ts`.
- **Critérios de aceite:**
  - Recrutar a partir de um Maestro coloca o recruta **abaixo** e cria uma aresta **Maestro → recruta** (kind `agent`).
  - Recrutas sucessivos do mesmo Maestro **não empilham** no mesmo ponto (espaçados horizontalmente).
  - `from` ausente (orq legado) mantém o comportamento atual (sem quebra).
  - **Verificação manual (integração pty):** em dev, num terminal Maestro rodar `orq recruit "Dev" "claude" "Dev"` e ver o novo terminal nascer abaixo, conectado, com o agente iniciando.
- **Notas:** o mirror **não** carrega posição (verificado) — por isso o posicionamento vive no store do renderer, que tem `position`. A aresta usa `onConnect` (deriva kind pelos tipos, funciona igual ao arraste manual). Risco: `recruitBelow` deve reusar a mesma geração de `data` de `addTerminalNode` (inclusive `autostart:true`), senão o recruta não auto-inicia o agente.

### T4 — `recruit` herda o preset do Maestro quando omitido  [P2 · S · Onda 1/2]
- **Arquivos a tocar:** `src/renderer/src/hooks/useOrchestrationSync.ts`, `src/orq/orq.ts`, `src/orq/orq.test.ts`, `src/main/orchestration/OrchestrationServer.ts` (validação), `src/renderer/src/store/canvasStore.test.ts`.
- **Passos TDD:**
  1) **Teste que falha** — a decisão de herança acontece no renderer (é lá que o mirror/`from`/preset do Maestro estão). Em `canvasStore.test.ts` (ou num helper puro `resolveRecruitPreset(mirror, fromId, requestedPreset)` em `useOrchestrationSync`), testar: preset pedido vazio + Maestro `t1` com `preset:'claude'` → resultado `'claude'`; preset pedido `'codex'` → `'codex'` (explícito vence); `from` desconhecido → `'shell'` (default seguro).
  2) **Implementação** — tornar o `preset` do `recruit` **opcional** na CLI (`orq recruit "<nome>" ["<preset>"] ["<papel>"]`) e no servidor (`preset` deixa de ser obrigatório; default resolvido no renderer). No `useOrchestrationSync`, antes de `recruitBelow`, se `cmd.preset` vazio, ler o preset do nó `cmd.from` no mirror local e usá-lo (fallback `'shell'`).
  3) **Verde** — `npx vitest run src/renderer/src/store/canvasStore.test.ts src/orq/orq.test.ts`.
- **Critérios de aceite:** `orq recruit "Dev"` (sem preset) num Maestro `claude` cria um recruta `claude`; com preset explícito, respeita o explícito.
- **Notas:** depende do `from` de T3. Alinha com o comportamento default do Maestri ("recruta cópias de si mesmo"). Cuidado: hoje o servidor **exige** `preset` string (L168-172) — relaxar sem quebrar os testes existentes de 400 (que passam a exigir só `name`).

### T5 — Modo Maestro como toggle por terminal (`data.maestro`)  [P2 · M · Onda 2]
- **Arquivos a tocar:** `src/renderer/src/store/canvasStore.ts` (opts de `addTerminalNode`), `src/renderer/src/store/canvasStore.test.ts`, `src/shared/orchestration.ts` (`MirrorNode`), `src/renderer/src/hooks/useOrchestrationSync.ts` (mirror builder), `src/renderer/src/components/NewTerminalModal.tsx` (checkbox), `src/main/orchestration/installOrq.ts` (linha do onboarding).
- **Passos TDD:**
  1) **Testes que falham:**
     - `canvasStore.test.ts`: `addTerminalNode(undefined, { maestro:true })` cria nó com `data.maestro === true`; `serialize()` **preserva** `data.maestro` (round-trip). (Espelha o teste existente de `monitor`.)
     - Teste do mirror (unit do builder ou via `useOrchestrationSync`): um nó terminal com `data.maestro:true` produz `MirrorNode.maestro === true`.
  2) **Implementação:**
     - `MirrorNode` ganha `maestro?: boolean` (`src/shared/orchestration.ts`).
     - `useOrchestrationSync` mirror builder (L36-58): incluir `maestro: n.data?.maestro as boolean | undefined`.
     - `addTerminalNode` opts (canvasStore L298-304) e o objeto `data` (L474-490): aceitar/gravar `maestro` (default `false`), na mesma posição de `monitor`.
     - `NewTerminalModal.tsx`: `const [maestro, setMaestro] = useState(false)`, um checkbox "Maestro" na aba **Detalhes** (copiar o bloco `monitor`, L159-169, com `title` explicando "concede a este agente os verbos de gerência: recrutar, conectar, reatribuir e dispensar"), e passar `maestro` no `create()` (L52-60).
     - `installOrq.ts`: a linha de onboarding de T1 já cita a ressalva de que os verbos "só têm efeito num Maestro" — mantê-la coerente com este toggle.
  3) **Verde** — `npx vitest run src/renderer/src/store/canvasStore.test.ts` + `npm run typecheck`.
- **Critérios de aceite:**
  - Criar um terminal com "Maestro" marcado grava `data.maestro:true`, persiste no snapshot e aparece no mirror.
  - Terminais existentes sem o campo continuam válidos (`maestro` ausente = comum).
  - **Checklist manual:** o checkbox aparece na aba Detalhes, com tooltip; criar um Maestro e conferir no canvas.
- **Notas:** `data.monitor` é o precedente idêntico (mesmo caminho modal→store→serialize→mirror), o que torna esta tarefa de baixo risco. Edição de terminal existente (botão direito → Editar) para ligar/desligar o Maestro é um follow-up de UX (o modal atual é só de criação) — registrar mas não bloquear.

### T6 — Gating server-side: só Maestro recruta/conecta/dispensa  [P2 · M · Onda 2]
- **Arquivos a tocar:** `src/main/orchestration/OrchestrationServer.ts`, `src/main/orchestration/OrchestrationServer.test.ts`, `src/shared/orchestration.ts` (`from` em `connect`/`dismiss`), `src/orq/orq.ts`, `src/orq/orq.test.ts`.
- **Passos TDD:**
  1) **Testes que falham:**
     - Helper puro `isMaestro(mirror, fromId): boolean` (novo, em `OrchestrationServer.ts` ou `src/shared/`): nó com `maestro:true` → true; sem flag → false; `fromId` desconhecido → **true** (fail-open legado). Testar isolado.
     - `OrchestrationServer.test.ts`: `POST /recruit` com `from` cujo nó tem `maestro:false` no mirror → **403** e **não** emite comando; com `maestro:true` → 200 e emite; **sem** `from` (legado) → 200 (fail-open). Repetir para `/connect` e `/dismiss`.
     - `orq.test.ts`: quando o servidor responde **403**, `orq recruit` retorna `code != 0` com `out` contendo orientação ("este terminal não é um Maestro — peça ao usuário para ativar o Modo Maestro").
  2) **Implementação:**
     - `OrchestrationCommand` `connect` e `dismiss` ganham `from?: string`; `orq.ts` passa `from: env.ORKESTRA_NODE_ID` em `connect`/`dismiss` (recruit já tem via T3).
     - `OrchestrationServer.ts`: nas rotas `/recruit`, `/connect`, `/dismiss`, após o parse, se `from` presente e `!isMaestro(getMirror(), from)` → `res.writeHead(403).end('not a maestro')` sem emitir. Fail-open quando `from` ausente ou nó desconhecido (mesma filosofia do escopo de projeto).
     - `orq.ts` `errOut()`: mapear `403` para a orientação acionável ao agente.
  3) **Verde** — `npx vitest run src/main/orchestration/OrchestrationServer.test.ts src/orq/orq.test.ts`.
- **Critérios de aceite:**
  - Um terminal **comum** que chama `orq recruit/connect/dismiss` recebe **403** e uma mensagem clara; o canvas **não** muda.
  - Um **Maestro** executa os três verbos normalmente.
  - Retrocompat: `from` ausente (orq externo) mantém o comportamento atual (fail-open) — nenhum teste existente quebra.
  - Auth (401) e escopo de projeto (409) continuam **antes** do gating (ordem: 401 → 409 → 403).
- **Notas:** o gating real é o servidor (o onboarding de T1 é só documentação; não é enforcement). Depende de `maestro` no mirror (T5) e de `from` nos três comandos (T3 cobre recruit; aqui adiciona connect/dismiss). Decisão de design: fail-open no desconhecido evita travar orq externo/legado — coerente com o resto do servidor.

### T7 — `reassign`: trocar papel e reiniciar processo mid-task  [P2 · M · Onda 2]
- **Arquivos a tocar:** `src/orq/orq.ts`, `src/orq/orq.test.ts`, `src/main/orchestration/OrchestrationServer.ts`, `src/main/orchestration/OrchestrationServer.test.ts`, `src/shared/orchestration.ts`, `src/renderer/src/hooks/useOrchestrationSync.ts`, `src/renderer/src/store/canvasStore.ts`, `src/renderer/src/store/canvasStore.test.ts`.
- **Passos TDD:**
  1) **Testes que falham:**
     - **CLI** (`orq.test.ts`): `runOrq(['reassign','Dev','Revisor'], {...env, ORKESTRA_NODE_ID:'t1'})` emite `{type:'reassign', target:'Dev', role:'Revisor', from:'t1'}`.
     - **Servidor** (`OrchestrationServer.test.ts`): `POST /reassign` com `{target,role,from}` → 200 e emite; `target` não-string → 400; sujeito ao gating de Maestro de T6 (403 se `from` não é Maestro).
     - **Store** (`canvasStore.test.ts`): criar `t1` em `{x:5,y:6}` com nome "Dev", uma edge para outro nó, então uma operação de reatribuição (via `updateTerminalRole` pelo id) muda `data.role` para "Revisor" **preservando** `position` `{x:5,y:6}`, `data.name` "Dev" e a edge. (Prova a semântica "posição/nome/conexões preservados".)
  2) **Implementação:**
     - `OrchestrationCommand` ganha `{ type:'reassign'; target:string; role:string; from?:string }`.
     - `orq.ts`: ramo `reassign` (`orq reassign "<nome>" "<papel>"`), envia `POST /reassign {target, role, from:ORKESTRA_NODE_ID}`; atualizar string de uso.
     - `OrchestrationServer.ts`: rota `POST /reassign` (valida `target`/`role` string; aplica gating de T6), emite o comando.
     - `useOrchestrationSync.ts`: handler `reassign` → acha o terminal por `name` (como `dismiss`/`connect`), chama `store.updateTerminalRole(id, cmd.role)` e **reinicia o processo** preservando o nó: matar o pty (`window.orkestra.pty.killForNode(id)`) e re-spawná-lo (marcar `data.autostart=true` + bump de uma chave de remount lida pelo `TerminalNode`, ou uma ação de store `restartTerminal(id)`). Só o **processo** reinicia; posição/nome/edges intactos.
  3) **Verde** — `npx vitest run src/orq/orq.test.ts src/main/orchestration/OrchestrationServer.test.ts src/renderer/src/store/canvasStore.test.ts`.
- **Critérios de aceite:**
  - `orq reassign "Dev" "Revisor"` muda o papel do nó "Dev" **sem** mover, renomear ou desconectar; o agente reinicia com as novas instruções de papel.
  - Sujeito ao gating (só Maestro reatribui).
  - **Verificação manual (integração pty):** em dev, reatribuir e confirmar que o mesmo nó/posição/edges permanecem e o processo do agente reinicia.
- **Notas:** **NÃO existe fluxo de restart hoje** (verificado — grep de restart/reassign/respawn não achou nada). O reinício do pty é o **maior risco** desta tarefa: exige um mecanismo novo no `TerminalNode`/store (kill + re-mount/autostart). As camadas puras (parse CLI, rota, emissão de comando, update de papel) são plenamente testáveis; o reinício do processo entra como critério de **verificação manual**. Editar o texto do papel (não só o id do papel) é uma extensão futura — v1 troca o papel de `PRESET_ROLES`.

### T8 — Template de esquadrão (Dev+Revisor+Testador+Docs)  [P2 · M · Onda 2]
- **Arquivos a tocar:** `src/orq/orq.ts`, `src/orq/orq.test.ts`, `src/orq/squad.ts` ((novo), composição pura), `src/orq/squad.test.ts` ((novo)), `src/shared/roles.ts`, `src/shared/roles.test.ts`.
- **Passos TDD:**
  1) **Testes que falham:**
     - `roles.test.ts`: `PRESET_ROLES` inclui um papel `docs` (label "Docs" ou "Redator"), com `roleMeta('docs')` devolvendo label/cor/hint.
     - `squad.test.ts`: helper puro `planSquad({ preset:'claude', spec:'Spec' })` devolve a lista de operações esperada — 4 recrutas (`Dev/Revisor/Testador/Docs`, todos preset `claude`) + 4 conexões de cada recruta à nota `Spec`.
     - `orq.test.ts`: `runOrq(['recruit','--squad','claude','Spec'], {...env, ORKESTRA_NODE_ID:'t1'})` (ou `orq squad ...`) emite, em sequência, 4 comandos `recruit` (com `from:'t1'`) e 4 comandos `connect` para "Spec". (Contagem/ordem dos comandos, como `ask --batch` em `orq.test.ts` L186-201.)
  2) **Implementação:**
     - `roles.ts`: adicionar `{ id:'docs', label:'Docs', color:'var(--paper-...)', hint:'Atualiza changelog e documentação.' }` a `PRESET_ROLES`.
     - `squad.ts`: `planSquad(opts)` puro que devolve a sequência de `recruit`/`connect` (facilita teste e reuso).
     - `orq.ts`: ramo `squad` (ou flag `recruit --squad`) que percorre `planSquad` e faz N `POST /recruit` + N `POST /connect` **em sequência** (nunca paralelo — mesma disciplina de `ask --batch`, L96-111), retornando um resumo ("esquadrão montado: 4 recrutas conectados a Spec"). Atualizar a string de uso.
  3) **Verde** — `npx vitest run src/shared/roles.test.ts src/orq/squad.test.ts src/orq/orq.test.ts`.
- **Critérios de aceite:**
  - Um comando monta Dev+Revisor+Testador+Docs, cada um conectado à nota-spec, herdando o preset (T4) por padrão.
  - Falhas parciais (um recruta/conexão recusado) são reportadas no resumo (contagem `k/N`), sem abortar o resto — como `ask --batch`.
  - Sujeito ao gating de Maestro (cada `recruit`/`connect` passa por T6).
- **Notas:** composição **client-side** (sem endpoint novo), como `ask --batch`. Encapsula o exemplo canônico da doc do Maestro. Ordem importa (recrutar antes de conectar). Depende de T3 (`from`) e idealmente T4 (herança de preset).

### T9 — Aresta `agent` carregada (contexto roteado por conexão)  [P2 · M/L · Onda 2 → plano de Conexões]
- **Escopo:** hoje `deriveEdgeKind` já marca terminal↔terminal como `agent` (`src/renderer/src/edges/edgeKind.ts`), mas a aresta é **visual** — não roteia contexto entre agentes. Fazer a aresta "carregar" contexto (o Maestro conecta uma nota-spec a um recruta e o recruta a lê via `orq context`, que já resolve por aresta em qualquer direção — `OrchestrationServer.ts` L332-353) é território do **plano de Conexões**.
- **Ação:** **não implementar aqui**. Referenciar `docs/analise-maestri-360/conexoes.md` e o futuro `docs/planejamento/conexoes.md`. O Maestro só precisa **criar** as arestas certas (T3/T8 já fazem via `connect`); a **semântica de roteamento** por conexão é responsabilidade do plano de Conexões. Registrar a dependência para evitar dupla implementação.

## 5. Dependências & riscos

- **Ordem recomendada:** T1 → T2 → T3 → (T4, T5) → T6 → T7 → T8. T1/T2 são independentes e de baixo risco (fazer primeiro, valor imediato). T3 introduz `from` no recruit — **pré-requisito** de T4, T6 (parcial) e T8.
- **Mirror sem posição (verificado):** o `MirrorNode` não carrega `position`; o posicionamento do recruta vive no store do renderer. Corrige a nota da análise ("o servidor já tem `from` no mirror"): o servidor relaya o **id** `from`, a **posição** está no renderer.
- **`addTerminalNode` não devolve id:** T3 exige extrair a criação do nó num helper compartilhado que devolva o nó/id (para `recruitBelow` conectar). Refator pequeno mas tocar `addTerminalNode` pede rodar `canvasStore.test.ts` inteiro.
- **Reinício de processo (T7) é o maior risco:** não há fluxo de restart hoje. Precisa de um mecanismo novo no `TerminalNode`/store (kill + re-mount/autostart). Isolar as partes puras (testáveis) do reinício (verificação manual).
- **Gating incondicional no onboarding vs. enforcement:** T1 documenta os verbos para **todos** os agentes (quick win); o enforcement real é T6 (server-side). Sem T6, um agente comum poderia recrutar. Aceitável na Onda 1 (o encanamento já era aberto); T6 fecha na Onda 2. Não inverter a ordem sem avisar o usuário.
- **Retrocompatibilidade:** todo `from`/`maestro` é **opcional** com fail-open — nenhum orq externo/legado nem snapshot antigo deve quebrar. Todos os testes de 400/401/409 existentes precisam continuar verdes.
- **Multi-agente (codex/gemini):** o onboarding só chega ao `claude` (wrapper). Um Maestro `codex` não receberia o texto de T1 — mitigar com onboarding multi-agente (Onda 3, #6) ou aceitar que a v1 do Maestro é Claude-first.
- **Gates de verificação:** ao fim de cada tarefa rodar `npx vitest run <arquivos>`, e ao fim da onda `npm run typecheck` + `npm run lint` (config `vitest.config.ts`: `include: ['src/**/*.test.ts']`, env `node`; testes de store usam `// @vitest-environment jsdom` e `window.orkestra?.pty` com optional chaining). Validação de integração pty (recruit/reassign) exige `npm run dev` (fora do escopo automatizado).

## 6. Referências

- **Origem:** `docs/analise-maestri-360/modo-maestro.md` (§5 estado atual, §6 melhorias priorizadas).
- **Plano irmão:** `docs/analise-maestri-360/conexoes.md` → futuro `docs/planejamento/conexoes.md` (aresta `agent` carregada / roteamento de contexto por conexão — T9).
- **Contexto estratégico:** `docs/analise-maestri-360/ALEM-DO-MAESTRI-oportunidades.md`; `docs/analise-maestri-360/andares-floors.md` (floors, Onda 3 #5).
- **Código verificado (caminhos reais):**
  - `src/main/orchestration/OrchestrationServer.ts` — rotas, auth, escopo de projeto (409/503/413); `/note` com `from` (L151-164); `/recruit` (L165-182); `/context` (L332-353).
  - `src/orq/orq.ts` — CLI (recruit L145-153; context/`ORKESTRA_NODE_ID` L45-55; `errOut` L27-32).
  - `src/main/orchestration/installOrq.ts` — `ONBOARDING` (L8-18), wrapper `claude` (L26-38).
  - `src/main/orchestration/AgentBus.ts` — `ask`/`waitForIdle`/watchers.
  - `src/main/pty/registerPtyIpc.ts` — `ORKESTRA_NODE_ID`/`ORKESTRA_PROJECT_ID` no env (L63-72).
  - `src/main/index.ts` — fiação do servidor + AgentBus + relay `onCommand`.
  - `src/renderer/src/hooks/useOrchestrationSync.ts` — mirror builder + aplicação de comandos (recruit L95-96).
  - `src/renderer/src/store/canvasStore.ts` — `addTerminalNode` (L463-496), `updateTerminalRole` (L616), `onConnect` (L867), `removeNode`.
  - `src/renderer/src/components/NewTerminalModal.tsx` — checkbox `monitor` (L159-169), `create()` (L52-60).
  - `src/shared/orchestration.ts` — `MirrorNode`/`OrchestrationCommand`; `src/shared/presets.ts`; `src/shared/roles.ts` (`PRESET_ROLES`); `src/renderer/src/edges/edgeKind.ts` (kind `agent`).
  - **Testes de referência (convenções):** `src/main/orchestration/OrchestrationServer.test.ts`, `src/orq/orq.test.ts`, `src/main/orchestration/installOrq.test.ts`, `src/renderer/src/store/canvasStore.test.ts`.
</content>
</invoke>
