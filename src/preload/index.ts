import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { CanvasSnapshot } from '../shared/canvasSnapshot'
import type { CanvasMirror, OrchestrationCommand, PortalState } from '../shared/orchestration'
import type { Project, ProjectIndex } from '../shared/project'
import type { CrossProjectNode } from '../shared/crossProjectIndex'
import type {
  ContentSearchResult,
  FileEntry,
  FileTreeChangedEvent,
  FileTreeWatchResult
} from '../shared/filetree'
import type { RoleSidecar } from '../shared/roleSidecar'
import type { DiscoverResult } from '../shared/discoverRoles'

// PTY-9 (auditoria 2026-07-14): cada TerminalNode registra um listener 'pty:data' no ipcRenderer;
// com muitos terminais no canvas passaríamos do teto default de 10 e o Node emitiria
// MaxListenersExceededWarning (ruído no console, falsa pista em debug). Os listeners são removidos
// corretamente no unmount (não é vazamento) — só precisam de mais folga.
ipcRenderer.setMaxListeners(200)

const api = {
  pty: {
    spawn: (opts: {
      cwd?: string
      cols?: number
      rows?: number
      nodeId?: string
      initialCommand?: string
      // Fase 27 (Task 2): destino SSH opcional — validado e mapeado p/ file:'ssh', args:[host]
      // no main (registerPtyIpc); aqui é só o tipo, o objeto é repassado inteiro via invoke.
      sshHost?: string
    }): Promise<string> => ipcRenderer.invoke('pty:spawn', opts),
    write: (id: string, data: string): void => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id: string): void => ipcRenderer.send('pty:kill', id),
    // Fase 31: re-attach a um pty existente do nó (que sobreviveu a uma troca de projeto) —
    // devolve o ptyId + o scrollback p/ restaurar o xterm, ou null se o nó ainda não tem pty.
    attach: (nodeId: string): Promise<{ ptyId: string; buffer: string } | null> =>
      ipcRenderer.invoke('pty:attach', nodeId),
    // Fase 31: mata o pty de um nó (ao remover o terminal do canvas via ×).
    killForNode: (nodeId: string): void => ipcRenderer.send('pty:killForNode', nodeId),
    onData: (id: string, cb: (data: string) => void): (() => void) => {
      const listener = (_e: unknown, incomingId: string, data: string): void => {
        if (incomingId === id) cb(data)
      }
      ipcRenderer.on('pty:data', listener)
      return () => ipcRenderer.removeListener('pty:data', listener)
    },
    // Onda 2 (T1): exit do pty encaminhado pelo main (registerPtyIpc) — o TerminalNode assina
    // por id para virar o badge SSH em "caiu". Mesmo formato de onData (filtra por id, devolve
    // unsubscribe); o cleanup do useEffect chama o unsubscribe para não vazar listener.
    onExit: (id: string, cb: (exitCode: number) => void): (() => void) => {
      const listener = (_e: unknown, incomingId: string, code: number): void => {
        if (incomingId === id) cb(code)
      }
      ipcRenderer.on('pty:exit', listener)
      return () => ipcRenderer.removeListener('pty:exit', listener)
    }
  },
  persistence: {
    // Fix de corrupção cross-project (2026-07-14): o load devolve snapshot + id do projeto dono
    // num único round-trip atômico — o renderer guarda o id e salva por id explícito
    // (projects.saveCanvas), nunca mais "no projeto ativo do momento da escrita". INT-6: o antigo
    // `save` (canal persistence:save) foi REMOVIDO — era o vetor da corrupção e não tinha mais uso.
    load: (): Promise<{ projectId: string | null; snapshot: CanvasSnapshot | null }> =>
      ipcRenderer.invoke('persistence:load')
  },
  // Fase 15 (Task 2): CRUD de projetos (cada um com seu próprio canvas, ver ProjectManager no
  // main). persistence.load/save acima continuam operando sobre o projeto ATIVO — trocar de
  // projeto é feito via switch(id), que já devolve o canvas do projeto recém-ativado.
  projects: {
    list: (): Promise<ProjectIndex> => ipcRenderer.invoke('projects:list'),
    // Fase 17 (Task 1): cwd opcional — a pasta escolhida via pickDirectory() antes de criar.
    create: (name: string, cwd?: string): Promise<Project> => ipcRenderer.invoke('projects:create', name, cwd),
    switch: (id: string): Promise<CanvasSnapshot | null> => ipcRenderer.invoke('projects:switch', id),
    rename: (id: string, name: string): Promise<void> => ipcRenderer.invoke('projects:rename', id, name),
    remove: (id: string): Promise<{ activeId: string; snapshot: CanvasSnapshot | null }> =>
      ipcRenderer.invoke('projects:remove', id),
    // Fase 15 (Task 3): flush explícito por id (awaitable) — usado por ProjectsSidebar.switchTo
    // para salvar o canvas do projeto que está SAINDO por id, antes de chamar switch(). Ao
    // contrário de persistence.save (fire-and-forget, sempre mira o projeto ativo do momento em
    // que o handler roda), este grava sempre no projeto do `id` passado, então não há dependência
    // de ordem entre o flush e a troca do ativo.
    saveCanvas: (id: string, snapshot: CanvasSnapshot): Promise<void> =>
      ipcRenderer.invoke('projects:saveCanvas', id, snapshot),
    // Fase 17 (Task 1): troca a pasta de um projeto já existente (ex.: botão "pasta" na sidebar).
    setCwd: (id: string, cwd: string): Promise<void> => ipcRenderer.invoke('projects:setCwd', id, cwd),
    // Fase 18 (Task 4): troca o ícone (emoji) de um projeto já existente (seletor inline na
    // sidebar — lista curada + input de texto livre).
    setIcon: (id: string, icon: string): Promise<void> => ipcRenderer.invoke('projects:setIcon', id, icon),
    // Abre o diálogo nativo de escolha de pasta (roda no main) -> path escolhido, ou null se o
    // usuário cancelar. Renderer nunca toca fs/dialog diretamente.
    pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('projects:pickDirectory'),
    // Onda 7: seletor de 1 arquivo (nó de arquivo/clip).
    pickFile: (): Promise<string | null> => ipcRenderer.invoke('projects:pickFile'),
    // Badge da sidebar (2026-07-14): nº de terminais por projeto (id -> count).
    terminalCounts: (): Promise<Record<string, number>> => ipcRenderer.invoke('projects:terminalCounts'),
    // Resiliência T6: "Descarregar" um projeto NÃO-ativo — o main mata os ptys DAQUELE projeto
    // (por id explícito, escopo garantido no ProjectManager) sem tocar índice/ativo/canvas. Ao
    // reabrir o projeto, os terminais re-spawnam: o canvas volta de onde parou, agentes reiniciam.
    hibernate: (id: string): Promise<void> => ipcRenderer.invoke('projects:hibernate', id),
    // Batuta T5: índice READ-ONLY dos nós dos projetos NÃO-ativos, para a command palette buscar
    // além do canvas atual. O main pula o projeto ativo (vem do canvasStore ao vivo).
    crossIndex: (): Promise<CrossProjectNode[]> => ipcRenderer.invoke('projects:crossIndex')
  },
  // Fase 19 (Task 1): árvore de arquivos (canvas file-explorer node) — read-only, delega tudo ao
  // FileTreeService no main (ver registerFileTreeIpc). O renderer nunca importa `fs`/`child_process`
  // diretamente; list/read/gitStatus podem rejeitar (dir/arquivo inexistente etc.) — quem chama trata.
  filetree: {
    list: (dir: string): Promise<FileEntry[]> => ipcRenderer.invoke('filetree:list', dir),
    read: (path: string): Promise<{ content: string; truncated: boolean; binary: boolean }> =>
      ipcRenderer.invoke('filetree:read', path),
    // `prefix`: caminho do `dir` dentro do repo git ('' no toplevel, 'sub/' num subdir); o renderer
    // compõe a chave de `entries` como `prefix + relativoÀRaiz(root, path)` (ver fileTreeGit.ts),
    // pois o git devolve os paths sempre relativos ao TOPLEVEL, não ao `dir` consultado.
    gitStatus: (dir: string): Promise<{ prefix: string; entries: Record<string, string> }> =>
      ipcRenderer.invoke('filetree:gitStatus', dir),
    // Onda 2 (T4): grava `content` em `path` (escrita atômica no main). `root` é a raiz da árvore —
    // o main RECUSA gravar fora dela (isInsideRoot). Pode rejeitar (path fora da raiz, erro de fs).
    write: (path: string, content: string, root: string): Promise<void> =>
      ipcRenderer.invoke('filetree:write', path, content, root),
    // Onda 3 (T8): branch do header + modo Diff — LEITURA pura de git (commit/checkout são T11).
    // Nenhum dos dois rejeita fora de um repo: devolvem vazio ("sem git" não é erro aqui).
    gitBranch: (dir: string): Promise<string> => ipcRenderer.invoke('filetree:gitBranch', dir),
    // `path` opcional limita o diff a um arquivo. `truncated:true` = o diff passou do teto de
    // linhas do main (MAX_DIFF_LINES) e o texto veio cortado.
    gitDiff: (dir: string, path?: string): Promise<{ text: string; truncated: boolean }> =>
      ipcRenderer.invoke('filetree:gitDiff', dir, path),
    // Onda 3 (T10): busca por CONTEÚDO (modo `>`). Varredura recursiva no main com tetos
    // (MAX_SEARCH_RESULTS -> `truncated:true`; binários e .git/node_modules fora). Rejeita se a
    // raiz não existe. O filtro por NOME não passa por aqui — é client-side (fileTreeFilter.ts).
    searchContent: (dir: string, query: string): Promise<ContentSearchResult> =>
      ipcRenderer.invoke('filetree:searchContent', dir, query),
    // Onda 3 (T11): git de ESCRITA — o primeiro caminho da árvore que muta o REPOSITÓRIO do
    // usuário. Ao contrário do gitBranch/gitDiff acima, os três REJEITAM em erro (nada a commitar,
    // nome de branch inválido, checkout com working tree sujo, fora de repo): quem chama PRECISA
    // tratar e mostrar a mensagem — um commit que falha calado faz o usuário achar que salvou.
    //
    // A validação de nome de branch e a defesa de option injection (`--` antes dos posicionais)
    // vivem no MAIN, não aqui: este bridge é conveniência, não fronteira de segurança.
    //
    // O que ENTRA no commit é a semântica do `git commit -a` — tracked modificado/removido + o que
    // já estiver em stage; untracked NÃO entra (ver commitPreview, que é o que a UI confirma).
    // Devolve o SHA do novo HEAD. push/pull/fetch ficam fora (rede/credenciais).
    gitCommit: (dir: string, message: string): Promise<{ head: string }> =>
      ipcRenderer.invoke('filetree:gitCommit', dir, message),
    // Cria a branch apontando p/ o HEAD atual e NÃO troca para ela (o checkout é uma segunda ação,
    // confirmada à parte). Nunca sobrescreve branch existente.
    gitCreateBranch: (dir: string, name: string): Promise<void> =>
      ipcRenderer.invoke('filetree:gitCreateBranch', dir, name),
    // Troca de branch (`git switch` no main). Com working tree sujo o git RECUSA — e nós reportamos
    // o erro em vez de forçar: nada aqui descarta trabalho não commitado.
    gitCheckout: (dir: string, branch: string): Promise<void> =>
      ipcRenderer.invoke('filetree:gitCheckout', dir, branch),
    // Onda 3 (T13): mutação de ARQUIVOS — criar/renomear-mover/excluir, o menu de contexto da
    // árvore. O MAIN valida o alvo sob `root` com SYMLINKS RESOLVIDOS (pathGuard); esta bridge é
    // conveniência, não fronteira de segurança. Todas rejeitam legível: alvo existente (create),
    // destino existente (rename — o rename POSIX sobrescreveria em silêncio), fora da raiz, a
    // própria raiz. `remove` envia para a LIXEIRA do sistema (recuperável) — exclusão definitiva
    // não existe neste canal.
    create: (path: string, root: string, kind: 'file' | 'dir'): Promise<void> =>
      ipcRenderer.invoke('filetree:create', path, root, kind),
    rename: (from: string, to: string, root: string): Promise<void> =>
      ipcRenderer.invoke('filetree:rename', from, to, root),
    remove: (path: string, root: string): Promise<void> =>
      ipcRenderer.invoke('filetree:remove', path, root),
    // Onda 3 (T9): watch de filesystem — a árvore reage ao que os agentes fazem no disco, sem
    // clique em "atualizar". `dirs` é o escopo VISÍVEL (raiz + expandidas, ver watchDirsFor); o main
    // ignora .git/node_modules e coalesce as rajadas.
    //
    // `subscriptionId` é gerado pelo RENDERER (não devolvido pelo main): assim o unwatch do cleanup
    // do React funciona mesmo se o nó desmontar antes deste invoke resolver — id que só existe
    // depois do await seria uma janela em que ninguém pode cancelar o watcher.
    //
    // `projectId`: o projeto exibido AO ASSINAR. Volta carimbado em cada push (escopo de projeto —
    // ver shouldApplyWatchEvent), mesmo contrato do relay de comandos do orq.
    //
    // O retorno diz se o watch PEGOU (ok/watching/errors) — a UI degrada de forma visível quando
    // não pegou, em vez de prometer um auto-refresh que não existe.
    watch: (
      subscriptionId: string,
      dirs: string[],
      projectId: string | null
    ): Promise<FileTreeWatchResult> =>
      ipcRenderer.invoke('filetree:watch', subscriptionId, dirs, projectId),
    unwatch: (subscriptionId: string): Promise<void> =>
      ipcRenderer.invoke('filetree:unwatch', subscriptionId),
    // Push main -> renderer (padrão `ipcRenderer.on` + unsubscribe, igual a orchestration.onCommand
    // e pty.onData). O cleanup do useEffect DEVE chamar o unsubscribe: com vários nós de árvore no
    // canvas, listeners não removidos vazariam (ver setMaxListeners no topo deste arquivo).
    onChanged: (cb: (ev: FileTreeChangedEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: FileTreeChangedEvent): void => cb(ev)
      ipcRenderer.on('filetree:changed', listener)
      return () => ipcRenderer.removeListener('filetree:changed', listener)
    }
  },
  orchestration: {
    sync: (mirror: CanvasMirror): void => ipcRenderer.send('orchestration:sync', mirror),
    // projectId (escopo de projeto, 2026-07-14): projeto ativo no main no momento do relay — o
    // renderer só aplica o comando se ainda estiver exibindo esse projeto (useOrchestrationSync).
    // null/ausente = relay legado, aplicado como antes.
    onCommand: (cb: (cmd: OrchestrationCommand, projectId?: string | null) => void): (() => void) => {
      const listener = (_e: unknown, cmd: OrchestrationCommand, projectId?: string | null): void =>
        cb(cmd, projectId)
      ipcRenderer.on('orchestration:command', listener)
      return () => ipcRenderer.removeListener('orchestration:command', listener)
    }
  },
  // R1 (abrir no editor externo): pede ao main para abrir um caminho (a pasta do projeto ativo) no
  // editor de código instalado, com fallback pro gerenciador de arquivos do SO. Retorna qual editor
  // abriu ({ ok, editor }) — o renderer nunca toca em child_process/shell.
  ide: {
    open: (path: string): Promise<{ ok: boolean; editor?: string }> => ipcRenderer.invoke('ide:open', path)
  },
  // T5 ("Descobrir Responsabilidades"): o renderer não toca em `fs` — pergunta ao main quais papéis
  // existem nos sidecars dos agentes (~/.orkestra/agents/*/role.json, varredura limitada) e manda
  // importar os escolhidos para o registro do usuário (~/.orkestra/roles.json). `discover` devolve
  // cada achado classificado (`new` = importável, `preset` = já existe no app, não duplicar) mais o
  // que já está importado; `import` devolve o registro resultante. O main revalida tudo (a UI é
  // conveniência, não gate).
  roles: {
    discover: (): Promise<DiscoverResult> => ipcRenderer.invoke('roles:discover'),
    import: (chosen: RoleSidecar[]): Promise<RoleSidecar[]> => ipcRenderer.invoke('roles:import', chosen)
  },
  // Fase 9 (Portais): o PortalNode reporta {name,url,title,text} ao main a cada did-finish-load
  // do seu <webview> — o main guarda por nome, servindo de estado para `orq portal snapshot`
  // (GET /portal?name=...). Fire-and-forget: sem retorno/confirmação.
  // T9: `projectId` = o projeto que o renderer exibia ao reportar (hint de escrita; a leitura no
  // main resolve pelo projeto ATIVO) — snapshot/console de um projeto nunca respondem no outro.
  portalState: (state: { name: string; projectId?: string | null } & PortalState): void =>
    ipcRenderer.send('portal:state', state),
  // T8 (console do portal): o PortalNode repassa em batches (throttle no renderer) as linhas de
  // console-message do webview — o main as acumula num ring-buffer por nome (cap no
  // portalConsoleBuffer), servido em GET /portal/console. Fire-and-forget, como o portalState.
  portalConsole: (payload: { name: string; entries: string[]; projectId?: string | null }): void =>
    ipcRenderer.send('portal:console', payload),
  // T1 (round-trip do booleano): canal de VOLTA (renderer -> main) para o resultado de uma ação de
  // portal click/fill. Quando o comando chega com requestId (ver orchestration.onCommand), o
  // renderer roda o script no <webview>, lê o booleano de sucesso e o devolve aqui, correlacionado
  // pelo mesmo requestId — o main resolve a pendência que o servidor aguarda. Send unidirecional
  // (a correlação vive no requestId), espelhando o portalState acima.
  // T7 (screenshot): o MESMO canal carrega opcionalmente a captura ({png: base64, name}) — o main
  // grava o PNG em tmpdir e resolve a pendência com o caminho. Nenhum canal novo por ação.
  portalResult: (requestId: string, ok: boolean, shot?: { png: string; name: string }): void =>
    ipcRenderer.send('portal:result', requestId, ok, shot),
  // Fase 20 (Task 1): watcher de atenção (ver AgentBus no main) — avisa o renderer quando um
  // terminal-agente produziu saída e depois ficou ocioso. onAgentAttention segue o mesmo padrão
  // de assinatura com unsubscribe de orchestration.onCommand acima; clearAgentAttention é
  // fire-and-forget, chamado ao focar o terminal daquele nó (Task 2, renderer).
  // Resiliência T4: export do diagnóstico REDIGIDO (menu "Ajuda → Reportar um Problema" também
  // dispara o mesmo fluxo no main). Grava um JSON local (o usuário escolhe onde); nada é enviado
  // a lugar nenhum. {ok:false} = cancelado ou falha de escrita — nunca um ok sem arquivo.
  diagnostics: {
    export: (): Promise<{ ok: boolean; path?: string }> => ipcRenderer.invoke('diagnostics:export')
  },
  // Resiliência T1: push do menu "Visualizar → Resetar Foco" (view:reset-focus). O renderer solta
  // o xterm/webview que prende o teclado e devolve o foco ao canvas — mesmo padrão de
  // assinatura-com-unsubscribe dos demais pushes.
  view: {
    onResetFocus: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('view:reset-focus', listener)
      return () => ipcRenderer.removeListener('view:reset-focus', listener)
    }
  },
  onAgentAttention: (cb: (nodeId: string) => void): (() => void) => {
    const listener = (_e: unknown, nodeId: string): void => cb(nodeId)
    ipcRenderer.on('agent:attention', listener)
    return () => ipcRenderer.removeListener('agent:attention', listener)
  },
  clearAgentAttention: (nodeId: string): void => ipcRenderer.send('agent:attention:clear', nodeId),
  // Ombro T2: clicar na notificação nativa de "agente ocioso" pede para enquadrar o nó culpado.
  // Mesmo padrão de assinatura-com-unsubscribe de onAgentAttention.
  onAgentFrame: (cb: (nodeId: string) => void): (() => void) => {
    const listener = (_e: unknown, nodeId: string): void => cb(nodeId)
    ipcRenderer.on('agent:frame', listener)
    return () => ipcRenderer.removeListener('agent:frame', listener)
  },
  // Caminho absoluto de um File solto no terminal (drag-drop do Finder). No Electron 33 o
  // File.path foi removido — webUtils.getPathForFile é a forma suportada (resolve no preload,
  // sem o renderer tocar em `fs`). Só resolve Files reais que o usuário arrastou.
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  // Onda 2 (Trilha B): drag-drop de arquivo para um terminal SSH — o renderer só passa (host,
  // localPath); toda a construção de argumentos (mkdir/scp) e a validação anti-injeção
  // (isValidSshHost + sanitização do basename) vivem no main (buildScpDrop/registerSshIpc). O
  // main envia via `scp` (reusando ~/.ssh) e devolve o caminho REMOTO, que o TerminalNode
  // escreve no PTY. Rejeita se o host for inválido ou o scp falhar.
  ssh: {
    scpDrop: (host: string, localPath: string): Promise<string> =>
      ipcRenderer.invoke('ssh:scpDrop', { host, localPath })
  }
}

contextBridge.exposeInMainWorld('orkestra', api)

export type OrkestraApi = typeof api
