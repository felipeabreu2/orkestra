import { watch, type FSWatcher } from 'node:fs'
import { debounce, type Debounced } from './debounce'
import { filterWatchDirs, isIgnoredName } from './watchFilters'
import type { FileTreeChangedEvent, FileTreeWatchResult } from '../../shared/filetree'

export type { FileTreeChangedEvent, FileTreeWatchResult }

// Onda 3 · T9 — watch de filesystem com auto-refresh da árvore.
//
// POR QUE: este canvas é um lugar onde AGENTES editam arquivos o tempo todo. Sem watch, a árvore
// mostra um retrato velho enquanto o agente trabalha e o usuário só descobre clicando em atualizar.
//
// ESCOPO: observamos só os diretórios que o renderer diz estar VISÍVEIS (raiz + pastas expandidas),
// NÃO a árvore inteira, e cada um de forma NÃO-recursiva. Três razões, nesta ordem:
//  1. Custo: um watcher por diretório visível é um punhado de FDs; `recursive:true` num repo grande
//     é caro e traria eventos de coisas que a UI nem mostra.
//  2. Portabilidade: `fs.watch({recursive:true})` só é suportado em macOS/Windows (e Linux ≥ 20.13).
//     O app é macOS-primeiro, mas não vale pagar uma quebra gratuita em Linux por conveniência.
//  3. Honestidade: o que não está visível não pode estar "desatualizado na tela".
// Custo assumido: mudança numa pasta COLAPSADA não dispara refresh — ela não está sendo exibida, e
// ao expandi-la o `filetree:list` roda na hora e traz o estado fresco.
//
// COALESCÊNCIA: ver debounce.ts. Uma rajada (checkout/build/agente salvando em série) vira UM push.
//
// FALSO POSITIVO CONHECIDO E ACEITO — "priming" (medido em macOS/node 24 durante esta tarefa):
// iniciar um fs.watch emite, SEM nenhuma atividade de filesystem, uma rajada com 1 evento nomeando o
// próprio diretório observado + 1 por entrada já existente nele. Node não oferece como distinguir
// isso de mudanças reais (mesmo eventType 'rename', mesmos nomes), e as duas alternativas são piores:
// filtrar por nome não funciona (a rajada inclui os nomes reais das entradas) e ignorar eventos numa
// "janela de priming" por tempo faria a gente ENGOLIR uma mudança real que caísse nessa janela — uma
// falha silenciosa, exatamente o que esta tarefa proíbe. Então aceitamos: cada watch() custa um
// refresh redundante logo após assinar. Um refresh a mais é idempotente e invisível (a árvore acabou
// de carregar os mesmos dados); um refresh a MENOS seria o bug. Consequência prática: expandir uma
// pasta (que reassina o watch com o conjunto novo de dirs) também gera um refresh redundante.
//
// FALHA NÃO É SILENCIOSA: `watch()` devolve o que conseguiu observar E os erros; um watcher que
// morre depois (limite de FDs, pasta apagada, permissão) emite um evento kind:'error'. Fingir que
// estamos observando quando não estamos seria a pior falha possível aqui — a árvore pareceria
// "atualizada" e estaria congelada.
//
// ESCOPO DE PROJETO: cada assinatura carrega o projectId que o renderer exibia ao assinar, e todo
// push volta carimbado. É o mesmo contrato do relay de comandos do orq (ver
// `mainWindow.webContents.send('orchestration:command', cmd, resolveActiveProjectId())` em
// main/index.ts + a checagem em useOrchestrationSync): o consumidor descarta o que não for do
// projeto que ele está exibindo AGORA. Sem isto, um watcher do projeto A sobrevivendo alguns ms a
// uma troca de projeto atualizaria o canvas do projeto B — precisamente a classe de bug do
// incidente de corrupção cross-project.

