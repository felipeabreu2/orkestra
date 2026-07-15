# Andares (Floors) — Análise 360° (Maestri → Orkestra)

> Documento de pesquisa e referência. Compara a funcionalidade **Andares (Floors)** do produto de referência (Maestri — `themaestri.app/pt-br/docs/floors`) com o estado atual do **Orkestra**. Baseado na documentação oficial do Maestri (transcrita integralmente) e no código/plano/histórico git reais do Orkestra. Descrito com palavras próprias; sem uso de marca no código.

---

## 1. Visão geral

**Andares (Floors)** são ambientes de trabalho **isolados** dentro do mesmo workspace visual. A ideia central: em vez de fazer *stash* do seu trabalho, trocar de branch e depois lembrar onde parou, você cria um "andar" — uma cópia completa e isolada do repositório, com seu próprio terminal, sua própria branch e sua própria *working tree*. O workspace original ("Térreo") permanece exatamente como você o deixou.

O caso de uso típico é a **troca de contexto sem atrito**: você está imerso numa tarefa e precisa corrigir um bug em outra branch, revisar um PR ou testar uma abordagem diferente. Com Andares, cada um desses contextos vira um ambiente paralelo, completo e independente — inclusive rodando servidores de desenvolvimento, IDEs e comandos de build simultaneamente, sem conflitos entre si.

O grande diferencial é a **eficiência de disco e velocidade**: no Maestri, os Andares usam clonagem *copy-on-write* do APFS (Apple Filesystem). Criar um andar é quase instantâneo e ocupa quase nenhum espaço extra — o clone compartilha todos os arquivos inalterados com o original, e apenas os arquivos modificados passam a ocupar espaço adicional.

No plano de reimplementação que o Orkestra chegou a escrever (e depois descartar), a mesma ideia foi mapeada para **`git worktree`** em vez de clone APFS — um mecanismo multiplataforma que também dá isolamento de *working tree* por branch, sem duplicar o histórico git.

Conceito relacionado, apresentado ao usuário como uma metáfora de prédio:
- **Térreo (Ground Floor)** = o workspace/repositório original.
- **Andar (Floor)** = um ambiente isolado sobreposto, empilhado num "espaço 3D" do canvas.

---

## 2. Como funciona

### 2.1. Cópias isoladas do workspace

Cada andar é um **repositório git real e completo**, isolado do Térreo. Dentro dele você pode fazer commits, criar branches, rodar testes, abrir múltiplos terminais e até subir servidores de dev — tudo sem tocar no workspace original.

No Maestri, o isolamento é obtido por **clonagem APFS instantânea** (copy-on-write): o clone compartilha os arquivos inalterados fisicamente com o original no disco; só os arquivos divergentes ocupam espaço novo. Os andares ficam guardados num diretório `.maestri/floors` ao lado do projeto, que é limpo automaticamente quando o último andar é excluído.

A branch do andar é **espelhada no repositório original**, então ferramentas externas (GitHub, o IDE do usuário) também a enxergam — o andar não é uma ilha invisível, é uma branch de verdade num diretório de trabalho separado.

### 2.2. Fluxo de criação

1. Clicar no botão de andar (canto inferior direito do app, ao lado do minimapa).
2. O canvas se reposiciona num "espaço 3D" empilhado; clicar em "novo andar".
3. Dar um nome (ex.: "Corrigir bug de login").
4. Se houver um repositório git, escolher **criar uma nova branch** ou **usar uma existente**.
5. Opcionalmente ativar **Clonar layout do Térreo** para duplicar os elementos do canvas (notas, terminais, blocos de texto) do Térreo para o novo andar.
6. Confirmar em **Criar**.

O sistema clona o repositório e faz *checkout* da branch do andar. Qualquer terminal criado ali roda naquele ambiente isolado.

### 2.3. Múltiplos agentes em paralelo, sem conflito

Como cada andar tem *working tree* própria, dá para ter **vários agentes trabalhando em paralelo** — cada um no seu andar, na sua branch, sem pisar no arquivo do outro. É exatamente o casamento com a proposta do Orkestra (orquestrar agentes de IA num canvas): um agente refatora numa branch, outro escreve testes em outra, um terceiro experimenta uma abordagem alternativa — todos simultâneos, isolados, e cada um com seu terminal/servidor de dev próprio.

