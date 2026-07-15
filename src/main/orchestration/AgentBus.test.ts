import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentBus } from './AgentBus'
import { PtyManager, type IPtyLike } from '../pty/PtyManager'

// Fake multi-subscriber para onData (como o node-pty real e o fake de PtyManager.test.ts):
// cada chamada a onData() acumula um assinante em vez de sobrescrever o anterior. Isso é o
// que torna a assertiva de idempotência de track() (abaixo) significativa — com um fake de
// slot único, uma dupla assinatura ficaria mascarada (só o último callback "vence").
function fakePty(): { pty: IPtyLike; emit: (d: string) => void; emitExit: (code: number) => void } {
  const dataCbs: Array<(d: string) => void> = []
  let exitCb: (e: { exitCode: number }) => void = () => {}
  return {
    pty: {
      onData: (c) => { dataCbs.push(c) },
      onExit: (c) => { exitCb = c },
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn()
    },
    emit: (d) => { for (const cb of dataCbs) cb(d) },
    emitExit: (code) => exitCb({ exitCode: code })
  }
}

describe('AgentBus', () => {
  it('acumula a saída do pty no buffer e read() a retorna', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.track(id)
    f.emit('linha 1\n'); f.emit('linha 2\n')
    expect(bus.read(id)).toContain('linha 1')
    expect(bus.read(id)).toContain('linha 2')
  })
  it('ask escreve o prompt (com newline) no pty', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.ask(id, 'olá agente')
    expect(f.pty.write).toHaveBeenCalledWith('olá agente\n')
  })
  // R2 (orq ask --raw): writeRaw escreve os bytes EXATAMENTE como recebidos — sem o '\n' que ask()
  // acrescenta — para permitir teclas de controle (Ctrl+C etc.) a um TUI rodando no agente.
  it('writeRaw escreve os bytes crus no pty, sem acrescentar newline', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.writeRaw(id, '\x03') // Ctrl+C
    expect(f.pty.write).toHaveBeenCalledWith('\x03')
    expect(f.pty.write).not.toHaveBeenCalledWith('\x03\n')
  })
  it('read limita o buffer aos últimos ~8000 chars', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.track(id)
    f.emit('x'.repeat(10000))
    expect(bus.read(id).length).toBeLessThanOrEqual(8000)
  })
  it('track é idempotente: chamar duas vezes para o mesmo ptyId não duplica a assinatura de dados', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.track(id)
    bus.track(id)
    f.emit('x')
    expect(bus.read(id)).toBe('x') // 'xx' indicaria assinatura duplicada
  })
  it('track desliga o rastreamento sozinho quando o pty sai (untrack automático via onExit)', () => {
    const f = fakePty()
    const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    bus.track(id)
    f.emit('antes de sair\n')
    expect(bus.read(id)).toContain('antes de sair')
    f.emitExit(0)
    expect(bus.read(id)).toBe('')
  })
})

