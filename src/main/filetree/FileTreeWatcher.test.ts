import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileTreeWatcher, type FileTreeChangedEvent } from './FileTreeWatcher'

// FILESYSTEM REAL, de propósito: um mock de fs.watch testaria o nosso mock, não a semântica do SO —
// que é o risco inteiro desta tarefa. Segue o padrão de FileTreeService.test.ts (dir/repo real).
//
// TIMING (o motivo de este bloco existir): eventos de fs são assíncronos e o SO decide quando
// entregá-los, então nenhuma afirmação aqui depende de "dormir o suficiente e torcer":
//  - Afirmações POSITIVAS esperam por CONDIÇÃO com deadline (waitFor): passam assim que o evento
//    chega, e só falham se ele NUNCA vier.
//  - Afirmações NEGATIVAS ("parou de emitir") têm como prova PRINCIPAL um invariante síncrono e
//    determinístico — activeWatcherCount() === 0, isto é, não existe watcher que POSSA emitir. A
//    espera por silêncio é confirmação comportamental, com folga generosa (um vazamento dispararia
//    muito antes).
//  - O transiente de PRIMING (ver settle()) é decantado antes de medir, nunca ignorado por sorte.

const DEBOUNCE_MS = 200
const MAX_WAIT_MS = 1000
// Folga do "ficou quieto": > DEBOUNCE_MS, e MUITO acima da latência real medida de entrega de
// eventos do fs no macOS (rajada de 20 escritas se espalhou por ~56ms).
const QUIET_MS = 500