### 2.4. Hooks (automação do ciclo de vida)

Os Andares expõem **hooks** — comandos automatizados que rodam em momentos-chave do ciclo de vida de um andar. Configuram-se com o botão direito no botão de andar → **Configure Hooks...**. Três tipos:

- **Setup** — roda quando o andar é **criado**. Serve para instalar dependências, vincular serviços, preparar o ambiente. Pode ter **Auto-run** (executa automaticamente na criação).
- **Run** — roda quando se clica no botão *play*. Serve para iniciar servidores de dev, rodar testes, tarefas sob demanda.
- **Teardown** — roda quando o andar é **excluído**. Serve para limpar recursos, desvincular serviços, remover arquivos temporários.

Cada hook aceita **múltiplos comandos** (`+ Add command`). Ficam sempre acessíveis por um ícone de raio (⚡) ao lado do botão de andar, com opção de rodar individualmente ou todos de uma vez (**Run All**).

O Maestri injeta **variáveis de ambiente** nos comandos de hook:

| Variável | Significado |
|---|---|
| `$MAESTRI_FLOOR_NAME` | Nome do andar |
| `$MAESTRI_BRANCH_NAME` | Nome da branch git |
| `$MAESTRI_FLOOR_PATH` | Diretório de trabalho do andar |
| `$MAESTRI_ROOT_PATH` | Raiz original do projeto |
| `$MAESTRI_PROJECT_NAME` | Nome do workspace |

### 2.5. Aterrissagem (land / merge de volta)

Quando o trabalho está pronto, **aterrissa-se** o andar de volta ao Térreo. Pré-requisito: **todas as alterações commitadas** (sem *working tree* suja). Clica-se em **Aterrissar** no painel do andar.

A interface de aterrissagem mostra a branch do andar à esquerda, a branch de destino (térreo) à direita, e um ícone de avião representando a transferência dos commits. Escolhe-se o destino:

- **Mesma branch do andar** — os commits são transferidos diretamente para o repositório original.
- **Branch diferente** — além de transferir, o sistema também faz um **merge** (se não houver conflitos).

Antes de confirmar, há uma **prévia do merge** com estatísticas de diff e conflitos potenciais. Confirmando em **Merge**, o sistema faz `git fetch` dos commits do andar de volta para o repositório original e os mescla na branch de destino, usando comandos git de baixo nível (*plumbing*) para **não perturbar a working tree** do Térreo.

> **Limitação assumida:** a resolução de conflitos de merge **não** é suportada na interface de Andares — o usuário resolve conflitos no seu IDE/terminal antes de mesclar.

### 2.6. Gestão (renomear / excluir)

- **Renomear:** botão direito no indicador de andar → renomear (útil quando o escopo muda).
- **Excluir:** clicar no **x** do andar. Escolhe-se:
  - **Manter a branch** — a branch continua no repositório para uso posterior;
  - **Excluir a branch** — remove o andar **e** sua branch.
  - O **diretório clonado é sempre removido**, liberando o espaço dos arquivos divergentes.

### 2.7. Requisitos (no Maestri)

- **Volume APFS** — a clonagem copy-on-write só funciona em APFS (padrão em Macs modernos). É um requisito **exclusivo de macOS**.
- **Repositório Git** — o workspace precisa ser um repo git.

---

## 3. Pontos interessantes / diferenciais

