import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerPtyIpc } from './registerPtyIpc'
import { PtyManager, type IPtyLike, type PtySpawner } from './PtyManager'
import { AgentBus } from '../orchestration/AgentBus'
import { buildRolePrompt } from '../../shared/rolePrompt'

function fakeIpcMain() {
  const handlers = new Map<string, (...a: any[]) => any>()
  const listeners = new Map<string, (...a: any[]) => void>()
  return {
    handle: (ch: string, fn: (...a: any[]) => any) => handlers.set(ch, fn),
    on: (ch: string, fn: (...a: any[]) => void) => listeners.set(ch, fn),
    handlers,
    listeners
  }
}

function makeFakePty(): { pty: IPtyLike; emit: (d: string) => void } {
  let dataCb: (d: string) => void = () => {}
  return {
    pty: { onData: (cb) => { dataCb = cb }, onExit: () => {}, write: vi.fn(), resize: vi.fn(), kill: vi.fn() },
    emit: (d) => dataCb(d)
  }
}

// Fake que captura o callback de exit (o makeFakePty tem `onExit: () => {}` e descarta o cb) —
// necessário para T1 (Onda 2): provar que registerPtyIpc encaminha pty:exit ao sender. O
// PtyManager assina um único pty.onExit bruto e o repassa aos exitSubs, então guardar esse cb aqui
// é suficiente para disparar o exit no teste.
function makeExitFakePty(): { pty: IPtyLike; emitExit: (code: number) => void } {
  let exitCb: (e: { exitCode: number }) => void = () => {}
  return {
    pty: { onData: () => {}, onExit: (cb) => { exitCb = cb }, write: vi.fn(), resize: vi.fn(), kill: vi.fn() },
    emitExit: (code) => exitCb({ exitCode: code })
  }
}

// Fake multi-subscriber (não sobrescreve o assinante anterior) — o mesmo formato usado em
// PtyManager.test.ts. Necessário aqui para provar que DUAS assinaturas onData independentes
// (o streaming do registerPtyIpc para o renderer + o buffer do AgentBus) coexistem no mesmo
// pty sem uma pisar na outra, o que o fake de slot único acima não conseguiria revelar.
function makeMultiSubFakePty(): { pty: IPtyLike; emit: (d: string) => void } {
  const dataCbs: Array<(d: string) => void> = []
  return {
    pty: {
      onData: (cb) => { dataCbs.push(cb) },
      onExit: () => {},
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn()
    },
    emit: (d) => { for (const cb of dataCbs) cb(d) }
  }
}

