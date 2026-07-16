// Fase 19 (Task 1): tipos da árvore de arquivos do canvas (file-explorer node). Espelha o que
// FileTreeService.list() devolve no main; consumido pelo renderer (Task 2) via
// window.orkestra.filetree.list(). Sem dependência de fs/electron — puro cross-process.
export interface FileEntry {
  name: string
  path: string
  isDir: boolean
}

// Onda 3 · T9 (watch de filesystem): contrato do push main -> renderer. Vive aqui, e não no
// FileTreeWatcher, porque atravessa os TRÊS lados (main emite, preload tipa a ponte, renderer
// consome) — mesmo motivo de FileEntry.
export interface FileTreeChangedEvent {
  // Assinatura que originou o evento (1 por FileTreeNode). O renderer descarta o que não for da
  // assinatura viva dele.
  subscriptionId: string
  // Projeto que o renderer exibia quando assinou; null = sem escopo conhecido (boot/legado).
  // O consumidor descarta o que não for do projeto que está exibindo AGORA — mesmo contrato do
  // relay de comandos do orq (ver useOrchestrationSync).
  projectId: string | null
  // 'changed' = re-liste o visível. 'error' = o watch DEGRADOU (ver `message`): o auto-refresh não é
  // mais confiável e a UI precisa dizer isso em vez de fingir que está observando.
  kind: 'changed' | 'error'
  message?: string
}

// Resultado de assinar o watch. `ok:false` = nem tudo que foi pedido está sob observação (ver
// `errors`); a UI deve degradar de forma VISÍVEL em vez de prometer auto-refresh.
export interface FileTreeWatchResult {
  ok: boolean
  // Quantos diretórios estão de fato sob watch. 0 = não observamos NADA.
  watching: number
  errors: string[]
}