- **Isolamento real com custo quase zero.** Ao apoiar-se em copy-on-write do APFS, criar um andar é instantâneo e praticamente não consome disco — só o *delta*. Isso muda a economia: andares deixam de ser "pesados" e passam a ser descartáveis, incentivando o uso frequente.
- **Branch espelhada e visível para o resto do ecossistema.** A branch do andar existe no repositório original, então GitHub, IDE e CLI a enxergam. O andar não é um sandbox oculto — integra-se ao fluxo git normal.
- **Aterrissagem que não suja a árvore.** O uso de `git fetch` + comandos *plumbing* para mesclar sem tocar a *working tree* do Térreo é um cuidado de engenharia relevante: você pode aterrissar um andar sem interromper o que está aberto no Térreo.
- **Hooks com ciclo de vida completo (setup/run/teardown) + variáveis de ambiente.** Transforma cada andar num ambiente reproduzível e automatizável (instalar deps, subir serviços, limpar ao final), com acesso rápido pelo ícone de raio.
- **Metáfora espacial (Térreo/Andares/espaço 3D).** Empilhar ambientes num eixo visual e trazer o botão para junto do minimapa dá uma mentalidade clara de "camadas de trabalho" — casando bem com a natureza de canvas do produto.
- **Encaixe com orquestração multi-agente.** É o mecanismo que permite N agentes trabalharem em paralelo sem colisão de arquivos — o elo natural entre "canvas de agentes" e "trabalho git isolado".
- **Segurança na aterrissagem (postura conservadora).** Merge simples, sem `--force`; conflito é reportado, não resolvido automaticamente. Menos "mágica", menos risco de perder trabalho.

---

## 4. Como seria o backend

Esta seção descreve a arquitetura de backend — tanto a do Maestri (inferida da documentação) quanto, principalmente, a que o **Orkestra chegou a especificar e implementar** no plano da Fase 8 (`docs/superpowers/plans/2026-07-10-fase-8-floors-worktree.md`), antes de remover a feature.

### 4.1. Mecanismo de isolamento de filesystem

Há duas abordagens possíveis, com trade-offs distintos:

- **Clone APFS copy-on-write (abordagem Maestri):** clonagem instantânea de diretório no nível do filesystem. Vantagem: compartilha bytes, ocupa só o delta, e clona **tudo** (inclusive artefatos não versionados, como `node_modules`). Desvantagem: **amarrado ao macOS/APFS** — não é multiplataforma.
- **`git worktree` (abordagem do plano do Orkestra):** cria um novo diretório de trabalho ligado ao mesmo repositório git, numa branch dedicada. Vantagem: **multiplataforma**, sem duplicar o histórico git, sem dependência de filesystem específico. Desvantagem: só materializa a **árvore versionada** — artefatos não-versionados (`node_modules`, builds) **não** são copiados; cada worktree precisa do seu próprio `npm install` se aplicável.

### 4.2. Arquitetura desenhada no Orkestra (Fase 8)

O plano previa um **`FloorManager`** no *main process* do Electron, encapsulando todas as operações git, exposto ao renderer por IPC. Pontos-chave:

- **Tipo compartilhado** (`src/shared/floors.ts`):
  ```ts
  interface Floor { id: string; name: string; repoPath: string; worktreePath: string; branch: string }
  ```
- **`FloorManager` (`src/main/floors/FloorManager.ts`)** com a API `create / list / get / land / remove / loadPersisted`:
  - `create(repoPath, name)` → valida que é repo git (`git rev-parse --git-dir`); gera `id` (UUID); monta `worktreePath = <floorsDir>/<id>`; cria a branch `orkestra/floor-<slug>`; roda `git worktree add -b <branch> <worktreePath>`; persiste.
  - `land(id)` → `git merge --no-edit <branch>` no repo base; em conflito/erro, retorna `{ ok: false, output }` **sem** resolver nem forçar.
  - `remove(id)` → `git worktree remove --force <worktreePath>`; some da lista; persiste (a branch permanece salvo pedido explícito).
  - Persistência num `floors.json` no diretório de floors; `loadPersisted()` recarrega no boot.
- **IPC** (`src/main/floors/registerFloorIpc.ts`): canais `floor:create` (abre `dialog.showOpenDialog` para escolher o repo), `floor:list`, `floor:land`, `floor:remove`; expostos no preload como `window.orkestra.floors.{create,list,land,remove}`.
- **`cwd` do PTY por andar:** `pty:spawn` ganhava um `floorId?`; no main, `floorId → worktreePath` resolvia o `cwd` do terminal, de modo que o terminal/agente rodasse **dentro** do worktree do andar.
- **UI** (`src/renderer/src/components/FloorsPanel.tsx`): painel no canto do canvas listando andares, com botões Criar/Land/Remover; e um seletor no header do terminal para atribuir `data.floorId`.