// Fase 14 (Task 1): waitForIdle bloqueia até o pty ficar em silêncio por idleMs — ou até
// timeoutMs estourar, o que vier primeiro — para permitir um "orq ask --wait" síncrono.
describe('AgentBus.waitForIdle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('resolve com o output apos idleMs de silencio', async () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty); const bus = new AgentBus(mgr)
    const id = mgr.spawn({}); bus.track(id)
    const p = bus.waitForIdle(id, { idleMs: 1000, timeoutMs: 10000 })
    f.emit('resposta parte 1\n')
    vi.advanceTimersByTime(500)     // ainda não ocioso
    f.emit('resposta parte 2\n')    // reseta o timer de ociosidade
    vi.advanceTimersByTime(1000)    // agora 1000ms de silêncio
    await expect(p).resolves.toContain('resposta parte 2')
  })

  it('resolve no timeoutMs mesmo sem ficar ocioso', async () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty); const bus = new AgentBus(mgr)
    const id = mgr.spawn({}); bus.track(id)
    const p = bus.waitForIdle(id, { idleMs: 5000, timeoutMs: 2000 })
    const spam = setInterval(() => f.emit('x'), 100)  // nunca fica ocioso
    vi.advanceTimersByTime(2000)
    clearInterval(spam)
    await expect(p).resolves.toBeTypeOf('string')
  })

  // Fix 1 (bug de perda de dados, confirmado empiricamente): a implementação antiga resolvia
  // com `this.read(ptyId).slice(startMark)` contra o buffer COMPARTILHADO que track() trunca
  // para os últimos 8000 chars. Se o buffer estourar 8000 entre a chamada e a resolução, o
  // slice fica errado — e se o buffer já está saturado em 8000 no momento da chamada (qualquer
  // sessão com histórico: banner + prompt + saída anterior), o delta devolvido é a STRING VAZIA
  // mesmo que o agente tenha produzido saída real. Os dois testes abaixo reproduzem exatamente
  // os casos empíricos documentados na tarefa.
  it('nao trunca o delta quando o buffer compartilhado estoura o limite de 8000 durante a espera (7000 pre-existentes + 2000 novos)', async () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty); const bus = new AgentBus(mgr)
    const id = mgr.spawn({}); bus.track(id)
    f.emit('x'.repeat(7000)) // pré-preenche o buffer compartilhado (abaixo do limite, sem truncagem ainda)
    const p = bus.waitForIdle(id, { idleMs: 1000, timeoutMs: 10000 })
    const novo = 'y'.repeat(2000)
    f.emit(novo) // buffer compartilhado passa a ter 9000 chars -> track() trunca para os últimos 8000
    vi.advanceTimersByTime(1000)
    await expect(p).resolves.toBe(novo) // implementação antiga devolvia só os últimos 1000 chars
  })

  it('nao retorna vazio quando o buffer compartilhado ja esta saturado em 8000 no momento da chamada (8000 pre-existentes + 500 novos)', async () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty); const bus = new AgentBus(mgr)
    const id = mgr.spawn({}); bus.track(id)
    f.emit('x'.repeat(8000)) // buffer compartilhado já saturado no limite
    const p = bus.waitForIdle(id, { idleMs: 1000, timeoutMs: 10000 })
    const novo = 'y'.repeat(500)
    f.emit(novo) // buffer compartilhado permanece em 8000 chars (últimos 8000); startMark ficaria fora dos limites
    vi.advanceTimersByTime(1000)
    await expect(p).resolves.toBe(novo) // implementação antiga devolvia string vazia
  })

  // Fix 3 (cobertura): o teste "resolve com o output apos idleMs de silencio" (acima) não
  // distingue "reseta a ociosidade a cada chunk" de "nunca reseta", porque em ambos os casos a
  // saída completa já estaria no buffer antes do timer original (agendado a partir do primeiro
  // chunk) disparar. Este teste usa um flag `resolved` + avanços parciais de tempo para provar
  // que CADA chunk empurra o prazo para frente — uma implementação sem reset resolveria cedo
  // demais (1000ms depois do primeiro chunk 'a', não 1000ms depois do último chunk 'b').
  it('reseta a ociosidade a cada chunk — nao resolve cedo', async () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty); const bus = new AgentBus(mgr)
    const id = mgr.spawn({}); bus.track(id)
    let resolved = false
    const p = bus.waitForIdle(id, { idleMs: 1000, timeoutMs: 60000 }).then((o) => { resolved = true; return o })
    f.emit('a')
    await vi.advanceTimersByTimeAsync(800); expect(resolved).toBe(false)
    f.emit('b')                                   // reseta o timer de ociosidade
    await vi.advanceTimersByTimeAsync(800); expect(resolved).toBe(false)  // só 800ms desde 'b'; uma impl sem reset já teria resolvido em 1000ms desde 'a'
    await vi.advanceTimersByTimeAsync(300); expect(resolved).toBe(true)   // 1100ms desde 'b'
    await expect(p).resolves.toBe('ab')
  })

  // Fix 5 (bug real, Fase 14 Task 1): a versão anterior chamava resetIdleTimer() na configuração
  // (antes de qualquer onData), então o silêncio ANTES do primeiro token do agente já contava
  // como ociosidade. Um agente de IA real que delibera por mais de idleMs (default 1500ms) antes
  // de imprimir o primeiro token fazia waitForIdle resolver cedo demais com delta vazio/parcial —
  // o caso comum de `orq ask "Dev" "refactor X" --wait`. Este teste prova que o silêncio antes do
  // primeiro token NÃO deve contar: com a implementação antiga, resolved já seria true aos 3000ms
  // (idleMs=1000, sem nenhum emit).
  it('nao inicia a contagem de ociosidade antes do primeiro output (agente que delibera antes de responder)', async () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty); const bus = new AgentBus(mgr)
    const id = mgr.spawn({}); bus.track(id)
    let resolved = false
    const p = bus.waitForIdle(id, { idleMs: 1000, timeoutMs: 60000 }).then((o) => { resolved = true; return o })
    await vi.advanceTimersByTimeAsync(3000) // silêncio antes do primeiro token: NÃO deve resolver
    expect(resolved).toBe(false)
    f.emit('resposta')                      // primeiro token: só agora o timer de ociosidade arma
    await vi.advanceTimersByTimeAsync(1000)
    expect(resolved).toBe(true)
    await expect(p).resolves.toBe('resposta')
  })

  // Cobertura de regressão: o teto (timeoutMs) precisa continuar resolvendo mesmo quando o
  // agente nunca emite nada — sem isso, remover o resetIdleTimer() da configuração poderia
  // (em uma implementação errada) deixar a Promise pendente para sempre nesse caso.
  it('o timeoutMs (teto) ainda resolve quando o agente nunca emite nenhuma saida', async () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty); const bus = new AgentBus(mgr)
    const id = mgr.spawn({}); bus.track(id)
    let resolved = false
    const p = bus.waitForIdle(id, { idleMs: 5000, timeoutMs: 2000 }).then((o) => { resolved = true; return o })
    await vi.advanceTimersByTimeAsync(2000) // nenhum emit em todo o teste
    expect(resolved).toBe(true)
    await expect(p).resolves.toBe('')
  })
})