describe('registerPtyIpc', () => {
  it('pty:spawn cria pty e encaminha data ao sender', async () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const sender = { send: vi.fn() }
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => sender as any)

    const id = await ipc.handlers.get('pty:spawn')!({}, { cols: 80, rows: 24 })
    expect(typeof id).toBe('string')
    fake.emit('data-x')
    // Bloco 2a: o output de pty é batched (~1 frame) — espera o flush antes de conferir o send.
    await new Promise((r) => setTimeout(r, 30))
    expect(sender.send).toHaveBeenCalledWith('pty:data', id, 'data-x')
  })

  it('pty:write encaminha ao PtyManager', async () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)
    const id = await ipc.handlers.get('pty:spawn')!({}, {})
    ipc.listeners.get('pty:write')!({}, id, 'echo hi\n')
    expect(fake.pty.write).toHaveBeenCalledWith('echo hi\n')
  })

  it('pty:spawn injeta o env de orquestração (getEnv) no PtyManager.spawn', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null, () => ({ ORKESTRA_PORT: '4321', ORKESTRA_TOKEN: 'tok' }))

    await ipc.handlers.get('pty:spawn')!({}, { cols: 80, rows: 24 })

    const call = spawner.mock.calls[0]
    expect(call[2].env.ORKESTRA_PORT).toBe('4321')
    expect(call[2].env.ORKESTRA_TOKEN).toBe('tok')
  })

  // Escopo de projeto (auditoria 2026-07-14): cada pty nasce etiquetado com o projeto ativo no
  // momento do spawn (ORKESTRA_PROJECT_ID) — o orq envia isso em toda request e o servidor
  // rejeita comandos de agentes cujo projeto não está mais ativo.
  it('pty:spawn injeta ORKESTRA_PROJECT_ID (getProjectId) no env do pty', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null, () => ({}), () => {}, undefined, () => 'proj-42')

    await ipc.handlers.get('pty:spawn')!({}, { nodeId: 'terminal-1' })

    const call = spawner.mock.calls[0]
    expect(call[2].env.ORKESTRA_PROJECT_ID).toBe('proj-42')
    expect(call[2].env.ORKESTRA_NODE_ID).toBe('terminal-1')
  })

  it('pty:spawn sem getProjectId (ou sem projeto ativo) não injeta ORKESTRA_PROJECT_ID', async () => {
    // Regressão: se o PRÓPRIO app foi iniciado de dentro de um terminal do Orkestra (dev aninhado),
    // process.env traz um ORKESTRA_PROJECT_ID herdado — o pty NÃO pode vazá-lo quando não há
    // projeto ativo, senão o orq etiqueta requests com um projeto alheio (escopo cross-project).
    vi.stubEnv('ORKESTRA_PROJECT_ID', 'vazado-do-ambiente')
    try {
      const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
      const mgr = new PtyManager(spawner)
      const ipc = fakeIpcMain()
      registerPtyIpc(ipc as any, mgr, () => null)

      await ipc.handlers.get('pty:spawn')!({}, {})

      expect(spawner.mock.calls[0][2].env.ORKESTRA_PROJECT_ID).toBeUndefined()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('pty:spawn resolve "claude" para o caminho absoluto do wrapper (ORKESTRA_BIN)', async () => {
    // multi-sub: o registerPtyIpc assina o batcher no mesmo pty do auto-início — o fake de slot
    // único apagaria o handler do auto-início e o write nunca dispararia.
    const fake = makeMultiSubFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null, () => ({ ORKESTRA_BIN: '/Users/x/.orkestra/bin' }))
    await ipc.handlers.get('pty:spawn')!({}, { initialCommand: 'claude' })
    fake.emit('prompt$ ') // 1º output do shell dispara o auto-início
    // caminho ABSOLUTO do wrapper (o .zshrc não consegue mascarar), não "claude"
    expect(fake.pty.write).toHaveBeenCalledWith('/Users/x/.orkestra/bin/claude\n')
  })

  it('pty:spawn sem ORKESTRA_BIN digita o comando cru (sem resolução)', async () => {
    const fake = makeMultiSubFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)
    await ipc.handlers.get('pty:spawn')!({}, { initialCommand: 'claude' })
    fake.emit('prompt$ ')
    expect(fake.pty.write).toHaveBeenCalledWith('claude\n')
  })

  it('pty:spawn sem getEnv explícito não quebra (default env vazio)', async () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)
    const id = await ipc.handlers.get('pty:spawn')!({}, {})
    expect(typeof id).toBe('string')
  })

  it('pty:spawn chama onSpawn(id) depois de criar o pty (hook opcional)', async () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const ipc = fakeIpcMain()
    const onSpawn = vi.fn()
    registerPtyIpc(ipc as any, mgr, () => null, undefined, onSpawn)
    const id = await ipc.handlers.get('pty:spawn')!({}, {})
    expect(onSpawn).toHaveBeenCalledWith(id)
  })

  it('pty:spawn sem onSpawn explícito não quebra (default no-op)', async () => {
    const fake = makeFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)
    const id = await ipc.handlers.get('pty:spawn')!({}, {})
    expect(typeof id).toBe('string')
  })

  // Fase 17 (Task 1): getProjectCwd é o resolver late-bound do cwd do projeto ATIVO — chamado a
  // cada pty:spawn (não cacheado), então trocar de projeto muda a pasta dos PRÓXIMOS terminais.
  it('pty:spawn sem o.cwd usa getProjectCwd() como cwd', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null, undefined, undefined, () => '/tmp/proj')

    await ipc.handlers.get('pty:spawn')!({}, { cols: 80, rows: 24 })

    const call = spawner.mock.calls[0]
    expect(call[2].cwd).toBe('/tmp/proj')
  })

  it('pty:spawn com o.cwd explícito vence sobre getProjectCwd()', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null, undefined, undefined, () => '/tmp/proj')

    await ipc.handlers.get('pty:spawn')!({}, { cwd: '/tmp/explicito' })

    const call = spawner.mock.calls[0]
    expect(call[2].cwd).toBe('/tmp/explicito')
  })

  // Segurança: o handler de pty:spawn deve fazer allowlist explícito dos campos vindos do
  // renderer. Sem isto, `{ ...o }` repassaria file/args arbitrários direto ao PtyManager.spawn
  // (que os repassa ao spawner real/node-pty), permitindo RCE a partir de um renderer
  // comprometido — bypassando totalmente o gate de isValidSshHost.
  it('ignora file/args vindos do renderer (allowlist) — não spawna binário arbitrário', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)

    await ipc.handlers.get('pty:spawn')!({}, { file: '/bin/sh', args: ['-c', 'x'], nodeId: 'n1' })

    const call = spawner.mock.calls[0]
    expect(call[0]).not.toBe('/bin/sh') // usou o shell padrão, não o file vindo do renderer
    expect(call[1]).toEqual([])         // args vindos do renderer são ignorados
  })

  // Fase 27 (Task 2): sshHost é validado no MAIN (isValidSshHost) e só então mapeado para
  // file:'ssh', args:[host] — nunca repassado cru do renderer (ver allowlist acima).
  it('sshHost válido spawna ssh com o host como arg (sem shell)', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)

    await ipc.handlers.get('pty:spawn')!({}, { sshHost: 'user@host', nodeId: 'n1' })

    const call = spawner.mock.calls[0]
    expect(call[0]).toBe('ssh')
    expect(call[1]).toEqual(['user@host'])
  })

  // T1 (Onda 2, habilitante do feedback de estado de conexão): o exit do pty precisa CHEGAR ao
  // renderer para o badge SSH poder virar "caiu". registerPtyIpc, além do flush final já
  // existente, encaminha ('pty:exit', id, exitCode) pelo MESMO getSender() usado por pty:data.
  it('pty:spawn encaminha pty:exit ao sender com id e exitCode', async () => {
    const fake = makeExitFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const sender = { send: vi.fn() }
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => sender as any)

    const id = await ipc.handlers.get('pty:spawn')!({}, {})
    fake.emitExit(7)

    expect(sender.send).toHaveBeenCalledWith('pty:exit', id, 7)
  })

  it('sshHost inválido é rejeitado e não spawna nada', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)

    await expect(ipc.handlers.get('pty:spawn')!({}, { sshHost: 'a; rm -rf /' })).rejects.toThrow()
    expect(spawner).not.toHaveBeenCalled()
  })

  it('pty:spawn sem o.cwd e sem getProjectCwd deixa o PtyManager aplicar o fallback de HOME', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)

    await ipc.handlers.get('pty:spawn')!({}, {})

    const call = spawner.mock.calls[0]
    expect(call[2].cwd).toBe(process.env.HOME ?? process.cwd())
  })

  // T2 (injeção de papel) — REGRA INEGOCIÁVEL: o cwd do pty é SEMPRE a raiz do projeto. A versão
  // original materializava CLAUDE.md num subdir `.orkestra/agents/<nodeId>/` e apontava o cwd pra
  // lá; como o Claude Code limita o acesso a arquivos ao cwd, todo agente COM PAPEL nascia CEGO —
  // via o CLAUDE.md gerado e mais nada, nem o código do usuário. O papel agora viaja por
  // ORKESTRA_ROLE no env e é injetado pelo wrapper `claude` (installOrq), que já faz o mesmo com o
  // onboarding. role/preset entram por allowlist (destructure), nunca via { ...o }.
  it('pty:spawn com preset agente + papel mantém o cwd na RAIZ do projeto (não cega o agente)', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)
    const base = mkdtempSync(join(tmpdir(), 'ork-role-'))
    try {
      await ipc.handlers.get('pty:spawn')!({}, {
        preset: 'claude',
        role: 'dev',
        nodeId: 'terminal-abc123',
        cwd: base
      })
      const call = spawner.mock.calls[0]
      expect(call[2].cwd).toBe(base)
      // e nada de subdir de contexto: o papel não passa mais por arquivo.
      expect(existsSync(join(base, '.orkestra'))).toBe(false)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('pty:spawn com papel passa o prompt de papel no env (ORKESTRA_ROLE) para o wrapper injetar', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)

    const base = mkdtempSync(join(tmpdir(), 'ork-role-'))
    try {
      await ipc.handlers.get('pty:spawn')!({}, {
        preset: 'claude',
        role: 'dev',
        nodeId: 'terminal-abc123',
        cwd: base
      })
      expect(spawner.mock.calls[0][2].env.ORKESTRA_ROLE).toBe(buildRolePrompt('dev'))
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('pty:spawn sem papel (ou papel sem prompt) APAGA ORKESTRA_ROLE herdado do process.env', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)
    const orig = process.env.ORKESTRA_ROLE
    process.env.ORKESTRA_ROLE = 'papel-vazado-de-um-dev-aninhado'
    try {
      await ipc.handlers.get('pty:spawn')!({}, { preset: 'claude', nodeId: 'terminal-sem-papel' })
      expect(spawner.mock.calls[0][2].env.ORKESTRA_ROLE).toBeUndefined()
    } finally {
      if (orig === undefined) delete process.env.ORKESTRA_ROLE
      else process.env.ORKESTRA_ROLE = orig
    }
  })

  it('pty:spawn shell com papel não escreve arquivo nem muda o cwd (papel só via env)', async () => {
    const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
    const mgr = new PtyManager(spawner)
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => null)
    const base = mkdtempSync(join(tmpdir(), 'ork-role-'))
    try {
      await ipc.handlers.get('pty:spawn')!({}, {
        preset: 'shell',
        role: 'dev',
        nodeId: 'terminal-xyz789',
        cwd: base
      })
      const call = spawner.mock.calls[0]
      expect(call[2].cwd).toBe(base)
      expect(existsSync(join(base, '.orkestra'))).toBe(false)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('a assinatura onData do streaming (renderer) e a do AgentBus.track coexistem no mesmo pty (multi-subscriber)', async () => {
    const fake = makeMultiSubFakePty()
    const mgr = new PtyManager(() => fake.pty)
    const bus = new AgentBus(mgr)
    const sender = { send: vi.fn() }
    const ipc = fakeIpcMain()
    registerPtyIpc(ipc as any, mgr, () => sender as any, undefined, (id) => bus.track(id))

    const id = await ipc.handlers.get('pty:spawn')!({}, {})
    fake.emit('saida-do-agente')

    // Bloco 2a: o send ao renderer é batched (~1 frame); o AgentBus assina onData direto (imediato).
    await new Promise((r) => setTimeout(r, 30))
    expect(sender.send).toHaveBeenCalledWith('pty:data', id, 'saida-do-agente')
    expect(bus.read(id)).toContain('saida-do-agente')
  })
})