// Janela de coalescência. 250ms: abaixo do limiar em que uma atualização parece "atrasada" para o
// olho, e acima da duração típica da rajada de um save/checkout — o suficiente para a rajada inteira
// virar um push.
export const DEFAULT_WATCH_DEBOUNCE_MS = 250
// Teto anti-fome: numa tempestade CONTÍNUA (build tocando arquivos por minutos) o trailing puro
// nunca dispararia e a árvore ficaria congelada — o oposto do objetivo. 2s garante progresso visível
// sem transformar o refresh em loop.
export const DEFAULT_WATCH_MAX_WAIT_MS = 2000

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Este watcher ainda segura um recurso do SO? Perguntamos ao NODE (`_handle`, que o node preenche
// ao abrir e zera no close()), não à nossa contabilidade.
//
// A distinção não é purismo, é o teste inteiro: um contador que olhasse só os nossos arrays daria
// "0 watchers" mesmo que esquecêssemos o close() — verde de mentira, com file descriptors vazando
// para o mundo real. Verificado por mutação: com a versão antiga (contando o array), remover o
// close() não quebrava NENHUM teste. Com esta, quebra.
//
// `_handle` é interno do node (sem API pública equivalente). O risco de ele sumir numa versão futura
// é coberto pelos próprios testes, que afirmam contagem 1 com watcher ABERTO e 0 depois de fechado:
// se o campo mudar, eles falham alto (viram 0 no caso aberto) em vez de mentir em silêncio.
function isOpenWatcher(w: FSWatcher): boolean {
  return (w as unknown as { _handle?: unknown })._handle != null
}

interface Subscription {
  watchers: FSWatcher[]
  projectId: string | null
  notify: Debounced
}

export class FileTreeWatcher {
  private readonly subs = new Map<string, Subscription>()
  // Todos os fs.watch que já criamos — inclusive os que deveriam ter sido fechados. É a base do
  // activeWatcherCount(): rastrear só o que está "na contabilidade" tornaria um close() esquecido
  // invisível. Auto-limpa (ver activeWatcherCount), então não vira um leak de memória por si.
  private readonly created = new Set<FSWatcher>()

  constructor(
    private readonly emit: (ev: FileTreeChangedEvent) => void,
    private readonly debounceMs: number = DEFAULT_WATCH_DEBOUNCE_MS,
    private readonly maxWaitMs: number = DEFAULT_WATCH_MAX_WAIT_MS
  ) {}

  // (Re)assina `subscriptionId` aos diretórios `dirs`. IDEMPOTENTE POR ID: uma assinatura anterior
  // com o mesmo id é encerrada antes — é assim que trocar a raiz da árvore (ou expandir/colapsar
  // uma pasta) não vaza os watchers antigos. O id é gerado pelo renderer (não devolvido daqui) de
  // propósito: o unwatch do cleanup do React precisa funcionar mesmo se o desmonte acontecer antes
  // desta chamada terminar.
  watch(subscriptionId: string, dirs: readonly string[], projectId: string | null): FileTreeWatchResult {
    this.unwatch(subscriptionId)

    const targets = filterWatchDirs(dirs)
    const errors: string[] = []
    if (targets.length === 0) {
      // Ou não pediram nada, ou tudo caiu no ignore (raiz dentro de node_modules/.git). Não é um
      // crash, mas TAMBÉM não é "observando" — dizer ok:true aqui seria a mentira que a tarefa proíbe.
      errors.push(
        dirs.length === 0
          ? 'nenhum diretório para observar'
          : 'nenhum diretório observável (.git/node_modules são ignorados)'
      )
      return { ok: false, watching: 0, errors }
    }

    const sub: Subscription = {
      watchers: [],
      projectId,
      notify: debounce(
        () => {
          // Guarda contra flush tardio: se esta assinatura já foi substituída/encerrada entre o
          // agendamento e o disparo, não emitimos por ela. (O cancel() do unwatch já cobre o caso
          // normal; isto é o cinto além do suspensório.)
          if (this.subs.get(subscriptionId) !== sub) return
          this.emit({ subscriptionId, projectId, kind: 'changed' })
        },
        this.debounceMs,
        this.maxWaitMs
      )
    }

    for (const dir of targets) {
      try {
        // `persistent: false`: um watcher NÃO deve segurar o event loop vivo. Sem isto, um watcher
        // vazado impediria o processo de encerrar (e penduraria a suíte de testes).
        // Não-recursivo: ver a decisão de escopo no topo do arquivo.
        const w = watch(dir, { persistent: false }, (_event, filename) => {
          // O nome pode vir null (o SO não soube dizer QUEM mudou) — nesse caso não dá para filtrar
          // e tratamos como mudança de verdade: perder um refresh é pior que um refresh a mais.
          if (typeof filename === 'string' && isIgnoredName(filename)) return
          sub.notify()
        })
        w.on('error', (err) => {
          // Um watcher pode morrer sozinho (pasta removida, EMFILE, permissão). Fechamos o cadáver,
          // tiramos da lista e AVISAMOS: a partir daqui a árvore pode ficar velha sem que o usuário
          // perceba, e é dele a decisão de clicar em atualizar.
          try {
            w.close()
          } catch {
            /* já morto: fechar de novo não é erro que importe */
          }
          sub.watchers = sub.watchers.filter((x) => x !== w)
          if (this.subs.get(subscriptionId) !== sub) return
          this.emit({
            subscriptionId,
            projectId,
            kind: 'error',
            message: `watch interrompido em ${dir}: ${errorMessage(err)}`
          })
        })
        sub.watchers.push(w)
        this.created.add(w)
      } catch (err) {
        // Falha SÍNCRONA (dir inexistente, sem permissão): segue para os outros diretórios — um
        // watch parcial ainda vale, desde que o `ok:false` conte a verdade.
        errors.push(`${dir}: ${errorMessage(err)}`)
      }
    }

    if (sub.watchers.length === 0) {
      sub.notify.cancel()
      return { ok: false, watching: 0, errors }
    }
    this.subs.set(subscriptionId, sub)
    return { ok: errors.length === 0, watching: sub.watchers.length, errors }
  }

  // Encerra a assinatura: fecha TODOS os fs.watch e cancela o disparo pendente. Chamado no unmount
  // do nó, na troca de raiz (via watch(), que reassina) e no closeAll(). Não vazar aqui é o ponto
  // inteiro: fs.watch vazado é um FD vazado — invisível até a sessão longa em que o processo bate
  // no EMFILE.
  unwatch(subscriptionId: string): void {
    const sub = this.subs.get(subscriptionId)
    if (!sub) return
    this.subs.delete(subscriptionId)
    sub.notify.cancel()
    for (const w of sub.watchers) {
      try {
        w.close()
      } catch {
        /* best-effort: um watcher já morto não impede fechar os outros */
      }
    }
    sub.watchers = []
  }

  // Encerra TUDO — chamado no before-quit do app. Sem isto, sair com a árvore aberta deixaria
  // watchers vivos até o processo morrer (o SO limparia, mas é lixo nosso).
  closeAll(): void {
    for (const id of [...this.subs.keys()]) this.unwatch(id)
  }

  // Introspecção de RECURSO: quantos fs.watch ainda seguram um handle do SO AGORA — perguntando ao
  // node (isOpenWatcher), não à nossa contabilidade.
  //
  // Existe para que "o watcher parou de verdade" seja verificável de forma DETERMINÍSTICA (== 0),
  // sem depender de esperar um evento que talvez nunca venha: um teste de vazamento baseado em
  // timing não prova nada. E, por olhar o handle real, ele quebra se alguém remover um close() —
  // que é exatamente o bug que ele existe para pegar.
  //
  // Efeito colateral proposital: descarta do rastreamento os que já fecharam (o Set não cresce sem
  // limite ao longo de uma sessão longa de expandir/colapsar).
  activeWatcherCount(): number {
    let total = 0
    for (const w of this.created) {
      if (isOpenWatcher(w)) total++
      else this.created.delete(w)
    }
    return total
  }
}