### 4.3. Invariantes de segurança (do plano)

O plano da Fase 8 fixava invariantes fortes — relevantes porque operações git destrutivas partiam de entrada do renderer:

- Todo `worktreePath` é **sempre** `<floorsDir>/<id>` (UUID) — nunca um caminho arbitrário vindo do renderer.
- Toda branch de andar tem prefixo `orkestra/floor-`.
- `git` invocado **só** via `execFile('git', argsArray, {cwd})` — nunca `exec`/shell (sem injeção).
- `create` = `git worktree add` (não-destrutivo). `remove` = `git worktree remove` (remove só o worktree). `land` = `git merge` **sem** `--force`/`-X` — nunca `reset`/`rebase`/`push`; conflito é reportado, não resolvido.
- Antes de qualquer operação, valida que `repoPath` é repo git.

### 4.4. Orquestração de merge (aterrissagem)

No Maestri: `git fetch` dos commits do andar de volta ao repo original + merge via *plumbing* para não sujar a *working tree*. No plano do Orkestra: um `git merge --no-edit` direto no repo base, com o worktree e a branch **intactos** em caso de conflito (o usuário resolve manualmente; `git merge --abort` para desistir).

### 4.5. Hooks (backend)

No modelo do Maestri, os hooks seriam comandos disparados nos três momentos (setup na criação, run sob demanda, teardown na exclusão), executados no `cwd` do andar com as variáveis de ambiente injetadas (`$..._FLOOR_PATH`, `$..._BRANCH_NAME`, etc.). O plano da Fase 8 do Orkestra **não** chegou a especificar hooks — cobriu apenas create/list/land/remove e o `cwd` por andar (os hooks seriam um incremento posterior).

---

## 5. Estado atual no Orkestra

**A funcionalidade de Andares/Floors NÃO existe no Orkestra hoje. Foi implementada e depois REMOVIDA por completo, por decisão do usuário.** Isto está verificado no código, no histórico git e na documentação de decisão.

### 5.1. Verificação no código (estado atual)

- `grep -rli "worktree|floor|andar" src` retorna **apenas** `src/renderer/src/layout/arrange.ts`, e o único casamento ali é `Math.floor(i / cols)` (linha 130) — nada a ver com a feature.
- `find src -iname "*floor*"` → **nenhum arquivo**. Não existem `src/main/floors/FloorManager.ts`, `registerFloorIpc.ts`, `src/shared/floors.ts` nem `FloorsPanel.tsx`.
- Não há canais IPC `floor:*`, não há `window.orkestra.floors`, não há `floorId` no spawn de PTY. Terminais sempre spawnam com o `cwd` default (pasta do projeto / HOME) — confirmado em `src/main/projects/ProjectManager.ts` (gestão de projetos por `cwd`, sem qualquer noção de worktree/andar).

### 5.2. Histórico: foi implementada e depois removida

A feature **existiu** (Fase 8) e foi desmontada em duas etapas:

- **Implementação (Fase 8):**
  - `9c69129` — `feat: FloorManager (git worktree create/list/land/remove) (Fase 8)`
  - `c28df38` — `test: trava land-conflito + branch unica + remove resiliente no FloorManager (Fase 8 Task 1)`
  - `a1de678` — `feat: IPC de floors + cwd do PTY por floor (Fase 8)`
  - `01ffd24` — `feat: UI de floors + atribuir terminal a floor (Fase 8)`
- **Remoção da UI (Fase 15):**
  - `fc26580` — `feat: remover paineis de Rotinas e Floors da UI (Fase 15)` (removeu os painéis do `Canvas.tsx`).
