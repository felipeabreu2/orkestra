# Plano de Implementação — Árvore de Arquivos

> **Origem:** `docs/analise-maestri-360/arvore-arquivos.md` · **Status:** Proposto — pronto para execução · **Onda(s):** 1 → 3

---

## 1. Objetivo & valor

Evoluir o nó **Árvore de Arquivos** (`filetree`) do canvas de um explorador **somente-leitura em modo lista** para um mini-IDE embutido, na direção do Maestri, **sem sair do canvas**. O plano é incremental e prioriza **valor × esforço**:

- **Onda 1 (ganhos rápidos, reaproveitam infra existente):** corrigir o **bug do overlay de git status** quando a raiz da árvore é um subdiretório do repo, e a ponte de **maior ROI** — arrastar um arquivo da árvore direto para o terminal de um agente (contexto). Ambos entregam valor com baixíssimo risco.
- **Onda 2 (§4.4 do brief):** editor de código embutido (entregue como `textarea` com escrita atômica — CodeMirror movido para a Onda 3, ver T4) e "**citar seleção → agente conectado**", fechando o loop ler → editar → perguntar ao agente.
- **Onda 3 (mini-IDE completo):** git de escrita (commit/branch), modo **Diff**, **watch** de filesystem com auto-refresh, **busca** na árvore (nome/conteúdo), citar diff → agente e menu de contexto com mutação.

O norte do produto: transformar o explorador de um utilitário passivo em **ferramenta de orquestração de agentes** (arquivo → contexto, trecho → prompt).

---

## 2. Estado atual no código (verificado)

| Arquivo real | O que já faz | Relevância |
| --- | --- | --- |
| `src/renderer/src/components/FileTreeNode.tsx` | Nó explorador: navegação **lazy** por diretório (`filetree.list` sob demanda, `childrenCache`/`expanded`), overlay de git via `gitMarker()`, preview textual (`filetree.read`) com estados carregando/binário/truncado/erro, fallback de raiz p/ `cwd` do projeto ativo, header com refresh-git/trocar-pasta/remover. **Contém a função-bug `relativeToRoot`** (linhas 27–30) e o comentário que reconhece a limitação (linhas 23–26). | Alvo central de quase todas as tarefas |
| `src/main/filetree/FileTreeService.ts` | `list` (não-recursivo, pastas antes, alfabético case-insensitive), `read` (cap 256 KB, binário por byte NUL, `truncated` via `stat`), `gitStatus` (`git -c core.quotePath=false -C dir status --porcelain` → `Record<path,status>`; fora de repo → `{}`). **Somente-leitura.** | Base do backend; recebe o fix do bug e os novos métodos git |
| `src/main/filetree/FileTreeService.test.ts` | Testes com repo git real em tmpdir (`execFileSync('git', …)`), cobrindo list/read/gitStatus incl. nome acentuado. Padrão de teste a reusar. | Onde entra a **regressão do bug** |
| `src/main/filetree/registerFileTreeIpc.ts` | 3 handlers `filetree:list|read|gitStatus`, cada um delega 1:1 ao serviço. | Ajuste do contrato de `gitStatus`; novos handlers nas ondas 2–3 |
| `src/preload/index.ts` | Bridge `window.orkestra.filetree.{list,read,gitStatus}`, `ide.open(path)`, `getPathForFile(file)` (webUtils). | Tipagem do novo retorno de `gitStatus`; novos métodos |
| `src/renderer/src/terminal/dropPaths.ts` | `quotePathForShell` (aspas simples, unicode/espaço-safe) e `pathsToTerminalInput` (junta caminhos + espaço final). **Puro e testado.** | **Reuso direto** no arrastar-árvore→terminal |
| `src/renderer/src/terminal/dropPaths.test.ts` | Testa `quotePathForShell`/`pathsToTerminalInput` (espaço, parênteses, acento, aspa interna). | Modelo de teste do drag |
| `src/renderer/src/components/TerminalNode.tsx` | `onDragOver`/`onDrop` já aceitam **drop de arquivos externos do Finder**: resolve via `getPathForFile`, aspa com `pathsToTerminalInput`, escreve no pty (`pty.write`). Trata só `dataTransfer.files` (externos). | Estender p/ aceitar payload interno da árvore |
| `src/renderer/src/terminal/terminalRegistry.ts` | `registerTerminalPty`/`getTerminalPty(nodeId)`: resolve `nodeId` → `ptyId`. | Escrever no pty do agente conectado (citar→agente) |
| `src/renderer/src/context/contextBlock.ts` | `buildContextBlock(label, content)` monta bloco `[contexto — …]` sem Enter final; `htmlToText` sanitiza via DOMParser inerte. | Reuso na citação de seleção/diff → agente |
| `src/renderer/src/components/FileNode.tsx` | Nó `type:'file'` (clip): 1 arquivo no canvas, preview textual (`filetree.read`, 2000 chars). Criado hoje pela toolbar, **não** por drag da árvore. | Destino do arrastar-árvore→canvas |
| `src/renderer/src/store/canvasStore.ts` | `addFileTreeNode(pos, {rootPath})`, `addFileNode(pos, {path})`, `updateFileTreeRoot(id, rootPath)` (persiste via serialize genérico). Edges expõem `{source,target,...}`. | Criar file-node por drag; persistir expansão |
| `src/main/ide/openInEditor.ts` (+ `registerIdeIpc.ts`) | `openInEditor(path, deps)` puro: allowlist `code|cursor|subl|zed|idea|webstorm|pycharm`, fallback p/ file manager. Hoje `ide.open` recebe a **pasta** do projeto. | Estender p/ abrir **arquivo** no duplo-clique |
| `src/shared/filetree.ts` | `interface FileEntry { name; path; isDir }`. | Tipos compartilhados |

**Infra ausente (relevante):** não há CodeMirror/Monaco (notas usam TipTap, terminais xterm, e o editor da árvore é um `textarea` — ver T4); não há ripgrep/grep no main; não há watcher de fs. Vitest já configurado (`npm test` = `vitest run`), jsdom disponível, `shadcn` em devDeps.

---