// Fase 20 (Task 1): watcher contínuo de "atenção" — quando um pty tem output e depois fica
// `idleMs` em silêncio, `onAttention(ptyId)` dispara uma vez. Vive DENTRO da assinatura onData
// já existente em track() (nenhuma segunda assinatura). Semântica: só dispara de novo com NOVO
// output após o disparo anterior (o timer só é reagendado dentro do onData); clearAttention()
// cancela qualquer disparo pendente e exige novo output para poder disparar de novo.
describe('AgentBus attention', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('dispara onAttention após output seguido de idleMs de silêncio', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const onAttention = vi.fn()
    const bus = new AgentBus(mgr, { onAttention, idleMs: 1000 })
    const id = mgr.spawn({}); bus.track(id)
    f.emit('trabalhando...\n')            // atividade
    vi.advanceTimersByTime(1000)          // silêncio por idleMs
    expect(onAttention).toHaveBeenCalledWith(id)
  })

  it('não redispara sem novo output (só uma vez até novo output)', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const onAttention = vi.fn()
    const bus = new AgentBus(mgr, { onAttention, idleMs: 1000 })
    const id = mgr.spawn({}); bus.track(id)
    f.emit('trabalhando...\n')
    vi.advanceTimersByTime(1000)
    expect(onAttention).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)          // segue em silêncio, bem além de idleMs
    expect(onAttention).toHaveBeenCalledTimes(1) // não redisparou
    f.emit('mais trabalho...\n')          // novo output -> pode disparar de novo
    vi.advanceTimersByTime(1000)
    expect(onAttention).toHaveBeenCalledTimes(2)
  })

  it('não dispara se não houve output desde a última limpeza', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const onAttention = vi.fn()
    const bus = new AgentBus(mgr, { onAttention, idleMs: 1000 })
    const id = mgr.spawn({}); bus.track(id)
    f.emit('trabalhando...\n')
    vi.advanceTimersByTime(400)           // ainda dentro da janela de idleMs (timer pendente)
    bus.clearAttention(id)                // limpa ANTES do timer disparar
    vi.advanceTimersByTime(5000)          // avança bem além do idleMs original, sem novo output
    expect(onAttention).not.toHaveBeenCalled()
  })

  it('untrack cancela o timer de atenção pendente (pty saiu, não deve disparar depois)', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const onAttention = vi.fn()
    const bus = new AgentBus(mgr, { onAttention, idleMs: 1000 })
    const id = mgr.spawn({}); bus.track(id)
    f.emit('trabalhando...\n')
    f.emitExit(0)                         // auto-untrack via onExit
    vi.advanceTimersByTime(5000)
    expect(onAttention).not.toHaveBeenCalled()
  })

  it('construtor sem opts continua funcionando (retrocompatível) e nunca dispara onAttention', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr) // sem segundo argumento, como no uso pré-Fase 20
    const id = mgr.spawn({}); bus.track(id)
    f.emit('trabalhando...\n')
    vi.advanceTimersByTime(10000)
    expect(bus.read(id)).toContain('trabalhando') // comportamento existente intacto
    // nenhuma asserção de onAttention é possível aqui (não foi passado) — a ausência de
    // exceção já comprova que o watcher não quebra o construtor de 1 argumento.
  })
})

