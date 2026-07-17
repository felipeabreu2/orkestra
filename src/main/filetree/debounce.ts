// Onda 3 · T9 — util de debounce puro para o watch de filesystem (FileTreeWatcher).
//
// POR QUE existe: um `git checkout`, um `npm install` ou um agente salvando em rajada disparam
// DEZENAS/MILHARES de eventos de fs em milissegundos. Sem coalescência, cada evento viraria um push
// IPC + um re-list + um `git status` no renderer — o canvas derreteria. Aqui a rajada inteira vira
// UMA chamada.
//
// Zero-arg de propósito: o sinal do watcher é "algo mudou nesta assinatura", não "este arquivo
// mudou" — não há argumento para coalescer, e um debounce genérico com args exigiria decidir qual
// chamada vence (o último? todos?), semântica que ninguém aqui precisa. Ver NotificationCoalescer
// (orchestration), que é o precedente do projeto: mesma ideia, mas lá os eventos são ACUMULADOS
// porque o conteúdo de cada um importa; aqui não importa — 1 mudança ou 500 levam ao mesmo trabalho
// (re-listar o visível), então basta o trailing edge.
//
// `maxWaitMs` cobre o caso patológico do debounce puro: numa tempestade CONTÍNUA (build rodando por
// 60s, tocando arquivos sem parar) o trailing edge nunca chega e a árvore ficaria congelada até o
// fim — o oposto do objetivo da tarefa. Com maxWait, garantimos ao menos um refresh a cada janela,
// mesmo com a rajada em andamento.
export interface Debounced {
  (): void
  // Cancela um disparo pendente e zera a janela. Obrigatório no unwatch/dispose: sem isto, um flush
  // tardio emitiria um evento para uma assinatura que já morreu (vazamento de timer + push fantasma).
  cancel(): void
}

// `waitMs <= 0` = passthrough (dispara na hora) — o modo "desligado", que não mascara bugs de
// disparo. Mesma escolha do NotificationCoalescer (windowMs=0).
// `maxWaitMs <= 0` (padrão) = sem teto: debounce trailing clássico.
export function debounce(fn: () => void, waitMs: number, maxWaitMs = 0): Debounced {
  let timer: ReturnType<typeof setTimeout> | null = null
  // Início da rajada ATUAL (a primeira chamada desde o último disparo) — âncora do maxWait.
  let burstStartedAt = 0

  const run = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    burstStartedAt = 0
    fn()
  }

  const debounced = (): void => {
    if (waitMs <= 0) {
      run()
      return
    }
    const now = Date.now()
    if (timer === null) burstStartedAt = now
    else clearTimeout(timer)
    let wait = waitMs
    if (maxWaitMs > 0) {
      // Nunca esperar além de maxWaitMs contados do início da rajada. Math.max(0, …) porque um
      // timer atrasado (event loop ocupado) pode nos trazer aqui já depois do teto.
      wait = Math.min(waitMs, Math.max(0, maxWaitMs - (now - burstStartedAt)))
    }
    timer = setTimeout(run, wait)
  }

  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    burstStartedAt = 0
  }

  return debounced
}