describe('FileTreeWatcher', () => {
  let dir: string
  let events: FileTreeChangedEvent[]
  let watcher: FileTreeWatcher

  async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!cond()) {
      if (Date.now() > deadline) {
        throw new Error(`timeout esperando a condição do watch (eventos: ${JSON.stringify(events)})`)
      }
      await new Promise((r) => setTimeout(r, 5))
    }
  }

  async function quiet(ms = QUIET_MS): Promise<void> {
    await new Promise((r) => setTimeout(r, ms))
  }

  // Espera a condição, mas SEGUE EM FRENTE se ela não vier (não falha). Usado só no settle(): a
  // ausência de priming não é erro — é uma plataforma que não o emite.
  async function waitForOrProceed(cond: () => boolean, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!cond() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5))
  }

  // Decanta o PRIMING e zera o buffer, para que ele não contamine a medição do evento que o teste
  // realmente quer observar. MEDIDO (macOS/node 24): iniciar um fs.watch emite, sem NENHUMA
  // atividade de filesystem, uma rajada nomeando o próprio dir + cada entrada existente. A produção
  // aceita esse refresh redundante de propósito (ver FileTreeWatcher).
  //
  // POR QUE ESPERAR PELO PRIMING EM VEZ DE DORMIR UM TANTO: a primeira versão deste helper só
  // dormia QUIET_MS, apostando que o priming caberia na janela. Isso produziu um flake REAL
  // (~1 em 25 execuções, rastreado até aqui): a latência de entrega do priming não tem teto e, sob
  // carga, ele chegava DEPOIS da janela — o buffer era limpo antes da hora e o push do priming
  // aparecia no meio da medição, reprovando um teste de código correto. Agora esperamos o priming
  // ACONTECER (condição, não relógio) e só então damos o quiet, que absorve o resto da rajada (o
  // priming é uma rajada só, então vira um único push coalescido).
  //
  // O teto existe para portabilidade, não para timing: plataformas cujo fs.watch não emite priming
  // simplesmente seguem em frente — daí `waitForOrProceed` e não `waitFor`.
  async function settle(): Promise<void> {
    await waitForOrProceed(() => events.length > 0, 2000)
    await quiet()
    events.length = 0
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ork-watch-'))
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'README.md'), '# hi\n')
    events = []
    watcher = new FileTreeWatcher((ev) => events.push(ev), DEBOUNCE_MS, MAX_WAIT_MS)
  })
  afterEach(() => {
    watcher.closeAll()
    rmSync(dir, { recursive: true, force: true })
  })

  // ————— AUTO-REFRESH: o que a tarefa promete —————

  it('emite changed quando um arquivo do dir observado muda', async () => {
    const r = watcher.watch('s1', [dir], 'proj-a')
    expect(r).toMatchObject({ ok: true, watching: 1 })
    await settle()

    writeFileSync(join(dir, 'README.md'), '# mudou\n')

    await waitFor(() => events.length > 0)
    expect(events[0]).toMatchObject({ subscriptionId: 's1', projectId: 'proj-a', kind: 'changed' })
  })

  it('emite changed quando um arquivo NOVO aparece (agente criando arquivo)', async () => {
    watcher.watch('s1', [dir], 'proj-a')
    await settle()

    writeFileSync(join(dir, 'novo.ts'), 'export const x = 1\n')

    await waitFor(() => events.some((e) => e.kind === 'changed'))
  })

  it('emite changed quando um arquivo e APAGADO', async () => {
    watcher.watch('s1', [dir], null)
    await settle()

    unlinkSync(join(dir, 'README.md'))

    await waitFor(() => events.some((e) => e.kind === 'changed'))
  })

  it('observa tambem as pastas expandidas, nao so a raiz', async () => {
    // Watch NÃO-recursivo: uma mudança em `src/` só é vista porque `src` foi pedido explicitamente
    // (o renderer manda raiz + expandidas). É a decisão de escopo da tarefa, e este teste é o que a
    // sustenta — se alguém trocar por watch só-da-raiz, isto quebra.
    const r = watcher.watch('s1', [dir, join(dir, 'src')], null)
    expect(r.watching).toBe(2)
    await settle()

    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1\n')

    await waitFor(() => events.some((e) => e.kind === 'changed'))
  })

  it('coalesce uma rajada de escritas num unico push', async () => {
    watcher.watch('s1', [dir], null)
    await settle()

    // Rajada: 20 arquivos em ms. Sem coalescência seriam ~20 pushes IPC, 20 re-lists e 20
    // `git status` no renderer — é este teste que impede a regressão que derrete o canvas.
    for (let i = 0; i < 20; i++) writeFileSync(join(dir, `f${i}.txt`), String(i))

    await waitFor(() => events.length > 0)
    await quiet() // deixa qualquer push atrasado chegar ANTES de contar
    expect(events.filter((e) => e.kind === 'changed').length).toBe(1)
  })

  // ————— VAZAMENTO DE WATCHER: o risco central da tarefa —————

  it('unwatch FECHA os watchers e para de emitir', async () => {
    watcher.watch('s1', [dir, join(dir, 'src')], null)
    expect(watcher.activeWatcherCount()).toBe(2)
    await settle()

    watcher.unwatch('s1')

    // Prova determinística: não sobrou NENHUM fs.watch aberto. Não é "não observei um evento", é
    // "não existe mais quem observe" — que é o que "o watcher para de verdade" significa.
    expect(watcher.activeWatcherCount()).toBe(0)

    writeFileSync(join(dir, 'README.md'), '# depois do unwatch\n')
    writeFileSync(join(dir, 'src', 'a.ts'), 'depois\n')
    await quiet()
    expect(events).toEqual([])
  })

  it('unwatch cancela um push JA agendado (nada de flush tardio de assinatura morta)', async () => {
    watcher.watch('s1', [dir], null)
    await settle()
    writeFileSync(join(dir, 'README.md'), '# dentro da janela do debounce\n')

    // Desassina DENTRO da janela de coalescência: o evento do fs já pode ter chegado e agendado o
    // push. Um push que chegasse depois disto seria um evento de uma assinatura que não existe mais.
    watcher.unwatch('s1')

    await quiet()
    expect(events).toEqual([])
  })

  it('trocar a RAIZ (reassinar o mesmo id) fecha os watchers da raiz antiga', async () => {
    const outro = mkdtempSync(join(tmpdir(), 'ork-watch2-'))
    try {
      watcher.watch('s1', [dir], null)
      expect(watcher.activeWatcherCount()).toBe(1)

      watcher.watch('s1', [outro], null) // mesma assinatura, raiz nova

      // Continua 1 (o novo), não 2: o antigo foi fechado. Se acumulasse, cada troca de pasta
      // vazaria um FD — o vazamento silencioso que só aparece na sessão longa.
      expect(watcher.activeWatcherCount()).toBe(1)
      await settle()

      writeFileSync(join(dir, 'README.md'), '# raiz antiga\n')
      await quiet()
      expect(events).toEqual([]) // a raiz ANTIGA não fala mais

      writeFileSync(join(outro, 'novo.txt'), 'x\n')
      await waitFor(() => events.some((e) => e.kind === 'changed')) // a nova fala
    } finally {
      rmSync(outro, { recursive: true, force: true })
    }
  })

  it('closeAll encerra TODAS as assinaturas (saida do app)', async () => {
    const outro = mkdtempSync(join(tmpdir(), 'ork-watch3-'))
    try {
      watcher.watch('s1', [dir], 'proj-a')
      watcher.watch('s2', [outro], 'proj-b')
      expect(watcher.activeWatcherCount()).toBe(2)
      await settle()

      watcher.closeAll()

      expect(watcher.activeWatcherCount()).toBe(0)
      writeFileSync(join(dir, 'README.md'), '# depois do closeAll\n')
      writeFileSync(join(outro, 'a.txt'), 'x\n')
      await quiet()
      expect(events).toEqual([])
    } finally {
      rmSync(outro, { recursive: true, force: true })
    }
  })

  it('assinaturas sao independentes: encerrar uma nao afeta a outra (2 arvores no canvas)', async () => {
    const outro = mkdtempSync(join(tmpdir(), 'ork-watch4-'))
    try {
      watcher.watch('s1', [dir], 'proj-a')
      watcher.watch('s2', [outro], 'proj-a')
      await settle()

      watcher.unwatch('s1')
      expect(watcher.activeWatcherCount()).toBe(1)

      writeFileSync(join(outro, 'a.txt'), 'x\n')
      await waitFor(() => events.some((e) => e.subscriptionId === 's2'))
      expect(events.some((e) => e.subscriptionId === 's1')).toBe(false)
    } finally {
      rmSync(outro, { recursive: true, force: true })
    }
  })

  // ————— ESCOPO DE PROJETO —————

  it('carimba o projectId da assinatura em cada push (escopo de projeto)', async () => {
    watcher.watch('s1', [dir], 'proj-a')
    await settle()

    writeFileSync(join(dir, 'README.md'), '# x\n')

    await waitFor(() => events.length > 0)
    // O carimbo é o que permite ao renderer descartar um push do projeto A quando já está exibindo
    // o B — mesmo contrato do relay de comandos do orq (ver useOrchestrationSync).
    expect(events.every((e) => e.projectId === 'proj-a')).toBe(true)
  })

  it('assinaturas de projetos diferentes nao se misturam', async () => {
    const outro = mkdtempSync(join(tmpdir(), 'ork-watch5-'))
    try {
      watcher.watch('s1', [dir], 'proj-a')
      watcher.watch('s2', [outro], 'proj-b')
      await settle()

      writeFileSync(join(outro, 'a.txt'), 'x\n')

      await waitFor(() => events.length > 0)
      await quiet()
      // Só o projeto B fala; nada carimbado 'proj-a' aparece por causa de uma mudança em B.
      expect(events.every((e) => e.projectId === 'proj-b' && e.subscriptionId === 's2')).toBe(true)
    } finally {
      rmSync(outro, { recursive: true, force: true })
    }
  })

  // ————— IGNORES —————

  it('NAO observa .git nem node_modules mesmo se pedirem explicitamente', () => {
    const r = watcher.watch('s1', [dir, join(dir, '.git'), join(dir, 'node_modules')], null)

    expect(r.watching).toBe(1) // só a raiz
    expect(watcher.activeWatcherCount()).toBe(1)
  })

  it('churn de .git e de node_modules nao acorda o watch da raiz', async () => {
    mkdirSync(join(dir, '.git'))
    mkdirSync(join(dir, 'node_modules'))
    watcher.watch('s1', [dir], null)
    await settle()

    // Imita o que o git de fato faz (index.lock criado -> renomeado -> apagado) e o que um
    // `npm install` faz. É a tempestade que a tarefa manda evitar: se isto virasse refresh, o canvas
    // entraria em looping sozinho a cada comando de agente.
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(dir, '.git', 'index.lock'), String(i))
      renameSync(join(dir, '.git', 'index.lock'), join(dir, '.git', 'index'))
      writeFileSync(join(dir, '.git', 'ORIG_HEAD'), String(i))
      unlinkSync(join(dir, '.git', 'ORIG_HEAD'))
      mkdirSync(join(dir, 'node_modules', `pkg${i}`))
      writeFileSync(join(dir, 'node_modules', `pkg${i}`, 'index.js'), 'x')
    }

    await quiet()
    expect(events).toEqual([])
  })

  it('o tmp da nossa propria escrita atomica (.orktmp) nao acorda o watch', async () => {
    watcher.watch('s1', [dir], null)
    await settle()

    // FileTreeService.write grava `<alvo>.orktmp` antes do rename. Este é um evento DIRETO no dir
    // observado (o SO reporta), então sem o filtro por nome todo save do editor embutido geraria
    // ruído do nosso próprio lixo.
    writeFileSync(join(dir, 'README.md.orktmp'), 'x\n')

    await quiet()
    expect(events).toEqual([])
  })

  it('watch de uma raiz DENTRO de node_modules devolve ok:false e nao finge observar', () => {
    const r = watcher.watch('s1', [join(dir, 'node_modules', 'foo')], null)

    expect(r.ok).toBe(false)
    expect(r.watching).toBe(0)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(watcher.activeWatcherCount()).toBe(0)
  })

  // ————— FALHA NÃO SILENCIOSA —————

  it('dir inexistente: ok:false com o erro, sem assinatura fantasma', () => {
    const r = watcher.watch('s1', [join(dir, 'nao-existe')], null)

    // Se devolvêssemos ok:true, a UI prometeria auto-refresh e a árvore congelaria em silêncio —
    // exatamente a falha silenciosa que a tarefa proíbe.
    expect(r.ok).toBe(false)
    expect(r.watching).toBe(0)
    expect(r.errors.join(' ')).toContain('nao-existe')
    expect(watcher.activeWatcherCount()).toBe(0)
  })

  it('watch PARCIAL (um dir bom, um ruim): observa o bom mas reporta ok:false', async () => {
    const r = watcher.watch('s1', [dir, join(dir, 'nao-existe')], null)

    expect(r.watching).toBe(1)
    expect(r.ok).toBe(false) // parcial é degradado, e o usuário merece saber
    expect(r.errors.length).toBe(1)
    await settle()

    // ...e o que sobrou continua funcionando: degradação, não desistência.
    writeFileSync(join(dir, 'README.md'), '# x\n')
    await waitFor(() => events.some((e) => e.kind === 'changed'))
  })

  it('watch sem nenhum dir devolve ok:false (nao ha o que observar)', () => {
    const r = watcher.watch('s1', [], 'proj-a')

    expect(r).toMatchObject({ ok: false, watching: 0 })
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('unwatch de um id desconhecido e no-op (o cleanup do React pode chegar 2x)', () => {
    expect(() => watcher.unwatch('nunca-existiu')).not.toThrow()
    expect(watcher.activeWatcherCount()).toBe(0)
  })
})
