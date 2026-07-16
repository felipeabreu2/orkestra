import type { IpcMain } from 'electron'
import type { FileTreeService } from './FileTreeService'
import type { FileTreeWatcher } from './FileTreeWatcher'

// Fase 19 (Task 1): árvore de arquivos (canvas file-explorer node). list/read/gitStatus são só
// leitura; `write` (Onda 2 · T4) é a PRIMEIRA mutação — grava um arquivo de forma atômica e valida
// no MAIN que o caminho está sob a raiz da árvore (svc.write -> isInsideRoot). Cada handler delega
// 1:1 ao serviço; erros (dir/arquivo inexistente, escrita fora da raiz etc.) não são tratados aqui —
// propagam como rejeição do invoke(), que o renderer trata (mostra o erro na UI do editor/árvore).
//
// Onda 3 · T9: `watch`/`unwatch` do FileTreeWatcher. O `watcher` é OBRIGATÓRIO de propósito — um
// parâmetro opcional deixaria o app subir sem auto-refresh e sem ninguém perceber, que é a falha
// silenciosa que esta tarefa proíbe.
export function registerFileTreeIpc(
  ipcMain: IpcMain,
  svc: FileTreeService,
  watcher: FileTreeWatcher
): void {
  ipcMain.handle('filetree:list', (_e, dir: string) => svc.list(dir))
  ipcMain.handle('filetree:read', (_e, path: string) => svc.read(path))
  ipcMain.handle('filetree:gitStatus', (_e, dir: string) => svc.gitStatus(dir))
  ipcMain.handle('filetree:write', (_e, path: string, content: string, root: string) =>
    svc.write(path, content, root)
  )
  // Onda 3 · T8: branch no header + modo Diff. Leitura pura (nada aqui muta o repo) — nenhum dos
  // dois rejeita fora de repo, devolvem vazio.
  ipcMain.handle('filetree:gitBranch', (_e, dir: string) => svc.gitBranch(dir))
  ipcMain.handle('filetree:gitDiff', (_e, dir: string, path?: string) => svc.gitDiff(dir, path))
  // Onda 3 · T10: busca por conteúdo (modo `>` do campo de busca). Leitura pura, com tetos no
  // serviço (resultados/bytes por arquivo) e .git/node_modules fora. Raiz inexistente rejeita
  // (mesmo contrato do list); o filtro por NOME nem passa por aqui (é client-side no renderer).
  ipcMain.handle('filetree:searchContent', (_e, dir: string, query: string) =>
    svc.searchContent(dir, query)
  )

  // Onda 3 · T11 — git de ESCRITA (muta o REPOSITÓRIO do usuário). Ao contrário do gitBranch/
  // gitDiff acima, estes REJEITAM em erro (nada staged, nome de branch inválido, checkout com
  // working tree sujo, fora de repo) em vez de devolver vazio: para exibir uma árvore "sem git" não
  // é erro, para commitar é. A rejeição do invoke() chega ao renderer, que mostra a mensagem — um
  // commit que falha em silêncio faria o usuário achar que o trabalho está salvo quando não está.
  // A confirmação (e o que entra no commit) é decidida no renderer ANTES de chamar isto; validação
  // de nome de branch e defesa de option injection são no MAIN (svc), nunca só na UI.
  ipcMain.handle('filetree:gitCommit', (_e, dir: string, message: string) =>
    svc.gitCommit(dir, message)
  )
  ipcMain.handle('filetree:gitCreateBranch', (_e, dir: string, name: string) =>
    svc.gitCreateBranch(dir, name)
  )
  ipcMain.handle('filetree:gitCheckout', (_e, dir: string, branch: string) =>
    svc.gitCheckout(dir, branch)
  )

  // Onda 3 · T9 — watch de filesystem.
  //
  // `subscriptionId` vem do RENDERER (não é gerado aqui e devolvido) de propósito: o unwatch do
  // cleanup do React precisa funcionar mesmo se o nó desmontar antes do invoke() resolver. Se o id
  // nascesse aqui, existiria uma janela em que o renderer não teria como cancelar o que pediu — e
  // watcher sem quem o cancele é vazamento.
  //
  // O resultado (ok/watching/errors) VOLTA para o renderer, que degrada de forma visível quando o
  // watch não pegou: dizer "assinado" sem observar nada seria mentir que a árvore está viva.
  ipcMain.handle(
    'filetree:watch',
    (_e, subscriptionId: string, dirs: string[], projectId: string | null) =>
      watcher.watch(subscriptionId, dirs, projectId)
  )
  // `handle` (e não `on`) mesmo sendo void: mantém o contrato uniforme com o resto do `filetree:*`
  // e deixa o encerramento testável pelo mesmo fake de ipcMain dos outros handlers.
  ipcMain.handle('filetree:unwatch', (_e, subscriptionId: string) => watcher.unwatch(subscriptionId))
}
