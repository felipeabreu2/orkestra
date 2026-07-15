# Plano de Implementação — Terminais e Agentes

> **Origem:** `docs/analise-maestri-360/terminais-agentes.md` · **Status:** Proposto (pronto para execução) · **Onda(s):** 2 (núcleo) → 3 (portabilidade/descoberta)

---

## 1. Objetivo & valor

Transformar o **papel** de um terminal-agente de **metadado puramente visual** (hoje: só badge
+ cor de accent) em **configuração de comportamento**: um papel passa a carregar **instruções**
que são **injetadas no arranque do agente**, exatamente a premissa central da orquestração
multi-agente do Maestri ("Líder delega, Dev implementa, Revisor critica, Testador testa").

Esse é o **GAP CRÍTICO (P1)** da análise: sem injeção, atribuir "Revisor" a um terminal não muda
nada no que o LLM faz — o próprio código admite isso em `TerminalFlowNode.tsx` ("Papel do agente —
metadado visual (sem efeito no LLM)"). O plano entrega:

1. **Núcleo (Onda 2):** campo `prompt` no modelo `Role`, um **builder puro** de "instrução de
   arranque" (`buildRolePrompt`) testável em isolamento, e a **injeção real** no spawn do PTY.
2. **Portabilidade/§4.3 (Onda 2/3):** sidecar `role.json` no `cwd` do terminal, **"Descobrir
   Responsabilidades"** (varredura/importação ao trocar de branch) e verbos
   `orq role show/write/edit` (o próprio agente refina seu papel entre execuções).
3. **Quick win (Onda 2/3):** clique na notificação do SO **foca o terminal** correspondente.

Ganho: papéis deixam de ser cosméticos e passam a **moldar o comportamento** do agente; a
configuração **viaja com o repositório** (sidecar), e a orquestração ganha simetria com o Maestri.

---

## 2. Estado atual no código (verificado)

Verificado por leitura direta em 2026-07-15. Correção de claim stale ao final da tabela.

| Arquivo real | O que já faz | Relevância |
| --- | --- | --- |
| `src/shared/roles.ts` | `interface Role { id; label; color; hint }` — **NÃO tem `prompt`**. `PRESET_ROLES` = `lider`/`dev`/`revisor`/`testador` (label + `color` accent-de-papel + `hint`). `roleMeta(role)` resolve por id **ou** label (case-insensitive, `trim`) e devolve `{ label, color, hint }`; papel livre → `var(--text-2)` + `hint:''`. | **Núcleo do P1** — é onde entra `prompt` e o builder. |
| `src/shared/roles.test.ts` | Testa: os 4 presets têm `label/color/hint` preenchidos; `roleMeta` resolve por label/id case-insensitive; papel custom → cor neutra + hint vazio. **Nenhum teste de `prompt`.** | Arquivo de teste que ganha os casos de `prompt`/`buildRolePrompt`. |
| `src/main/pty/PtyManager.ts` | `spawn({ file?, args?, cwd?, cols?, rows?, env?, nodeId?, initialCommand? })`. `initialCommand` é digitado no shell **no 1º chunk de output** (writer one-shot, l.72-82). Buffer por pty `MAX_BUFFER = 256*1024`, `getBuffer` (re-attach). **Nenhum conceito de papel/prompt.** | Ponto de injeção "tipada" e/ou de `cwd` para sidecar. |
| `src/main/pty/registerPtyIpc.ts` | Handler `pty:spawn` com **allowlist explícito** por destructure: `{ cols, rows, nodeId, initialCommand, sshHost }` — nunca espalha o payload cru (RCE). Resolve wrapper `claude` por caminho absoluto (`ORKESTRA_BIN`). Injeta env `ORKESTRA_NODE_ID`/`ORKESTRA_PROJECT_ID`. `cwd = o.cwd ?? getProjectCwd?.()`. **Sem campo de papel.** | Onde `role` precisa entrar no allowlist e onde o sidecar/`cwd` é decidido. |
| `src/renderer/src/components/TerminalNode.tsx` | Calcula `initialCommand = preset ? presetById(preset)?.command : undefined`. Monta `spawnOpts = { cols, rows, nodeId, initialCommand }` (ou `{…, sshHost }`). Lê props `preset`/`sshHost` — **NÃO recebe `role`**. | Precisa receber/propagar `role` até o `spawnOpts` (caminho "tipada"). |
| `src/renderer/src/components/TerminalFlowNode.tsx` | Lê `data.role`, `roleMeta(role)` → `ork-role-badge` + `--role-color`. Comentário l.39: **"metadado visual (sem efeito no LLM)"**. Seletor de papel foi removido do header (2026-07-15); papel definido pela Command Palette. | Confirma o gap; não passa `role` ao `TerminalNode` hoje. |
| `src/renderer/src/store/canvasStore.ts` | `addTerminalNode(pos, { preset, role, name, sshHost, monitor })` grava `data.role` (default `''`). `updateTerminalRole(id, role)`. `data.autostart` efêmero (não persiste). | Já carrega `role` no nó; falta materializá-lo no arranque. |
| `src/renderer/src/hooks/useOrchestrationSync.ts` | Monta o mirror com `role: (n.data?.role) ?? ''` (l.55) — o **mirror já carrega o papel**. | Fonte do papel no main (para injeção server-side/`orq`). |
| `src/main/index.ts` | `resolvePtyByName(name)` usa o mirror → `ptyId`. `ask/askWait/askRaw` resolvem nome→pty. `onAttention` → `agent:attention` + `new Notification({ title:'Agente ocioso', … })` **sem handler de clique**. | Injeção server-side (opcional) e P2 (clique na notificação). |
| `src/orq/orq.ts` | Comandos: `list`, `context`, `note write`, `ask [--wait/--raw/--batch]`, `check`, `recruit`, `dismiss`, `connect`, `portal …`. **Não existe `orq role`.** `list` imprime `type\tname\tid` (**sem** o papel). | Onde entram `orq role show/write/edit` e (opcional) o papel no `list`. |
| `src/shared/orchestration.ts` | `MirrorNode` tem `role?`, `preset?`, `monitor?`. `recruit` aceita `role?`. | Modelo já prevê `role` no mirror/recruit. |
| `src/renderer/src/terminal/generatingSignal.ts` | `WORKING_MARKER = /esc to interrupt/i`; `screenIsGenerating(visibleLines)`. Varredura por **conteúdo** da tela (não silêncio). | Contexto (sinal "gerando" já resolvido — não é alvo deste plano). |
| `src/main/orchestration/AgentBus.ts` | `track/ask/writeRaw/read/waitForIdle/clearAttention`; `DEFAULT_ATTENTION_IDLE_MS=1200`. | Contexto (atenção/ociosidade — já existe). |

**Correção de claim stale (análise §5.9):** a linha "`orq list` expõe role no mirror | Parcial" é
imprecisa. O **mirror** carrega `role` (`useOrchestrationSync` l.55, `MirrorNode.role`), mas a
**saída** de `orq list` (`orq.ts` l.42) imprime só `type\tname\tid` — **não** surfaça o papel. Ou
seja: o dado existe no mirror, mas o agente **não o vê** via `orq list`. Adicionar o papel ao
output de `list` é um sub-item barato de §4.3 (agentes "sabem com quem falam"). Os demais caminhos
citados na análise conferem com o código real.

---

## 3. Gaps priorizados

| Gap | Prioridade | Valor | Esforço (S/M/L) | Onda |
| --- | --- | --- | --- | --- |
| `Role` sem `prompt` + builder puro de arranque | **P1** | Alto (destrava toda a orquestração) | M | 2 |
| Injeção do papel no arranque do agente (spawn/sidecar) | **P1** | Alto | M/L | 2 |
| Sidecar `role.json` no `cwd` do terminal (portabilidade) | P2 | Médio-alto | M | 2/3 |
| "Descobrir Responsabilidades" (varredura ao trocar de branch) | P3 | Médio | M | 3 |
| `orq role show/write/edit` (auto-refino pelo agente) | P3 | Médio | M | 3 |
| `orq list` surfaçar o papel de cada terminal | P4 | Baixo-médio | S | 2/3 |
| Clique na notificação do SO foca o terminal | P2 | Alto | S | 2/3 |

> Foco deste plano: **P1 (núcleo + injeção)** na Onda 2; **portabilidade/descoberta/`orq role`** na
> Onda 2/3. Itens fora de papéis (catálogo de temas, ícone por terminal, badge numérico, limpeza do
> `onAgentBusy` dormente) permanecem no backlog da análise (§6, P3/P5/P6/P7) e não são detalhados aqui.

---

## 4. Tarefas de implementação (TDD, em ordem)

### T1 — `Role.prompt` + `buildRolePrompt(role)` (builder puro de instrução de arranque)  [P1 · M · Onda 2]

- **Arquivos a tocar:**
  - `src/shared/roles.ts`
  - `src/shared/roles.test.ts`
- **Passos TDD:**
  1. **Teste que falha** (`roles.test.ts`), casos concretos:
     - `describe('Role.prompt')`: `for (const r of PRESET_ROLES) expect(r.prompt.length).toBeGreaterThan(0)` — falha hoje (`prompt` não existe → `undefined.length`).
     - **Serializa/valida:** `const round = JSON.parse(JSON.stringify(PRESET_ROLES[1])); expect(round.prompt).toBe(PRESET_ROLES[1].prompt)` e `expect(typeof round.prompt).toBe('string')`.
     - `roleMeta('dev').prompt` deve casar `PRESET_ROLES.find(id==='dev').prompt`; `roleMeta('Arquiteto').prompt` (custom) `=== ''`.
     - `describe('buildRolePrompt')`:
       - `buildRolePrompt('dev')` **contém** o texto do prompt do Dev **e** o label `'Dev'` (framing) → `expect(buildRolePrompt('dev')).toContain('Dev')`.
       - `buildRolePrompt('')` **=== ''** (sem papel, sem injeção — idempotência).
       - `buildRolePrompt('Arquiteto')` **=== ''** (papel livre sem `prompt` não injeta nada).
       - `buildRolePrompt('LÍDER')` **=== `buildRolePrompt('lider')`** (mesma resolução case-insensitive de `roleMeta`).
  2. **Implementação:**
     - Estender `interface Role` com `prompt: string` (**obrigatório** — o teste do `for` força os 4 presets a preencher).
     - Preencher `prompt` nos 4 `PRESET_ROLES` (ex.: Líder = "Você coordena os demais agentes… delegue… não implemente diretamente…"; Dev = "Foque na implementação conforme o plano…"; Revisor = "Revise criticamente em busca de bugs/edge cases, não implemente…"; Testador = "Escreva e execute testes, cubra os edge cases…").
     - Estender o retorno de `roleMeta` com `prompt` (neutro `''` para papel livre).
     - Adicionar `export function buildRolePrompt(role: string): string`: resolve via a mesma busca do `roleMeta`; se `prompt` vazio → retorna `''`; senão devolve a **instrução de arranque emoldurada** (ex.: ``You are the "${label}" agent in an Orkestra multi-agent workspace. ${prompt}``). Função **pura** (sem I/O, sem estado).
  3. **Verde:** `npx vitest run src/shared/roles.test.ts`.
- **Critérios de aceite:**
  - `Role` exige `prompt: string`; os 4 presets têm `prompt` não vazio; TypeScript compila (`npm run typecheck`).
  - `buildRolePrompt` é determinística, pura e cobre: preset conhecido, papel vazio, papel livre, case-insensitive.
  - Nenhum comportamento visual muda (badge/cor intactos).
- **Notas:** manter `buildRolePrompt` em `src/shared` (não em `renderer`/`main`) — será consumida pelo **main** (injeção) e pelo **renderer** (preview do papel). Evitar quebra de linha/aspas que atrapalhe a digitação no PTY (ver T2). Não incluir dados sensíveis no framing.

---

### T2 — Injeção do papel no arranque do agente  [P1 · M/L · Onda 2]

Decisão de arquitetura (documentar no PR). Duas estratégias, com um **helper puro** comum e testável:

- **(A) Sidecar/arquivo de contexto (recomendada, fiel ao Maestri, sem custo de tokens):** o main
  grava um arquivo de instruções (`CLAUDE.md`/`AGENTS.md`) num **subdiretório de trabalho do
  terminal** (ex.: `<cwd>/.orkestra/agents/<nodeId>/`) e aponta o `cwd` do PTY para lá; o Claude
  Code/Codex lê o arquivo no startup — **abrir o CLI não gasta tokens**.
- **(B) Prompt digitado (pragmática, funciona em qualquer CLI):** após o CLI abrir, digitar
  `buildRolePrompt(role)` como 1ª mensagem. **Consome tokens** e polui o histórico — aceitável só
  como fallback para presets sem suporte a arquivo de contexto.

- **Arquivos a tocar:**
  - `src/shared/roleInjection.ts` ((novo)) — helper puro que decide **como** injetar.
  - `src/shared/roleInjection.test.ts` ((novo))
  - `src/main/pty/registerPtyIpc.ts` — allowlist `role` + materialização do arquivo/`cwd` (estratégia A).
  - `src/renderer/src/components/TerminalNode.tsx` — propagar `role` ao `spawnOpts`.
  - `src/renderer/src/components/TerminalFlowNode.tsx` — passar `role` como prop ao `TerminalNode`.
- **Passos TDD:**
  1. **Teste que falha** (`roleInjection.test.ts`): um helper puro
     `planRoleInjection({ preset, role }): { kind: 'none' } | { kind: 'file'; filename: string; content: string } | { kind: 'type'; text: string }`.
     Casos concretos:
     - `planRoleInjection({ preset: 'shell', role: 'dev' })` → `{ kind: 'none' }` (shell não é agente).
     - `planRoleInjection({ preset: 'claude', role: '' })` → `{ kind: 'none' }` (sem papel).
     - `planRoleInjection({ preset: 'claude', role: 'dev' })` → `{ kind: 'file', filename: 'CLAUDE.md', content: <contém buildRolePrompt('dev')> }`.
     - `planRoleInjection({ preset: 'gemini', role: 'revisor' })` → `{ kind: 'file', filename: 'AGENTS.md', … }` (mapa preset→arquivo).
     - `content` **=== `buildRolePrompt(role)`** (reuso do builder de T1, sem reimplementar).
  2. **Implementação:**
     - `planRoleInjection` (puro) usando `buildRolePrompt`; mapa `preset → filename` (`claude→CLAUDE.md`, `codex/gemini→AGENTS.md`); `shell`/papel vazio/`prompt` vazio → `none`.
     - Renderer: `TerminalFlowNode` passa `role` a `<TerminalNode … role={role} />`; `TerminalNode` inclui `role` em `spawnOpts` (junto de `preset`, para o main decidir a injeção).
     - Main (`registerPtyIpc`): adicionar `role` (string validada — `typeof === 'string'`, comprimento máximo) ao **allowlist** do destructure; ao spawnar um preset de agente com `role`, chamar `planRoleInjection`; se `kind==='file'`, criar o subdir `<cwd>/.orkestra/agents/<nodeId>/`, escrever o arquivo, e passar esse subdir como `cwd` ao `PtyManager.spawn`. Estratégia (B) fica como fallback documentado.
  3. **Verde:** `npx vitest run src/shared/roleInjection.test.ts` (unit do helper). A **fiação** PTY/IPC não tem teste unitário direto → **checklist manual** abaixo.
- **Critérios de aceite:**
  - Unit do `planRoleInjection` verde; `role` no allowlist do `pty:spawn` **por destructure** (nunca `{ ...o }`).
  - **Checklist manual (`npm run dev`):**
    - Criar terminal preset **Claude** com papel **Revisor** → existe `<cwd>/.orkestra/agents/<nodeId>/CLAUDE.md` com as instruções; o agente inicia já ciente do papel.
    - Terminal **Shell** ou **sem papel** → **nenhum** arquivo criado, `cwd` inalterado.
    - Trocar o papel via Command Palette e reabrir → o arquivo reflete o novo papel.
    - Nenhum arquivo é escrito na raiz do projeto do usuário (só no subdir `.orkestra/agents/`).
  - `npm run typecheck` e `npm run lint` limpos.
- **Notas / riscos:**
  - **Segurança:** `role` do renderer é string livre → validar tamanho e nunca usar em caminho de shell; o subdir usa `nodeId` (gerado internamente), não o texto do papel.
  - **`.gitignore`:** o subdir `.orkestra/agents/` não deve sujar o repo do usuário — adicionar sugestão de ignore (ou usar diretório fora do repo). Decidir no PR.
  - **Mudança de `cwd`:** apontar o agente para um subdir altera onde ele opera (paths relativos). Avaliar se o Claude Code respeita `CLAUDE.md` de um subdir vs. raiz; se não, cair na estratégia (B) para esse preset.
  - **Idempotência:** re-attach (troca de projeto) **não** reescreve o arquivo (o PTY sobrevive; a escrita só ocorre no spawn NOVO).

---

### T3 — Sidecar `role.json` + surfaçar papel no `orq list`  [P2/P4 · M · Onda 2/3]

- **Arquivos a tocar:**
  - `src/shared/roleSidecar.ts` ((novo)) — serialização/parse puro do `role.json`.
  - `src/shared/roleSidecar.test.ts` ((novo))
  - `src/main/pty/registerPtyIpc.ts` — gravar `role.json` ao lado do `CLAUDE.md`/`AGENTS.md` (reusa o subdir de T2).
  - `src/orq/orq.ts` — incluir o papel no output de `orq list`.
- **Passos TDD:**
  1. **Teste que falha** (`roleSidecar.test.ts`):
     - `serializeRoleSidecar({ name:'Revisor', color:'var(--paper-amber)', prompt:'…' })` produz JSON com as 3 chaves (`name`/`color`/`prompt`) — espelho do sidecar do Maestri.
     - `parseRoleSidecar(json)` faz round-trip; entrada inválida (`'{}'`, `'não-json'`) → `null` (nunca lança).
     - (Se optar por surfaçar no `list`) um formatador puro `formatListLine({ type, name, id, role })` inclui o papel quando presente e o omite quando vazio.
  2. **Implementação:**
     - `serializeRoleSidecar`/`parseRoleSidecar` (puros, defensivos).
     - Main: no spawn com papel, gravar `role.json` no mesmo subdir de T2 (portabilidade — o papel "viaja com o diretório").
     - `orq.ts`: no ramo `list`, anexar o papel de cada terminal (o mirror já tem `n.role`) via o formatador testado.
  3. **Verde:** `npx vitest run src/shared/roleSidecar.test.ts` (+ ajustar o teste de `orq` se existir).
- **Critérios de aceite:**
  - `role.json` gravado junto do arquivo de contexto; parse tolerante a lixo (retorna `null`).
  - `orq list` mostra o papel de cada terminal (ex.: `terminal\tRevisor-do-Auth\tabc\tRevisor`), fechando a paridade "agentes sabem com quem falam".
  - Sem regressão nos testes de `orq`/orchestration existentes.
- **Notas:** manter o shape do sidecar **idêntico ao do Maestri** (`name`/`color`/`prompt`) para interoperabilidade futura. `orq list` é consumido por agentes — manter tab-separated e retrocompatível (papel como coluna extra opcional).

---

### T4 — `orq role show/write/edit` (auto-refino do papel pelo agente)  [P3 · M · Onda 3]

- **Arquivos a tocar:**
  - `src/orq/orq.ts` — novo comando `role` com subcomandos `show/write/edit`.
  - `src/orq/orq.test.ts` (ou equivalente de teste do CLI) ((novo se ausente))
  - `src/main/orchestration/OrchestrationServer.ts` + `src/main/index.ts` — endpoint(s) para ler/escrever o `role.json` do terminal alvo (reusa `resolvePtyByName` → subdir do nó).
- **Passos TDD:**
  1. **Teste que falha:** um **parser puro** de argumentos `parseRoleCommand(argv)` (sem rede):
     - `['role','show','Revisor']` → `{ action:'show', name:'Revisor' }`.
     - `['role','write','Revisor','novo prompt inteiro']` → `{ action:'write', name:'Revisor', prompt:'novo prompt inteiro' }`.
     - `['role','edit','Revisor','antigo','novo']` → `{ action:'edit', name:'Revisor', from:'antigo', to:'novo' }`.
     - `['role']` / subcomando desconhecido → `{ action:'usage' }` (código de saída 2, como os outros comandos).
     - Para `edit`, um aplicador puro `applyRoleEdit(prompt, from, to)` substitui **uma** substring; `from` ausente no texto → retorna o texto original (idempotente, sem lançar).
  2. **Implementação:**
     - `parseRoleCommand` + `applyRoleEdit` puros; ramo `role` em `runOrq` chamando os endpoints (`GET /role?name=`, `POST /role` com `{name, prompt}` ou `{name, from, to}`), com o mesmo tratamento de `errOut` (409/503) dos demais comandos.
     - Server: ler/gravar o `role.json` do subdir do terminal alvo; refletir a mudança no `data.role`/mirror quando fizer sentido.
  3. **Verde:** `npx vitest run src/orq/orq.test.ts` (parser + applyRoleEdit puros). Ida-e-volta HTTP → checklist manual.
- **Critérios de aceite:**
  - `orq role show "X"` imprime o prompt; `write` substitui inteiro; `edit` troca uma substring (paridade com `maestri role`).
  - **Checklist manual (`npm run dev`):** de dentro de um terminal-agente, `orq role write "<seu-papel>" "..."` altera o `role.json`; `orq role show` reflete; nova sessão do agente arranca com o prompt refinado.
  - Erros de projeto-não-ativo (409) e sem-janela (503) tratados como no resto do `orq`.
- **Notas:** depende de T1–T3 (papel com `prompt` + sidecar). Auto-modificação de contexto: documentar que o agente pode reescrever o **próprio** papel — manter escopo de projeto (`x-orkestra-project`) para não vazar entre projetos.

---

### T5 — "Descobrir Responsabilidades" (varredura/importação ao trocar de branch)  [P3 · M · Onda 3]

- **Arquivos a tocar:**
  - `src/shared/discoverRoles.ts` ((novo)) — lógica pura de descoberta/dedupe a partir de resultados de varredura.
  - `src/shared/discoverRoles.test.ts` ((novo))
  - `src/main/…` — varredura de `role.json` no `cwd` (I/O, fina) + IPC para o renderer.
  - `src/renderer/src/components/…` — UI de prévia/seleção múltipla (Configurações → Agentes ou tela Editar do terminal).
- **Passos TDD:**
  1. **Teste que falha** (`discoverRoles.test.ts`): `dedupeDiscoveredRoles(found: RoleSidecar[])` — puro:
     - Deduplica por `name` (case-insensitive), preferindo o primeiro; ignora entradas inválidas; preserva ordem estável.
     - `mergeIntoPresets(PRESET_ROLES, found)` marca quais descobertos são **novos** vs. **conflito** com preset existente.
  2. **Implementação:** funções puras de dedupe/merge; a varredura de disco (glob por `role.json`) chama `parseRoleSidecar` (T3) e passa o resultado às funções puras; UI consome via IPC.
  3. **Verde:** `npx vitest run src/shared/discoverRoles.test.ts`. UI/varredura → checklist manual.
- **Critérios de aceite:**
  - Ao fazer checkout de uma branch com `role.json` no `cwd`, "Descobrir Responsabilidades" lista os papéis com prévia e permite importar (seleção múltipla), sem duplicar presets existentes.
  - **Checklist manual:** criar `role.json` numa subpasta do projeto → o comando/tela lista e importa; papel importado fica disponível na Command Palette.
- **Notas:** fecha o ciclo de portabilidade (T3 grava, T5 importa). Manter a varredura **limitada** (profundidade/quantidade) para não travar em repositórios grandes.

---

### T6 — Clique na notificação do SO foca o terminal  [P2 · S · Onda 2/3] (quick win)

- **Arquivos a tocar:**
  - `src/main/index.ts` — handler `click` na `Notification` (l.46) → foca a janela + IPC ao renderer com o `nodeId`.
  - `src/preload/index.ts` — canal `onFocusNode` (ou reusar existente).
  - `src/renderer/src/components/Canvas.tsx` — ao receber `nodeId`, `fitView({ nodes:[{id}], … })` (reusa o mesmo pipeline do maximizar).
- **Passos TDD:**
  1. **Teste que falha:** extrair um helper puro `resolveNotificationTarget(mirror, ptyId, nodeForPty)` que devolve o `nodeId` a focar (ou `undefined` se o pty já morreu) — testável sem Electron. Caso: pty conhecido → nodeId; pty desconhecido → `undefined`.
  2. **Implementação:** no `onAttention`, guardar o `nodeId`; `new Notification(...).on('click', …)` traz a janela ao foco (`mainWindow.show()/focus()`) e envia o `nodeId` ao renderer; `Canvas.tsx` enquadra o nó.
  3. **Verde:** `npx vitest run` do helper puro. Ida-e-volta Electron → checklist manual (`npm run dev`: disparar atenção com a janela em segundo plano, clicar na notificação → app foca e enquadra o terminal certo).
- **Critérios de aceite:** clicar na notificação foca a janela **e** enquadra/seleciona o terminal correspondente; respeita `monitor === false` (não notifica). Sem regressão no ⇧A existente.
- **Notas:** valor alto / esforço baixo — reusa `ptyId → nodeId` (`PtyManager.nodeForPty`) e o `fitView` já usado no maximizar. Independente de T1–T5; pode ir antes se quiser um ganho visível cedo.

---

## 5. Dependências & riscos

- **Ordem:** T1 é pré-requisito de T2/T3/T4 (o `prompt` e o `buildRolePrompt`). T3 (sidecar) é
  pré-requisito de T4 (`orq role` lê/escreve o `role.json`) e T5 (descoberta importa `role.json`).
  T6 é independente (pode ir a qualquer momento).
- **Decisão de arquitetura em T2 (injeção por arquivo vs. digitada):** a estratégia (A) não gasta
  tokens mas exige subdir + eventual `cwd` diferente; a (B) é universal mas consome tokens e polui o
  histórico. **Recomendação:** (A) para `claude`/`codex`/`gemini`, com (B) como fallback documentado.
- **Segurança / allowlist do `pty:spawn`:** `role` deve entrar **por destructure** no allowlist
  (`registerPtyIpc.ts`), nunca via `{ ...o }`; validar tipo/tamanho. O subdir usa `nodeId` interno,
  jamais o texto livre do papel, para evitar path traversal.
- **Poluição do repo do usuário:** o sidecar/arquivo de contexto não pode sujar o working tree —
  confinar em `.orkestra/agents/` e/ou sugerir `.gitignore`; decidir no PR.
- **Custo de tokens (estratégia B):** injetar prompt digitado dispara uma mensagem real ao LLM —
  medir/limitar; não injetar em `shell`.
- **Re-attach:** a materialização do papel ocorre **só no spawn novo**; troca de projeto reata o PTY
  sem reescrever nada (idempotência).
- **`buildRolePrompt` pura:** manter em `src/shared` (consumida por main **e** renderer); sem I/O,
  sem `process`/`fs`, para permanecer testável e reusável no preview do papel.
- **Compat de teste:** tornar `Role.prompt` obrigatório força os 4 presets a preencher (o `for` do
  teste garante) — checar que nenhum outro consumidor de `Role`/`roleMeta` quebra (`npm run typecheck`).

---

## 6. Referências

**Análise de origem:**
- `docs/analise-maestri-360/terminais-agentes.md` — §2.2 (papéis + injeção), §3 (papel = comportamento), §4.3 (ciclo de vida/spawn), §5.2 (gap crítico), §6 P1–P7.

**Código verificado (caminhos reais):**
- `src/shared/roles.ts`, `src/shared/roles.test.ts` — modelo de papéis (sem `prompt`).
- `src/shared/presets.ts` — presets de agente (`claude`/`codex`/`gemini`/`shell`).
- `src/shared/orchestration.ts` — `MirrorNode.role`, `recruit`.
- `src/main/pty/PtyManager.ts` — `spawn`, `initialCommand`, buffer/re-attach, `cwd`.
- `src/main/pty/registerPtyIpc.ts` — `pty:spawn` (allowlist), wrapper `claude` absoluto, env.
- `src/renderer/src/components/TerminalNode.tsx` — cálculo de `initialCommand`, `spawnOpts`.
- `src/renderer/src/components/TerminalFlowNode.tsx` — badge de papel ("metadado visual").
- `src/renderer/src/store/canvasStore.ts` — `addTerminalNode`, `updateTerminalRole`.
- `src/renderer/src/hooks/useOrchestrationSync.ts` — mirror com `role`.
- `src/main/index.ts` — `resolvePtyByName`, `ask/askWait/askRaw`, `Notification` (sem clique).
- `src/orq/orq.ts` — CLI (`list` sem papel; sem `role`).
- `src/main/orchestration/OrchestrationServer.ts`, `AgentBus.ts` — endpoints, atenção/ociosidade.

**Fonte Maestri:** documentação oficial "Terminais e Agentes" — `https://www.themaestri.app/pt-br/docs/terminals` (papéis com nome + badge + instruções; sidecar `role.json`; `maestri role show/write/edit`; "Descobrir Responsabilidades").