## 3. Gaps priorizados

| Gap | Prioridade | Valor | Esforço (S/M/L) | Onda |
| --- | --- | --- | --- | --- |
| **BUG:** overlay de git status some em arquivo aninhado quando raiz ≠ toplevel do repo (`relativeToRoot`) | **P1** | Alto (correção) | M | 1 |
| Arrastar arquivo da árvore → terminal do agente (#4, **maior ROI**) | **P1** | Alto | M | 1 |
| Abrir arquivo selecionado no editor externo (duplo-clique) | P1 | Médio | S | 1 |
| Editor de código embutido (`textarea` + `write` atômico) | P3 | Alto | M | 2 |
| Editor CodeMirror (realce, find/replace, ir-para-linha) — movido da Onda 2 por decisão (T4) | P3 | Médio | L | 3 |
| Citar seleção do editor → agente conectado | P3 | Alto | M | 2 |
| Arrastar árvore → canvas (preview node) | P2 | Médio | M | 2 |
| Persistir expansão por instância (estado por nó) | P2 | Médio | S | 2 |
| Indicador de branch + modo **Diff** (git leitura) | P2/P3 | Alto | M | 3 |
| Watch de filesystem com auto-refresh | P2 | Médio | M | 3 |
| Busca por nome / conteúdo (`>`) na árvore | P4 | Médio | M/L | 3 |
| Operações git de **escrita** (commit/branch) | P3 | Alto | L | 3 |
| Citar bloco de diff → agente conectado | P3 | Alto | M | 3 |
| Menu de contexto com mutação (criar/renomear/mover/excluir) | P3 | Médio | L | 3 |

---

## 4. Tarefas de implementação (TDD, em ordem)

### T1 — Corrigir overlay de git status para raiz = subdiretório do repo (BUG · regressão explícita)  [P1 · M · Onda 1]

**Causa-raiz (verificada empiricamente):** `git -C <dir> status --porcelain` devolve os paths **sempre relativos ao TOPLEVEL do repo**, não a `<dir>`. Confirmado: num repo com `sub/deep/a.txt` modificado, tanto `git -C <toplevel>` quanto `git -C <toplevel>/sub` imprimem `sub/deep/a.txt`. Já `relativeToRoot(root, entry.path)` remove o prefixo da **raiz da árvore**: com `root = <repo>/sub`, o arquivo `<repo>/sub/deep/a.txt` vira `deep/a.txt`, que **não casa** com a chave `sub/deep/a.txt` → o marcador some. Quando `root` = toplevel, o prefixo é vazio e casa por sorte. O pedaço que falta é o prefixo do dir dentro do repo, dado por `git -C <dir> rev-parse --show-prefix` (→ `sub/` no subdir, `''` no toplevel).

**Design do fix:** o main passa a devolver, junto do status, o **prefixo** do dir dentro do repo; o renderer compõe a chave como `prefix + relativoÀRaiz(root, path)`. Isso mantém as **chaves de `entries` idênticas às de hoje** (só o wrapper muda) e é seguro a symlinks (nunca compara paths absolutos contra o toplevel normalizado do git).

**Arquivos a tocar:**
- `src/main/filetree/FileTreeService.ts` — `gitStatus` passa a retornar `{ prefix: string; entries: Record<string,string> }`.
- `src/main/filetree/FileTreeService.test.ts` — regressão + migração das asserções existentes.
- `src/main/filetree/registerFileTreeIpc.ts` — handler continua 1:1 (só o tipo muda).
- `src/preload/index.ts` — tipo de retorno de `filetree.gitStatus`.
- `src/renderer/src/components/fileTreeGit.ts` **(novo)** — extrai `relativeToRoot` (movido de `FileTreeNode.tsx`) + `gitKeyForEntry(prefix, root, path)`.
- `src/renderer/src/components/fileTreeGit.test.ts` **(novo)** — teste puro do helper.
- `src/renderer/src/components/FileTreeNode.tsx` — remove `relativeToRoot` local; usa `gitStatus.entries[gitKeyForEntry(gitStatus.prefix, root, entry.path)]`; ajusta o state/prop `gitStatus` para `{ prefix, entries }`.

**Passos TDD:**
1. **Teste que falha (regressão, main):** em `FileTreeService.test.ts`, criar repo com `sub/deep/a.txt`, commitar, modificar o arquivo aninhado:
   - `const st = await svc.gitStatus(join(dir, 'sub'))` → `expect(st.prefix).toBe('sub/')` e `expect(st.entries['sub/deep/a.txt']).toBeTruthy()` (o overlay resolve mesmo com raiz = subdir).
   - `const top = await svc.gitStatus(dir)` → `expect(top.prefix).toBe('')` (comportamento de toplevel preservado).
2. **Teste que falha (helper puro, renderer):** em `fileTreeGit.test.ts`:
   - `expect(gitKeyForEntry('', '/repo', '/repo/deep/a.txt')).toBe('deep/a.txt')`
   - `expect(gitKeyForEntry('sub/', '/repo/sub', '/repo/sub/deep/a.txt')).toBe('sub/deep/a.txt')` — **calcula o caminho certo quando raiz ≠ toplevel**.
3. **Implementação:**
   - `FileTreeService.gitStatus`: após o `status --porcelain`, rodar `execFileAsync('git', ['-C', dir, 'rev-parse', '--show-prefix'])`, `prefix = stdout.trim()` (`''` se falhar/toplevel); montar `entries` como hoje; retornar `{ prefix, entries }`. Fora de repo → `{ prefix: '', entries: {} }`.
   - `fileTreeGit.ts`: `relativeToRoot(root, path)` (idêntico ao atual) + `gitKeyForEntry(prefix, root, path) => prefix + relativeToRoot(root, path)`.
   - `FileTreeNode.tsx`: `gitStatus` state vira `{ prefix: string; entries: Record<string,string> }` (default `{ prefix: '', entries: {} }`); `TreeLevel` recebe `gitStatus` e faz `gitMarker(gitStatus.entries[gitKeyForEntry(gitStatus.prefix, root, entry.path)])`.
   - **Migrar asserções existentes** em `FileTreeService.test.ts`: `st['README.md']` → `st.entries['README.md']`; `st['novo.txt']` → `st.entries['novo.txt']`; `st[accented]`/`Object.keys(st)` → `st.entries[accented]`/`Object.keys(st.entries)`.
   - Atualizar o tipo em `preload/index.ts`: `gitStatus(dir): Promise<{ prefix: string; entries: Record<string,string> }>`.
4. **Verde:** `npx vitest run src/main/filetree/FileTreeService.test.ts src/renderer/src/components/fileTreeGit.test.ts` + `npm run typecheck`.

**Critérios de aceite:**
- Árvore apontando para um **subdiretório** de um repo mostra M/A/D/? nos arquivos aninhados (antes: sumiam).
- Árvore apontando para o **toplevel** continua idêntica (prefix `''`).
- Fora de repo git: sem erro, sem marcadores (`{ prefix:'', entries:{} }`).
- Nomes acentuados seguem casando (teste `café.txt` verde após migração).

**Notas / riscos:**
- **Symlinks:** `rev-parse --show-toplevel` normaliza symlinks (ex.: `/tmp` → `/private/tmp`) e não casaria com `entry.path` cru; por isso o fix usa `--show-prefix` (relativo) e compõe com `relativeToRoot`, **evitando comparação de paths absolutos**.
- **Migração de teste** é obrigatória (3 asserções) porque o shape de `gitStatus` muda — está listada acima; sem ela o suite quebra.
- **Alternativa menos invasiva** (se preferir não mudar o shape): manter `gitStatus` como está e adicionar método/IPC separado `gitPrefix(dir): Promise<string>`. Custa um round-trip a mais e mantém os testes atuais intactos; o design escolhido é preferido por ser atômico (prefixo e status do mesmo contexto de repo).

---

### T2 — Arrastar arquivo da árvore → terminal do agente (maior ROI)  [P1 · M · Onda 1]

**Objetivo:** tornar as linhas de **arquivo** da árvore arrastáveis; ao soltar sobre um `TerminalNode`, inserir o caminho absoluto (aspas-safe) no pty do agente — o mesmo efeito do drop de arquivo externo, reaproveitando `pathsToTerminalInput`.

**Arquivos a tocar:**
- `src/renderer/src/terminal/dropPaths.ts` — nova constante `ORKESTRA_PATH_MIME = 'application/x-orkestra-path'` e helper `readDroppedPaths(dataTransfer)` (extrai payload interno + externos), puro e testável.
- `src/renderer/src/terminal/dropPaths.test.ts` — testes do novo helper com um `DataTransfer`-like.
- `src/renderer/src/components/FileTreeNode.tsx` — nas linhas de arquivo, `draggable` + `onDragStart` setando `e.dataTransfer.setData(ORKESTRA_PATH_MIME, entry.path)` e `text/plain` (fallback), `effectAllowed='copy'`.
- `src/renderer/src/components/TerminalNode.tsx` — `onDragOver` aceita também `types.includes(ORKESTRA_PATH_MIME)`; `onDrop` usa `readDroppedPaths` (externos via `getPathForFile` + internos via `getData`).

**Passos TDD:**
1. **Teste que falha:** em `dropPaths.test.ts`, `pathsToTerminalInput(['/a b/c.ts'])` → `"'/a b/c.ts' "` (espaço escapado dentro das aspas — já garantido) **e** `readDroppedPaths({ types:[ORKESTRA_PATH_MIME], getData:()=> '/a b/c.ts', files:[] })` → `['/a b/c.ts']`; com `files` vazios e sem MIME → `[]`.
2. **Implementação:** `readDroppedPaths` lê `ORKESTRA_PATH_MIME` (ou `text/plain`) para o drag interno; para `files` externos preserva o caminho já resolvido pelo chamador. `FileTreeNode` marca a `<div>` da linha de arquivo com `draggable` (mantendo `nodrag` para não iniciar o pan do React Flow) e popula o `dataTransfer` no `onDragStart`. `TerminalNode.onDrop`: `const paths = readDroppedPaths(...)`; se houver, `pty.write(ptyId, pathsToTerminalInput(paths))` + `term.focus()`.
3. **Verde:** `npx vitest run src/renderer/src/terminal/dropPaths.test.ts` + `npm run typecheck`.

**Critérios de aceite:**
- Arrastar um arquivo da árvore e soltar num terminal insere `'…/arquivo' ` no prompt (sem disparar Enter), com espaços/acentos preservados.
- Drop de arquivo **externo do Finder** segue funcionando (não regride).
- Arrastar não move o nó da árvore no canvas (pan/drag do React Flow não é acionado).

**Notas / riscos:**
- HTML5 `draggable` coexiste com o `nodrag` (que só bloqueia o drag baseado em pointer do React Flow) — validar no `npm run dev` que não há conflito de foco/seleção.
- Pastas **não** são arrastáveis nesta tarefa (evita `cd`-ambíguo); só arquivos.
- Passar 1 caminho por drag mantém `pathsToTerminalInput` trivialmente correto (já suporta múltiplos).

---

### T3 — Abrir arquivo selecionado no editor externo (duplo-clique)  [P1 · S · Onda 1]

**Objetivo:** duplo-clique numa linha de **arquivo** abre-o no editor externo instalado; hoje `openInEditor` já resolve a allowlist, mas `ide.open` recebe a **pasta** do projeto.

**Arquivos a tocar:**
- `src/main/ide/openInEditor.ts` — sem mudança de lógica (já recebe um `path` genérico; arquivo ou pasta).
- `src/main/ide/openInEditor.test.ts` — caso: `openInEditor('/x/a.ts', deps)` chama `tryExec('code', ['/x/a.ts'])`.
- `src/renderer/src/components/FileTreeNode.tsx` — `onDoubleClick` na linha de arquivo → `window.orkestra.ide.open(entry.path)` (mantém o clique simples abrindo o preview).

**Passos TDD:**
1. **Teste que falha:** em `openInEditor.test.ts`, com `deps.tryExec` espionado, `await openInEditor('/x/a.ts', { tryExec })` deve invocar `tryExec` com `['/x/a.ts']` e retornar `{ ok:true, editor:'code' }`.
2. **Implementação:** confirmar que `openInEditor` já passa `[path]` (passa) e ligar o `onDoubleClick` no renderer.
3. **Verde:** `npx vitest run src/main/ide/openInEditor.test.ts`.

**Critérios de aceite:**
- Duplo-clique num arquivo abre no editor da allowlist; sem editor, cai no file manager (comportamento atual de `openInEditor`).
- Clique simples continua abrindo o preview embutido.

**Notas / riscos:** distinguir clique simples de duplo (usar `onDoubleClick` nativo; o preview no `onClick` tolera o disparo duplo). Opcional: renomear conceitualmente para `ide.openPath`, mantendo `ide.open` por compat.

---

### T4 — Editor de código embutido  [P3 · M · Onda 2 → 3 · §4.4] — ✅ **ENTREGUE; CodeMirror migrado na Onda 3**

**Status (2026-07-16, atualizado no mesmo dia):** entregue e fechado **com CodeMirror**. A história em duas etapas, porque as duas importam para quem ler depois:

1. Na Onda 2 o editor saiu como **`<textarea>`** — decisão consciente, com a parte difícil (persistência atômica e segurança de escrita) feita direito, e o CodeMirror adiado para a Onda 3 pela razão registrada abaixo.
2. O usuário então **escolheu abrir a Onda 3 justamente pela Árvore**, e a migração foi feita. O `<textarea>` não existe mais.

**O que foi entregue (estado atual):**
- `src/renderer/src/editor/languageForPath.ts` — puro, **sem import de CodeMirror**: `path → LanguageId`. Fallback `plain` para extensão desconhecida, sem extensão, dotfile (`.gitignore`) e caminho degenerado. Olha só o *basename*, então `/repo/v1.2/Makefile` não vira "extensão 2".
- `src/renderer/src/editor/cmLanguage.ts` — `LanguageId → Extension`, com `Record` exaustivo: adicionar um id sem parser vira **erro de typecheck**, não editor mudo em runtime.
- `src/renderer/src/editor/cmTheme.ts` — tema sobre os tokens do projeto. `EditorView.theme` só injeta CSS, então usa `var(--token)` direto e claro↔escuro acompanha o flip de `data-theme` **sozinho**, sem observer e sem recriar o view (ao contrário do xterm, que pinta em canvas). Tokens `--syn-*` novos em `tokens.css` nos dois temas (paleta Xcode Default), porque os `--paper-*` são idênticos nos dois e ilegíveis no claro.
- `src/renderer/src/components/FileEditor.tsx` — sobre `EditorView`: realce, find/replace, ir-para-linha, ⌘/Ctrl+S.
- `src/main/filetree/FileTreeService.ts` — `write(path, content)` **atômico** (inalterado pela migração).
- `src/main/filetree/FileTreeService.ts` — `write(path, content)` **atômico**: grava num `.orktmp`, `fsync` do handle, `rename` por cima do alvo. Espelha o padrão endurecido de `ProjectManager.writeJson` — um leitor concorrente vê o arquivo velho ou o novo inteiro, nunca metade.
- **Guard de traversal no MAIN** (`isUnderRoot`, via `resolve` + comparação de prefixo): escrita fora da raiz do projeto é barrada no processo privilegiado, não só na UI. Binário e arquivos truncados (>256 KB) não abrem para edição.
- `registerFileTreeIpc.ts` + `src/preload/index.ts` — handler/bridge `filetree:write`.

**Decisão original (2026-07-16), mantida como registro:** o `textarea` entregava o loop que a Onda 2 prometia — ler → editar → salvar → citar seleção — e o CodeMirror isolado renderia só conforto, valendo mais junto do Diff/git/watch. A decisão continuou correta; o que mudou foi o usuário optar por **começar a Onda 3 pela Árvore**, o que tornou o "junto" o agora.

**Achados da migração (registrados porque não são óbvios):**
- **Citar seleção (T5) sobreviveu sem tocar em `quoteSelection.ts`:** `view.state.selection.main.{from,to}` são offsets de caractere no mesmo texto que `selectionStart/End` davam. A migração na verdade **removeu** um problema — sumiu o `onSelect/onMouseUp` que existia só para a seleção sobreviver ao blur (agora ela vive no `EditorState`), e `from ≤ to` já vem normalizado, coisa que o textarea podia devolver invertido.
- **Bug real corrigido — ⌘G disparava duas ações:** o `searchKeymap` liga ⌘G a find-next, e o handler global de ⌘G do `Canvas.tsx` (agrupar) roda **antes** do guard `isTypingTarget` de propósito; o keydown do CM borbulha até `window` mesmo com `preventDefault`. Um ⌘G buscaria **e** agruparia nós. Removido só o `Mod-g` do keymap do editor; próxima/anterior seguem em F3/⇧F3 e no Enter do painel. ⌘D/⌘C/⌘V/⌘Z/Backspace estão protegidos (o `isInputDOMNode` do React Flow cobre `contenteditable`).
- **Armadilha de teste:** `EditorState.create` dá ao parser só ~20 ms e então `takeTree()` devolve árvore **parcial** — testes de realce ficam flaky sob workers paralelos. Use `ensureSyntaxTree(state, len, 10_000)`. Não afeta produção (o CM segue o parse em idle).
- **Bundle:** +1.102 kB no chunk principal, mas esse chunk **sai não-minificado**, então o número é fonte crua. Custo isolado do CodeMirror medido com esbuild: **605 KB minificado / 207 KB gzip**. Sendo Electron lendo do disco local, o custo é disco+parse, não rede.
- `EditorView.lineWrapping` ligado de propósito: num nó de 300px a quebra ganha da rolagem horizontal. Reversível numa linha.

**Já entregue pela migração:** realce por linguagem, find/replace (`@codemirror/search`) e ir-para-linha — este último **destrava a T10** (busca → abrir na linha), que antes dependia dele e por isso apontava para a Onda 3.

**Critérios de aceite (atendidos):** abrir arquivo texto no editor, editar, salvar e ver refletido no `read`/disco; binário/>256 KB tratados com aviso; escrita fora da raiz bloqueada; realce, find/replace e ir-para-linha funcionando; tema seguindo os tokens em claro e escuro.

**Cobertura:** o `vitest` deste projeto coleta `src/**/*.test.ts` e **não `.tsx`** — `FileEditor.tsx` não tem cobertura automática. Compensado empurrando o testável para fora dele: `languageForPath` (puro), `cmLanguage` (testado com **parser real**, nomes de nó extraídos da saída real) e `cmTheme` (um teste lê o fonte e exige que todo `var(--x)` exista em `tokens.css` — um typo lá não quebraria o runtime, só voltaria em silêncio ao tema default do CM). O resto é QA manual.

**Notas / riscos:** `write` rompeu o design read-only do `FileTreeService` — por isso o guard de raiz é obrigatório e vive no main. O guard atual é **lexical pós-`resolve`**: não resolve symlinks; isso e o guard completo de mutação (criar/mover/excluir) são a Onda 3 · T13.

---

### T5 — Citar seleção do editor → agente conectado  [P3 · M · Onda 2 · §4.4]

**Objetivo:** ao selecionar texto no editor, oferecer "enviar ao agente conectado" — escreve a citação no pty do terminal ligado por edge ao nó da árvore.

**Arquivos a tocar:**
- `src/renderer/src/context/contextBlock.ts` — reuso de `buildContextBlock(label, content)` (já existe; sem Enter final).
- `src/renderer/src/components/FileTreeNode.tsx` / `FileEditor.tsx` — botão flutuante "chat" na seleção.
- `src/renderer/src/components/fileTreeAgent.ts` **(novo)** + `.test.ts` — `resolveConnectedTerminal(nodeId, edges)` (retorna o `nodeId` de terminal ligado por edge) — puro/testável.
- `src/renderer/src/terminal/terminalRegistry.ts` — `getTerminalPty(nodeId)` (já existe) para obter o `ptyId`.

**Passos TDD:**
1. **Teste que falha:** `resolveConnectedTerminal('ft1', [{source:'ft1',target:'term9'}])` → `'term9'`; sem edge → `undefined`; e `buildContextBlock('src/a.ts:12-20', 'const x=1')` produz `"[contexto — src/a.ts:12-20]\nconst x=1\n"` (sem Enter de disparo).
2. **Implementação:** ao clicar no ícone da seleção, resolver terminal conectado → `getTerminalPty` → `pty.write(ptyId, buildContextBlock(label, selection))`.
3. **Verde:** `npx vitest run src/renderer/src/components/fileTreeAgent.test.ts src/renderer/src/context/contextBlock.test.ts`.

**Critérios de aceite:** com árvore ligada a um terminal por edge, citar uma seleção injeta o bloco no prompt do agente (sem enviar sozinho); sem terminal ligado, o botão fica desabilitado/avisa.

**Notas / riscos:** definir política quando houver **múltiplos** terminais ligados (o primeiro por ordem de edge, ou um seletor). Reusa exatamente a ergonomia já existente de "nó ligado a terminal = contexto".

---

### T6 — Arrastar árvore → canvas (preview node)  [P2 · M · Onda 2]

**Objetivo:** soltar um arquivo da árvore em área vazia do canvas cria um `FileNode` com aquele arquivo (hoje só criado pela toolbar).

**Arquivos a tocar:**
- `src/renderer/src/components/Canvas.tsx` — `onDrop`/`onDragOver` no wrapper do React Flow: se o payload for `ORKESTRA_PATH_MIME`, converter posição de tela → canvas (`screenToFlowPosition`) e `addFileNode(pos, { path })`.
- `src/renderer/src/store/canvasStore.ts` — `addFileNode` já aceita `{ path }` (sem mudança).
- `src/renderer/src/components/FileNode.tsx` — (evolução opcional) renderizar imagem/PDF/vídeo além de texto.

**Passos TDD:**
1. **Teste que falha (store):** `addFileNode(pos, { path:'/x/a.ts' })` adiciona 1 nó `type:'file'` com `data.path==='/x/a.ts'` (em `canvasStore.test.ts`).
2. **Implementação:** ligar o drop do canvas ao `addFileNode`; reusar `ORKESTRA_PATH_MIME` da T2.
3. **Verde:** `npx vitest run src/renderer/src/store/canvasStore.test.ts`.

**Critérios de aceite:** arrastar arquivo da árvore para o canvas cria um clip na posição do drop; drop sobre terminal continua indo para o pty (T2), sem duplicar.

**Notas / riscos:** desambiguar destino (terminal vs. canvas) pelo alvo do evento — o `TerminalNode.onDrop` faz `stopPropagation` para não borbulhar até o canvas.

---

### T7 — Persistir expansão por instância  [P2 · S · Onda 2]

**Objetivo:** cada árvore lembra as pastas abertas ao fechar/reabrir (o Maestri destaca "cada árvore lembra seu estado").

**Arquivos a tocar:**
- `src/renderer/src/store/canvasStore.ts` — novo `updateFileTreeExpanded(id, string[])` (mesmo padrão de `updateFileTreeRoot`, persistindo `data.expanded`).
- `src/renderer/src/store/canvasStore.test.ts` — teste do reducer.
- `src/renderer/src/components/FileTreeNode.tsx` — inicializar `expanded` de `data.expanded`; ao togglar, persistir; re-listar as pastas persistidas ao montar.

**Passos TDD:**
1. **Teste que falha:** `updateFileTreeExpanded(id, ['/a','/a/b'])` grava `data.expanded` no nó certo (via `histPatch` com tag própria).
2. **Implementação:** reducer + hidratação do `expanded` na montagem (re-`list` das pastas abertas).
3. **Verde:** `npx vitest run src/renderer/src/store/canvasStore.test.ts`.

**Critérios de aceite:** reabrir o app restaura as pastas expandidas por nó; múltiplas árvores não se sobrescrevem.

**Notas / riscos:** persistir só o **conjunto de caminhos** (não o `childrenCache`, que é derivável) para o snapshot ficar enxuto; re-listar sob demanda no hydrate.

---

### T8 — Indicador de branch + modo Diff (git leitura)  [P2/P3 · M · Onda 3]

**Objetivo:** mostrar a branch atual no header e um modo **Diff** (alterações não commitadas). Leitura pura, mesmo padrão seguro de `execFile` do `gitStatus`.

**Arquivos a tocar:**
- `src/main/filetree/FileTreeService.ts` — `gitBranch(dir)` (`git -C dir rev-parse --abbrev-ref HEAD` ou `branch --show-current`) e `gitDiff(dir, path?)` (`git -C dir diff` / `diff --cached`).
- `src/main/filetree/FileTreeService.test.ts` — repo real: branch após init/commit; `gitDiff` de arquivo modificado contém o hunk.
- `registerFileTreeIpc.ts` + `preload/index.ts` — `filetree:gitBranch|gitDiff`.
- `src/renderer/src/components/FileTreeNode.tsx` — header com branch; toggle de modo (Lista ↔ Diff).

**Passos TDD:**
1. **Teste que falha:** `gitBranch(dir)` → nome da branch inicial; fora de repo → `''`. `gitDiff(dir)` inclui `+`/`-` do arquivo modificado.
2. **Implementação:** métodos + IPC + UI de branch/diff (render textual do diff com realce simples).
3. **Verde:** `npx vitest run src/main/filetree/FileTreeService.test.ts`.

**Critérios de aceite:** header exibe a branch dentro de repo (vazio fora); modo Diff lista as mudanças; nenhuma escrita no repo.

**Notas / riscos:** manter `-c core.quotePath=false` também aqui; diff grande deve ser truncado/virtualizado.

---

### T9 — Watch de filesystem com auto-refresh  [P2 · M · Onda 3]

**Objetivo:** a árvore reflete mudanças feitas por agentes/editor sem refresh manual.

**Arquivos a tocar:**
- `src/main/filetree/FileTreeWatcher.ts` **(novo)** — `fs.watch`/`chokidar` escopado às pastas expandidas, com **debounce**, ignorando `node_modules`/`.git`/saída; emite evento IPC.
- `registerFileTreeIpc.ts` + `preload/index.ts` — `filetree:watch(dir)` e push `filetree:changed` (padrão `ipcRenderer.on`, como `orchestration.onCommand`).
- `src/renderer/src/components/FileTreeNode.tsx` — assina `changed` → invalida `childrenCache` do nível afetado e re-lista + refaz `gitStatus`.
- `src/main/filetree/debounce.ts` **(novo)** + `.test.ts` — util de debounce puro/testável.

**Passos TDD:**
1. **Teste que falha:** `debounce(fn, 50)` chamado 3× em rajada dispara `fn` **uma** vez (fake timers do vitest).
2. **Implementação:** watcher com debounce + emissão IPC; invalidação de cache no renderer.
3. **Verde:** `npx vitest run src/main/filetree/debounce.test.ts`.

**Critérios de aceite:** editar um arquivo por fora atualiza a árvore e o overlay git sem clique; sem observar `node_modules`/`.git`; sem rajadas (debounce).

**Notas / riscos:** escopar ao **visível/expandido** (não à árvore inteira) para custo de watch baixo; encerrar watchers no unmount/troca de raiz.

---

### T10 — Busca por nome / conteúdo (`>`) na árvore  [P4 · M/L · Onda 3] — ✅ **ENTREGUE**

**Status (2026-07-16):** entregue conforme o plano, com os achados abaixo:
- O "abrir na linha" veio JUNTO (não ficou para depois): clicar num resultado de conteúdo abre o
  arquivo **direto no editor CodeMirror, posicionado e centrado na linha** (`initialLine` no
  FileEditor, com clamp — o arquivo pode ter mudado entre a varredura e o clique). Binário/truncado
  degradam para o preview normal.
- `searchContent` (main) reusa as peças existentes em vez de criar novas: `IGNORED_DIR_NAMES` do
  watch (`.git`/`node_modules` fora), e o `read()` de sempre (binário pulado por byte NUL; só os
  primeiros 256KB de cada arquivo — buscar além do que o preview MOSTRA produziria resultado que
  não abre). Tetos: `MAX_SEARCH_RESULTS=200` → `truncated:true` (a UI avisa "refine a busca");
  trecho por linha capado em 200 chars (linha minificada de 1MB não atravessa o IPC). Match por
  substring case-insensitive, sem regex (query não vira pattern). Raiz inexistente rejeita (contrato
  do list); erro no MEIO da varredura pula a entrada (best-effort). Symlink de dir não é seguido
  (dirent.isDirectory() é false) — sem ciclo.
- Filtro por NOME é client-side sobre o JÁ CARREGADO (raiz + níveis já listados, mesmo colapsados —
  `collectLoadedEntries` com guarda de ciclo), coerente com a árvore lazy: não varre disco atrás de
  pasta nunca aberta. Resultados planos com caminho relativo; arquivo mantém drag→terminal e
  duplo-clique→editor externo; pasta expande no fundo (enriquece o próprio filtro).
- Conteúdo dispara no **Enter** (não por keystroke — cada disparo é uma varredura de disco);
  digitar invalida os resultados (pertencem à query que os gerou); Esc/× limpam; trocar de raiz
  zera a busca.

**Cobertura:** `fileTreeFilter.ts` (parseSearchMode/filterByName/collectLoadedEntries) e
`FileTreeService.searchContent` testados (8 casos novos no serviço, incl. teto/truncated, binário,
ignore de node_modules/.git, cap de trecho e teto de 256KB). A fiação `.tsx` (rodapé, resultados,
abrir-na-linha) é QA manual, como o resto do nó.

**Objetivo:** campo de busca no rodapé — filtra por **nome** (client-side sobre o já carregado); `>` no início alterna para **conteúdo** (varre arquivos do nó no main).

**Arquivos a tocar:**
- `src/renderer/src/components/fileTreeFilter.ts` **(novo)** + `.test.ts` — `filterByName(entries, query)` e `parseSearchMode(input)` (`>` → modo conteúdo) — puros.
- `src/main/filetree/FileTreeService.ts` — `searchContent(dir, query)` (varredura limitada; futuro `rg`).
- `src/renderer/src/components/FileTreeNode.tsx` — input de busca + render de resultados.

**Passos TDD:**
1. **Teste que falha:** `parseSearchMode('>foo')` → `{ mode:'content', query:'foo' }`; `parseSearchMode('bar')` → `{ mode:'name', query:'bar' }`. `filterByName([...], 'ap')` retorna só os que casam (case-insensitive).
2. **Implementação:** filtro por nome primeiro (sem backend); depois `searchContent` para o modo `>`.
3. **Verde:** `npx vitest run src/renderer/src/components/fileTreeFilter.test.ts`.

**Critérios de aceite:** filtro por nome instantâneo sobre o carregado; `>` varre conteúdo e lista arquivo+linha; clicar abre o arquivo (posicionado na linha **só quando o CodeMirror chegar, na Onda 3** — o `textarea` da T4 não posiciona cursor por linha).

**Notas / riscos:** busca por conteúdo pode ser cara — limitar profundidade/tamanho e ignorar binários; integrar `rg` é evolução futura.

---

### T11 — Operações git de escrita (commit/branch)  [P3 · L · Onda 3]

**Objetivo:** menu no indicador de branch com `commit` (stage+commit) e `new branch`/`checkout` — dentro do app.

**Arquivos a tocar:**
- `src/main/filetree/FileTreeService.ts` — `gitCommit(dir, message)`, `gitCheckout(dir, branch)`, `gitCreateBranch(dir, name)` (via `execFile`, argumentos como allowlist, sem shell).
- `src/main/filetree/FileTreeService.test.ts` — repo real: commit muda `HEAD`; nova branch aparece em `branch`.
- `registerFileTreeIpc.ts` + `preload/index.ts` — handlers/bridge correspondentes.
- `src/renderer/src/components/FileTreeNode.tsx` — menu do branch + confirmação.

**Passos TDD:**
1. **Teste que falha:** após `gitCommit(dir, 'msg')` o `git log` tem 1 commit novo; `gitCreateBranch(dir,'feat')` + `gitCheckout` deixam `gitBranch` = `feat`.
2. **Implementação:** métodos git de escrita + UI mínima (mensagem de commit, nome de branch).
3. **Verde:** `npx vitest run src/main/filetree/FileTreeService.test.ts`.

**Critérios de aceite:** commit e criação/checkout de branch funcionam no repo da raiz; erros (nada staged, conflito) reportados de forma legível.

**Notas / riscos:** push/pull/fetch (rede/credenciais) **ficam fora** desta tarefa. Operações destrutivas exigem confirmação. Rompe o read-only — mesmo cuidado de validação de raiz.

---

### T12 — Citar bloco de diff → agente conectado  [P3 · M · Onda 3]

**Objetivo:** no modo Diff (T8), selecionar um bloco e enviá-lo ao agente conectado — "explique/refine este trecho".

**Arquivos a tocar:**
- `src/renderer/src/components/FileTreeNode.tsx` — ação "citar" na seleção do diff.
- Reuso de `resolveConnectedTerminal` (T5), `getTerminalPty` e `buildContextBlock`.

**Passos TDD:**
1. **Teste que falha:** `buildContextBlock('diff — src/a.ts', '@@ -1 +1 @@\n-old\n+new')` produz o bloco rotulado (sem Enter). Resolução do terminal reusa o teste da T5.
2. **Implementação:** ligar a seleção do diff ao mesmo caminho de envio da T5.
3. **Verde:** `npx vitest run src/renderer/src/context/contextBlock.test.ts`.

**Critérios de aceite:** citar um hunk injeta o bloco no prompt do agente ligado; sem terminal ligado, ação indisponível.

**Notas / riscos:** depende de T8 (diff) e T5 (canal citar→agente).

---

### T13 — Menu de contexto com mutação (criar/renomear/mover/excluir)  [P3 · L · Onda 3] — ✅ **ENTREGUE (fecha a Onda 3 da Árvore)**

**Status (2026-07-16):** entregue, com estas decisões além do plano:
- **`pathGuard.assertMutableTarget` resolve symlinks** (a pendência registrada na T4): realpath na
  RAIZ (no macOS ela já vem por symlinks do sistema — /tmp→/private/tmp) e no **PAI** do alvo — a
  folha NÃO é resolvida de propósito (excluir/renomear um symlink que aponta para fora é legítimo:
  a operação age no link, nunca no destino). Symlink no caminho que escapa da raiz é recusado; a
  própria raiz é imutável; pai inexistente falha legível. O `isInsideRoot` lexical mudou-se para
  `pathGuard.ts` (re-exportado do serviço p/ compat do `write`).
- **Excluir = LIXEIRA do sistema, nunca rm** — `shell.trashItem` injetado como dep do serviço
  (`FileTreeServiceDeps.trash`); sem a dep, `remove()` falha legível em vez de degradar para rm.
  Confirmação na UI é a primeira barreira, lixeira é a segunda: clique errado continua recuperável.
- **Renomear e mover são UM gesto** (mesmo syscall): input de caminho RELATIVO à raiz, prefilled.
  `rename` recusa destino existente (o rename POSIX sobrescreveria em SILÊNCIO); `create` recusa
  alvo existente (`wx`/mkdir não-recursivo).
- **Painel sob o header (padrão do menu git da T11), não overlay**: o `CanvasContextMenu` usa
  `position:fixed`, que quebra dentro do nó transformado do React Flow. Botão-direito numa linha =
  agir nela; em área vazia = agir na raiz. Duas etapas sempre; erro do fs LITERAL nos banners da
  T11 (mesmo contrato). Validação-espelho na UI (`fileTreeMutate.ts`: nameError/relTargetError) com
  a autoridade no main.
- Pós-mutação: `refreshFromDisk()` explícito (o watch cobre quase tudo, mas alvo em nível
  não-observado não emite evento) e o preview de arquivo renomeado/excluído (ou contido na pasta
  afetada) é fechado.

**Cobertura:** `pathGuard` (8 casos, incl. symlink-pai-fora × symlink-folha e /tmp symlinkado),
mutações do serviço (10 casos, incl. traversal, sobrescrita recusada e lixeira via spy) e
`fileTreeMutate` (11 casos). Painel/menu `.tsx` = QA manual, como o resto do nó.

**Objetivo:** botão-direito na árvore com operações de arquivo, rompendo o read-only com segurança.

**Arquivos a tocar:**
- `src/main/filetree/FileTreeService.ts` — `create(path)`, `rename(from,to)`, `move(from,to)`, `remove(path)` — **validando que os caminhos estão sob a raiz permitida** e exigindo confirmação (na UI) para excluir.
- `src/main/filetree/FileTreeService.test.ts` — cada operação + rejeição de path fora da raiz (path traversal).
- `registerFileTreeIpc.ts` + `preload/index.ts` — handlers/bridge.
- `src/renderer/src/components/FileTreeNode.tsx` — menu de contexto (padrão do `CanvasContextMenu`).
- `src/main/filetree/pathGuard.ts` **(novo)** + `.test.ts` — `isInsideRoot(root, target)` puro.

**Passos TDD:**
1. **Teste que falha:** `isInsideRoot('/r', '/r/a/b')` → `true`; `isInsideRoot('/r', '/r/../x')` → `false`. Main: `create`/`rename`/`remove` refletem no `list`; operação fora da raiz **rejeita**.
2. **Implementação:** guard de caminho + métodos de mutação + IPC + menu.
3. **Verde:** `npx vitest run src/main/filetree/pathGuard.test.ts src/main/filetree/FileTreeService.test.ts`.

**Critérios de aceite:** criar/renomear/mover/excluir dentro da raiz funciona e atualiza a árvore (via watch da T9); qualquer caminho fora da raiz é recusado; excluir pede confirmação.

**Notas / riscos:** maior superfície de segurança — o `pathGuard` (defesa contra `..`/traversal, análogo ao `isValidProjectId` do `ProjectManager`) é pré-requisito de todas as mutações.

---

## 5. Dependências & riscos

- **Ordem recomendada:** T1 → T2 → T3 (Onda 1, independentes entre si e sem novas deps) antes de qualquer coisa da Onda 2/3.
- **T5/T12** dependem do canal "nó ligado por edge → terminal" (`resolveConnectedTerminal` + `terminalRegistry` + `buildContextBlock`); **T12** também depende do modo Diff (**T8**).
- **CodeMirror** (nova dep pesada) saiu da T4 e é **Onda 3**, junto do modo Diff (**T8**), do git de escrita (**T11**) e do watch (**T9**) — avaliar bundle (`web-perf`) ao encarar aquele bloco. O "abrir na linha" da **T10** fica esperando por ele (o `textarea` da T4 não posiciona cursor por linha); T5 já está destravada pelo `textarea`.
- **T4/T11/T13** rompem o design **read-only** do `FileTreeService`: exigem escrita atômica e **validação de caminho sob a raiz** (`pathGuard`) — risco de segurança se negligenciado (renderer é privilegiado, com `pty.spawn`).
- **Symlinks & cross-platform:** o fix da T1 evita comparar paths absolutos com o toplevel do git; watchers (T9) e paths git no Windows (separadores) precisam de atenção — o app é macOS-primeiro (node-pty), então validar macOS primeiro.
- **Contrato IPC:** T1 muda o shape de `filetree.gitStatus` — atualizar preload/tipos e as 3 asserções do teste existente (listadas na T1) num único passo para não quebrar o suite.
- **React Flow ↔ HTML5 DnD:** T2/T6 misturam `draggable` nativo com o pan/drag do React Flow — validar no `npm run dev` que não há conflito (o `nodrag`/`stopPropagation` isola).

**Verificação por tarefa:** `npx vitest run <arquivo>` (arquivos citados em cada T) + `npm run typecheck` + `npm run lint`. Validação de UX/DnD/editor em `npm run dev`.

---

## 6. Referências

**Origem / análise:**
- `docs/analise-maestri-360/arvore-arquivos.md` — análise 360° e priorização (§6) que ancora este plano.

**Código real verificado:**
- `src/renderer/src/components/FileTreeNode.tsx` — nó explorador; `relativeToRoot` (linhas 27–30) e o comentário do bug (linhas 23–26).
- `src/main/filetree/FileTreeService.ts` — `list`/`read`/`gitStatus` (read-only); alvo do fix e dos novos métodos.
- `src/main/filetree/FileTreeService.test.ts` — padrão de teste com repo git real (regressão da T1).
- `src/main/filetree/registerFileTreeIpc.ts` · `src/preload/index.ts` — IPC/bridge `filetree.*`.
- `src/renderer/src/terminal/dropPaths.ts` (+ `dropPaths.test.ts`) — `quotePathForShell`/`pathsToTerminalInput` (reuso na T2).
- `src/renderer/src/components/TerminalNode.tsx` — `onDragOver`/`onDrop` de arquivos externos → pty.
- `src/renderer/src/terminal/terminalRegistry.ts` — `getTerminalPty(nodeId)` (T5/T12).
- `src/renderer/src/context/contextBlock.ts` — `buildContextBlock`/`htmlToText` (T5/T12).
- `src/renderer/src/components/FileNode.tsx` · `src/renderer/src/store/canvasStore.ts` — clip de arquivo e `addFileNode`/`addFileTreeNode`/`updateFileTreeRoot` (T6/T7).
- `src/main/ide/openInEditor.ts` (+ `registerIdeIpc.ts`, `openInEditor.test.ts`) — abrir no editor externo (T3).
- `src/shared/filetree.ts` — `FileEntry`.

**Verificação empírica (para a T1), executada neste planejamento:**
- `git -C <subdir> status --porcelain` devolve paths **relativos ao toplevel** (`sub/deep/a.txt`), confirmando o descasamento com `relativeToRoot`.
- `git -C <subdir> rev-parse --show-prefix` → `sub/` (o prefixo que faltava); `--show-toplevel` normaliza symlinks (por isso o fix usa `--show-prefix`, relativo).