- **Remoção total (Fase 16):**
  - `42d4db5` — `refactor: remover feature de Floors (git worktree) por completo (Fase 16)`. Este commit removeu **`FloorManager`, `registerFloorIpc`, `shared/floors.ts` e `FloorsPanel.tsx` por inteiro**, e desfez todo o *wiring* (import/setup/resolveCwd em `main/index.ts`; `resolveCwd`+`floorId` em `registerPtyIpc`; API `floors` no preload; select de floor em `TerminalFlowNode`; prop `floorId` em `TerminalNode`; action `updateTerminalFloor` no `canvasStore`). Terminais voltaram a spawnar sempre com o `cwd` default. Também limpou CSS morto (`.ork-panel--floors`) e o README (que descrevia Floors como feature ativa). **20 arquivos alterados, 672 deleções, 18 testes removidos**; suíte verde (205/205), typecheck e build limpos.

> Observação: a feature de **Rotinas (cron)** foi removida no mesmo movimento (`1ed4dea`, Fase 16), pela mesma lógica de enxugar escopo.

### 5.3. A decisão, documentada

A decisão de cortar Floors está registrada na documentação de mapeamento:

- `docs/maestri-mapa-funcionalidades-2026-07-11.md`:
  - Linha da tabela: **"Floors | cópias isoladas via git worktree + hooks + land/merge | 🗑️ removido (Fase 16)"**.
  - Seção final: **"Fora de escopo (decisão do usuário): Floors, Rotinas (removidos)..."**.
- `docs/maestri-changelog-analise-2026-07-13.md` (linha 5): a análise de changelog **"Exclui o que removemos por decisão do usuário (Floors, Rotinas)..."**.
- O **plano original** permanece no repositório como registro histórico: `docs/superpowers/plans/2026-07-10-fase-8-floors-worktree.md` (descreve toda a arquitetura que foi implementada e depois desfeita).

### 5.4. Resumo do estado

| Item | Estado |
|---|---|
| Código de Floors em `src/` | **Ausente** (removido na Fase 16) |
| Plano/spec | Preservado como histórico (`...fase-8-floors-worktree.md`) |
| Decisão | **Removido por decisão do usuário** (documentada) |
| Substituto atual | Isolamento é por **projeto** (`ProjectManager`, `cwd` por projeto) — **não** há isolamento por branch/worktree |

---

## 6. Melhorias sugeridas para o Orkestra

A feature foi cortada conscientemente para enxugar escopo. Esta seção avalia **se e como** reintroduzi-la, com prós/contras e priorização por valor × esforço. Nada aqui foi implementado — é análise.

### 6.1. Vale a pena reintroduzir?

**Prós de reintroduzir:**
- É o **elo natural** entre "canvas de orquestração de agentes" e "trabalho git isolado": permite N agentes em paralelo, cada um na sua branch, sem colisão de arquivos — um diferencial forte e coerente com a proposta do Orkestra.
- A arquitetura já foi **projetada e testada** (Fase 8); reintroduzir é, em boa parte, "des-reverter" com melhorias, não começar do zero. O plano e os invariantes de segurança estão preservados.
- `git worktree` é **multiplataforma** (não exige APFS), então o Orkestra poderia oferecer no Windows/Linux algo que a versão APFS do Maestri não oferece.

**Contras / riscos:**
- **Complexidade de UX real:** merge, conflitos, "working tree suja", `npm install` por worktree — muita superfície para o usuário se confundir e perder trabalho. A decisão original de cortar provavelmente pesou isto.
- **Artefatos não-versionados:** `git worktree` não copia `node_modules`/builds; sem hooks de setup, cada andar nasce "quebrado" para projetos com dependências. Isso torna os **hooks quase obrigatórios**, aumentando o escopo mínimo viável.
- **Manutenção:** operações git destrutivas exigem rigor contínuo (os invariantes da Fase 8) e testes com repos git reais (lentos).

### 6.2. Se reintroduzir — abordagem faseada sugerida