// Fix border-beam preso (2026-07-15): watcher de "busy" — ancora o sinal "generating" do
// renderer NA MESMA detecção de ociosidade do watcher de atenção acima (idleMs), em vez do timer
// fixo de 500ms que ficava preso ligado com repaints ociosos da TUI do Claude Code/Ink (que
// emite saída mesmo parado, em intervalos > 500ms mas < idleMs). onBusyChange(ptyId, true) já no
// primeiro chunk de uma rajada; onBusyChange(ptyId, false) só depois de idleMs de silêncio real.
describe('AgentBus busy', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('liga busy=true já no primeiro chunk de output, sem esperar idleMs', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const onBusyChange = vi.fn()
    const bus = new AgentBus(mgr, { onBusyChange, idleMs: 1000 })
    const id = mgr.spawn({}); bus.track(id)
    f.emit('trabalhando...\n')
    expect(onBusyChange).toHaveBeenCalledWith(id, true)
    expect(onBusyChange).toHaveBeenCalledTimes(1) // não duplica: só a transição false->true dispara
  })

  it('desliga busy=false após idleMs de silêncio (mesma janela do watcher de atenção)', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const onBusyChange = vi.fn()
    const bus = new AgentBus(mgr, { onBusyChange, idleMs: 1000 })
    const id = mgr.spawn({}); bus.track(id)
    f.emit('trabalhando...\n')
    vi.advanceTimersByTime(999)
    expect(onBusyChange).toHaveBeenCalledTimes(1) // ainda não desligou
    vi.advanceTimersByTime(1)
    expect(onBusyChange).toHaveBeenNthCalledWith(2, id, false)
  })

  it('reseta a contagem de ociosidade a cada chunk — não desliga cedo com repaints esparsos', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const onBusyChange = vi.fn()
    const bus = new AgentBus(mgr, { onBusyChange, idleMs: 1000 })
    const id = mgr.spawn({}); bus.track(id)
    f.emit('token 1')
    vi.advanceTimersByTime(700)
    f.emit('repaint ocioso') // chunk esparso da TUI — reseta o timer de busy
    vi.advanceTimersByTime(700)
    expect(onBusyChange).toHaveBeenCalledTimes(1) // só o "true" inicial — nunca desligou
    vi.advanceTimersByTime(300) // agora 1000ms desde o último chunk
    expect(onBusyChange).toHaveBeenNthCalledWith(2, id, false)
  })

  it('multi-turno: novo output depois de idle religa busy=true', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const onBusyChange = vi.fn()
    const bus = new AgentBus(mgr, { onBusyChange, idleMs: 1000 })
    const id = mgr.spawn({}); bus.track(id)
    f.emit('resposta 1\n')
    vi.advanceTimersByTime(1000) // desliga
    expect(onBusyChange).toHaveBeenNthCalledWith(2, id, false)
    f.emit('resposta 2 (novo turno)\n') // usuário mandou outra mensagem
    expect(onBusyChange).toHaveBeenNthCalledWith(3, id, true)
    vi.advanceTimersByTime(1000)
    expect(onBusyChange).toHaveBeenNthCalledWith(4, id, false)
  })

  it('clearAttention (foco do usuário) NÃO desliga busy nem cancela o timer de busy pendente', () => {
    // Este é o caso que exige um timer PRÓPRIO para busy (não reaproveitar attentionTimers):
    // se o usuário focar o terminal enquanto o agente ainda está gerando, clearAttention() só
    // pode afetar o pulso de "precisa de você" — nunca travar o beam ligado para sempre.
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const onBusyChange = vi.fn()
    const bus = new AgentBus(mgr, { onBusyChange, idleMs: 1000 })
    const id = mgr.spawn({}); bus.track(id)
    f.emit('gerando...\n')
    bus.clearAttention(id) // usuário focou o terminal no meio da geração
    vi.advanceTimersByTime(1000) // idleMs real de silêncio depois do foco
    expect(onBusyChange).toHaveBeenNthCalledWith(2, id, false) // ainda desliga sozinho
  })

  it('untrack (pty morreu) força busy=false na hora, mesmo com o timer ainda pendente', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const onBusyChange = vi.fn()
    const bus = new AgentBus(mgr, { onBusyChange, idleMs: 1000 })
    const id = mgr.spawn({}); bus.track(id)
    f.emit('gerando quando o processo caiu\n')
    f.emitExit(1) // auto-untrack via onExit — meio de uma "rajada", timer de busy ainda pendente
    expect(onBusyChange).toHaveBeenNthCalledWith(2, id, false)
    vi.advanceTimersByTime(5000)
    expect(onBusyChange).toHaveBeenCalledTimes(2) // não disparou de novo quando o timer teria vencido
  })

  it('untrack não chama onBusyChange se o pty já não estava busy (idle antes de sair)', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const onBusyChange = vi.fn()
    const bus = new AgentBus(mgr, { onBusyChange, idleMs: 1000 })
    const id = mgr.spawn({}); bus.track(id)
    f.emit('resposta\n')
    vi.advanceTimersByTime(1000) // já desligou sozinho
    onBusyChange.mockClear()
    f.emitExit(0)
    expect(onBusyChange).not.toHaveBeenCalled()
  })

  it('idle prolongado com repaints esparsos ANTES de qualquer output novo real não liga busy de novo', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const onBusyChange = vi.fn()
    const bus = new AgentBus(mgr, { onBusyChange, idleMs: 1000 })
    const id = mgr.spawn({}); bus.track(id)
    f.emit('resposta\n')
    vi.advanceTimersByTime(1000) // desliga (idle real)
    expect(onBusyChange).toHaveBeenNthCalledWith(2, id, false)
    onBusyChange.mockClear()
    // nenhum chunk novo por um bom tempo: não deve haver mais nenhuma chamada
    vi.advanceTimersByTime(30000)
    expect(onBusyChange).not.toHaveBeenCalled()
  })

  it('construtor sem onBusyChange continua funcionando (retrocompatível)', () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty)
    const bus = new AgentBus(mgr, { idleMs: 1000 }) // sem onBusyChange
    const id = mgr.spawn({}); bus.track(id)
    f.emit('trabalhando...\n')
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
  })
})

// PTY-4 / PTY-8 (auditoria 2026-07-14): teto do delta + fast-path de saída no waitForIdle.
describe('AgentBus.waitForIdle — cap e fast-path de saída', () => {
  it('PTY-8: resolve imediatamente quando o pty sai, sem esperar o teto de tempo', async () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty); const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    const p = bus.waitForIdle(id, { idleMs: 5000, timeoutMs: 120000 })
    f.emit('parcial')
    f.emitExit(0) // pty morre no meio da espera → finish() na hora
    await expect(p).resolves.toContain('parcial')
  })

  it('PTY-4: limita o delta acumulado à cauda (não cresce sem teto)', async () => {
    const f = fakePty(); const mgr = new PtyManager(() => f.pty); const bus = new AgentBus(mgr)
    const id = mgr.spawn({})
    const p = bus.waitForIdle(id, { idleMs: 1000, timeoutMs: 120000 })
    f.emit('A'.repeat(300 * 1024)) // acima do teto de 256KB
    f.emitExit(0)
    const out = await p
    expect(out.length).toBeLessThanOrEqual(256 * 1024)
  })
})