1. **MVP (baixo esforço, reusa a Fase 8):** ressuscitar `FloorManager` + IPC + `cwd`-por-andar + um painel mínimo (create/land/remove). Sem hooks, sem clone de layout, sem prévia de merge. Deixar explícito que é `git worktree` (multiplataforma) e que dependências não são copiadas.
2. **Hooks (médio esforço, alto valor):** setup/run/teardown com variáveis de ambiente (`ORKESTRA_FLOOR_PATH`, etc., com prefixo próprio — sem marca do Maestri). Resolve o problema do `node_modules` e torna cada andar reproduzível. Provavelmente o incremento de **maior valor** depois do MVP.
3. **Prévia de aterrissagem (médio esforço):** diff-stat + detecção de conflito **antes** do merge, mais o guard de "working tree limpa". Reduz muito o risco de o usuário perder trabalho.
4. **Integração com agentes (alto valor, específico do Orkestra):** ligar um andar diretamente a um nó de agente no canvas — "este agente trabalha neste andar" — e visualizar no canvas quais agentes estão em quais andares. É onde o Orkestra pode ir **além** do Maestri, casando andares com a orquestração visual.
5. **Metáfora espacial / clone de layout (baixo valor inicial, polish):** empilhamento visual "3D" e clonar o layout do Térreo. Bom para a experiência, mas não essencial ao valor funcional.

### 6.3. Priorização (valor × esforço)

| Incremento | Valor | Esforço | Prioridade |
|---|---|---|---|
| MVP (ressuscitar Fase 8: create/land/remove + cwd) | Alto | **Baixo** (código já existiu) | **1ª** |
| Hooks setup/run/teardown + env vars | Alto | Médio | **2ª** |
| Prévia de aterrissagem + guard de árvore limpa | Médio-Alto | Médio | 3ª |
| Andar ligado a nó de agente (diferencial Orkestra) | Alto | Médio-Alto | 4ª |
| Metáfora 3D + clone de layout | Baixo-Médio | Médio | 5ª (polish) |

**Recomendação:** só reintroduzir se a orquestração de **múltiplos agentes em paralelo** virar prioridade de produto — é aí que Andares deixam de ser "conveniência git" e viram infraestrutura essencial. Nesse caso, começar pelo MVP (reusando a Fase 8) + hooks é o melhor retorno sobre esforço. Enquanto o isolamento **por projeto** (atual) atender, manter Floors fora de escopo continua sendo uma decisão defensável.

---

## 7. Referência

**Documentação do produto de referência (Maestri):**
- `https://www.themaestri.app/pt-br/docs/floors` — "Andares" (Floors). Cobre: o que são, por quê, criar/trabalhar/aterrissar/renomear/excluir, hooks (setup/run/teardown + variáveis de ambiente + acesso rápido ⚡), requisitos (APFS + git) e "como funciona" (clone APFS copy-on-write, `.maestri/floors`, aterrissagem via `git fetch` + plumbing). Transcrito integralmente para a base desta análise.

**Arquivos e artefatos do Orkestra citados:**
- `docs/superpowers/plans/2026-07-10-fase-8-floors-worktree.md` — plano de implementação original (arquitetura `FloorManager`/IPC/`git worktree`, invariantes de segurança, UI). **Preservado como histórico**; a feature foi desfeita.
- `docs/maestri-mapa-funcionalidades-2026-07-11.md` — decisão registrada: "Floors 🗑️ removido (Fase 16)" e "Fora de escopo (decisão do usuário): Floors, Rotinas (removidos)".
- `docs/maestri-changelog-analise-2026-07-13.md` (linha 5) — reafirma a exclusão de Floors/Rotinas por decisão do usuário.
- `src/main/projects/ProjectManager.ts` — isolamento atual é **por projeto** (`cwd` por projeto), sem qualquer noção de worktree/andar.
- `src/renderer/src/layout/arrange.ts` (linha 130) — único casamento de "floor" restante em `src/`, e é apenas `Math.floor` (não relacionado à feature).

**Histórico git (commits verificados):**
- Implementação (Fase 8): `9c69129`, `c28df38`, `a1de678`, `01ffd24`.
- Remoção da UI (Fase 15): `fc26580`.
- Remoção total (Fase 16): `42d4db5` — *"remover feature de Floors (git worktree) por completo"* (20 arquivos, 672 deleções, 18 testes removidos).

---

*Documento gerado em 2026-07-15 a partir da doc oficial do Maestri (transcrição integral) e da inspeção direta do código, plano e histórico git do Orkestra. Sem uso de marca do Maestri no código; funcionalidades descritas com palavras próprias.*
