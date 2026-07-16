import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, existsSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseRoleSidecar, buildRoleSidecar } from '../../shared/roleSidecar'
import { registerPtyIpc } from './registerPtyIpc'
import { writeImportedRoles } from '../roles/roleRegistry'
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

  // T3a (sidecar do papel) — o `role.json` vive FORA do repositório do usuário, em
  // ~/.orkestra/agents/<nodeId>/. Decisão consciente: o papel não viaja com um checkout da branch,
  // mas o working tree do usuário não é sujado (`.orkestra` nunca esteve no .gitignore, e a versão
  // antiga de T2 chegou a deixar um CLAUDE.md untracked em repos reais). O sidecar é
  // PORTABILIDADE/METADADO — a injeção continua sendo ORKESTRA_ROLE no env + wrapper `claude`.
  describe('sidecar role.json (T3a)', () => {
    // os.homedir() usa $HOME no POSIX e %USERPROFILE% no Windows — sobrescrevemos os dois para o
    // teste ser determinístico no matrix de CI e nunca escrever no ~/.orkestra real.
    async function withFakeHome(fn: (home: string, projectCwd: string) => Promise<void>): Promise<void> {
      const origHome = process.env.HOME
      const origProfile = process.env.USERPROFILE
      const home = mkdtempSync(join(tmpdir(), 'ork-home-'))
      const projectCwd = mkdtempSync(join(tmpdir(), 'ork-proj-'))
      process.env.HOME = home
      process.env.USERPROFILE = home
      try {
        await fn(home, projectCwd)
      } finally {
        if (origHome === undefined) delete process.env.HOME
        else process.env.HOME = origHome
        if (origProfile === undefined) delete process.env.USERPROFILE
        else process.env.USERPROFILE = origProfile
        rmSync(home, { recursive: true, force: true })
        rmSync(projectCwd, { recursive: true, force: true })
      }
    }

    // Dispara um pty:spawn real (handler async) e devolve o spawner espionado + a promessa do
    // handler, para cada teste decidir se espera sucesso ou inspeciona a rejeição.
    function spawnWith(opts: Record<string, unknown>): { spawner: ReturnType<typeof vi.fn>; call: Promise<unknown> } {
      const spawner = vi.fn<PtySpawner>(() => makeFakePty().pty)
      const mgr = new PtyManager(spawner)
      const ipc = fakeIpcMain()
      registerPtyIpc(ipc as any, mgr, () => null)
      return { spawner: spawner as any, call: ipc.handlers.get('pty:spawn')!({}, opts) }
    }

    it('spawn com papel grava ~/.orkestra/agents/<nodeId>/role.json com o shape {name,color,prompt}', async () => {
      await withFakeHome(async (home, projectCwd) => {
        const { call } = spawnWith({ preset: 'claude', role: 'dev', nodeId: 'terminal-abc123', cwd: projectCwd })
        await call
        const file = join(home, '.orkestra', 'agents', 'terminal-abc123', 'role.json')
        expect(existsSync(file)).toBe(true)
        expect(parseRoleSidecar(readFileSync(file, 'utf-8'))).toEqual(buildRoleSidecar('dev'))
      })
    })

    it('NÃO escreve nada no repositório do usuário (cwd do projeto intocado) nem mexe no cwd do pty', async () => {
      await withFakeHome(async (_home, projectCwd) => {
        const { spawner, call } = spawnWith({ preset: 'claude', role: 'dev', nodeId: 'terminal-abc123', cwd: projectCwd })
        await call
        expect(readdirSync(projectCwd)).toEqual([])
        expect(existsSync(join(projectCwd, '.orkestra'))).toBe(false)
        expect(spawner.mock.calls[0][2].cwd).toBe(projectCwd)
      })
    })

    it('papel livre (sem prompt) também grava o sidecar — o nome é metadado útil', async () => {
      await withFakeHome(async (home, projectCwd) => {
        const { call } = spawnWith({ preset: 'claude', role: 'Arquiteto', nodeId: 'terminal-livre', cwd: projectCwd })
        await call
        const file = join(home, '.orkestra', 'agents', 'terminal-livre', 'role.json')
        expect(parseRoleSidecar(readFileSync(file, 'utf-8'))).toEqual({
          name: 'Arquiteto',
          color: 'var(--text-2)',
          prompt: ''
        })
      })
    })

    it('spawn SEM papel não grava sidecar algum', async () => {
      await withFakeHome(async (home, projectCwd) => {
        const { call } = spawnWith({ preset: 'claude', nodeId: 'terminal-sem-papel', cwd: projectCwd })
        await call
        expect(existsSync(join(home, '.orkestra', 'agents'))).toBe(false)
      })
    })

    // Anti path traversal: nodeId vem por IPC e é componente de caminho. Um renderer comprometido
    // não pode escrever role.json fora de ~/.orkestra/agents/.
    it('nodeId com traversal não grava nada (guard SAFE_NODE_ID)', async () => {
      await withFakeHome(async (home, projectCwd) => {
        const { spawner, call } = spawnWith({ preset: 'claude', role: 'dev', nodeId: '../../evil', cwd: projectCwd })
        await call
        expect(existsSync(join(home, '.orkestra', 'agents'))).toBe(false)
        expect(existsSync(join(home, 'evil'))).toBe(false)
        expect(existsSync(join(tmpdir(), 'evil'))).toBe(false)
        // e o terminal nasce normalmente (o sidecar é best-effort, não um gate do spawn).
        expect(spawner.mock.calls.length).toBe(1)
      })
    })

    it('falha de I/O degrada sem derrubar o terminal (spawn resolve e o env do papel continua)', async () => {
      await withFakeHome(async (home, projectCwd) => {
        // `agents` como ARQUIVO faz o mkdirSync do subdir lançar EEXIST/ENOTDIR.
        mkdirSync(join(home, '.orkestra'), { recursive: true })
        writeFileSync(join(home, '.orkestra', 'agents'), 'não sou um diretório')
        const { spawner, call } = spawnWith({ preset: 'claude', role: 'dev', nodeId: 'terminal-abc123', cwd: projectCwd })
        await expect(call).resolves.toBeTruthy()
        expect(spawner.mock.calls[0][2].env.ORKESTRA_ROLE).toBe(buildRolePrompt('dev'))
      })
    })

    // T5 ("Descobrir Responsabilidades") — é AQUI que a importação passa a valer: um papel importado
    // não é preset, então buildRolePrompt não o conhece e, sem esta consulta ao registro
    // (~/.orkestra/roles.json), o agente nasceria sem papel algum (papel livre) e a importação seria
    // cosmética. Mesmo caminho de entrega de sempre: ORKESTRA_ROLE + wrapper `claude`.
    describe('papel importado (T5)', () => {
      // Grava o registro pelo escritor de PRODUÇÃO (o mesmo que o handler roles:import usa).
      function importRole(home: string, name: string, prompt: string): void {
        mkdirSync(join(home, '.orkestra'), { recursive: true })
        writeImportedRoles([{ name, color: 'var(--text-2)', prompt }], join(home, '.orkestra', 'roles.json'))
      }

      it('papel importado (não-preset) injeta o prompt do registro em ORKESTRA_ROLE', async () => {
        await withFakeHome(async (home, projectCwd) => {
          importRole(home, 'Auditor', 'Você audita a segurança do código.')
          const { spawner, call } = spawnWith({ preset: 'claude', role: 'auditor', nodeId: 'terminal-imp', cwd: projectCwd })
          await call
          expect(spawner.mock.calls[0][2].env.ORKESTRA_ROLE).toBe('Você audita a segurança do código.')
        })
      })

      it('preset continua vencendo o registro (buildRolePrompt é a fonte dos presets)', async () => {
        await withFakeHome(async (home, projectCwd) => {
          importRole(home, 'Dev', 'prompt intruso')
          const { spawner, call } = spawnWith({ preset: 'claude', role: 'dev', nodeId: 'terminal-preset', cwd: projectCwd })
          await call
          expect(spawner.mock.calls[0][2].env.ORKESTRA_ROLE).toBe(buildRolePrompt('dev'))
        })
      })

      it('papel livre sem importação segue sem ORKESTRA_ROLE (registro ausente não quebra o spawn)', async () => {
        await withFakeHome(async (_home, projectCwd) => {
          const { spawner, call } = spawnWith({ preset: 'claude', role: 'Arquiteto', nodeId: 'terminal-livre2', cwd: projectCwd })
          await expect(call).resolves.toBeTruthy()
          expect(spawner.mock.calls[0][2].env.ORKESTRA_ROLE).toBeUndefined()
        })
      })

      it('o sidecar do papel importado registra o PROMPT importado (não um sidecar vazio)', async () => {
        await withFakeHome(async (home, projectCwd) => {
          importRole(home, 'Auditor', 'Você audita a segurança do código.')
          const { call } = spawnWith({ preset: 'claude', role: 'Auditor', nodeId: 'terminal-imp2', cwd: projectCwd })
          await call
          const file = join(home, '.orkestra', 'agents', 'terminal-imp2', 'role.json')
          expect(parseRoleSidecar(readFileSync(file, 'utf-8'))).toEqual({
            name: 'Auditor',
            color: 'var(--text-2)',
            prompt: 'Você audita a segurança do código.'
          })
        })
      })
    })

    // T4b — o sidecar é a FONTE do prompt efetivo quando o `name` dele corresponde ao papel atual do
    // nó. É o que faz o auto-refino (`orq role write`) sobreviver a um novo spawn: antes disso o
    // spawn montava ORKESTRA_ROLE só de buildRolePrompt(papel do nó) e AINDA sobrescrevia o
    // role.json, destruindo o texto refinado silenciosamente.
    describe('refino do papel sobrevive ao spawn (T4b)', () => {
      // Escreve um role.json à mão — simula o que `orq role write` deixa em disco.
      function putSidecar(home: string, nodeId: string, sidecar: unknown): string {
        const dir = join(home, '.orkestra', 'agents', nodeId)
        mkdirSync(dir, { recursive: true })
        const file = join(dir, 'role.json')
        writeFileSync(file, typeof sidecar === 'string' ? sidecar : JSON.stringify(sidecar), 'utf-8')
        return file
      }

      it('sidecar do papel ATUAL com prompt refinado vence o preset em ORKESTRA_ROLE', async () => {
        await withFakeHome(async (home, projectCwd) => {
          putSidecar(home, 'terminal-ref', { name: 'Dev', color: 'var(--paper-teal)', prompt: 'PROMPT REFINADO' })
          const { spawner, call } = spawnWith({ preset: 'claude', role: 'dev', nodeId: 'terminal-ref', cwd: projectCwd })
          await call
          expect(spawner.mock.calls[0][2].env.ORKESTRA_ROLE).toBe('PROMPT REFINADO')
        })
      })

      it('o spawn NÃO sobrescreve o refino do sidecar do papel atual', async () => {
        await withFakeHome(async (home, projectCwd) => {
          const file = putSidecar(home, 'terminal-ref2', {
            name: 'Dev',
            color: 'var(--paper-teal)',
            prompt: 'PROMPT REFINADO'
          })
          const { call } = spawnWith({ preset: 'claude', role: 'dev', nodeId: 'terminal-ref2', cwd: projectCwd })
          await call
          expect(parseRoleSidecar(readFileSync(file, 'utf-8'))?.prompt).toBe('PROMPT REFINADO')
        })
      })

      it('trocar o papel do nó REGENERA o prompt (o refino não cola no papel novo) e reescreve o sidecar', async () => {
        await withFakeHome(async (home, projectCwd) => {
          const file = putSidecar(home, 'terminal-troca', {
            name: 'Dev',
            color: 'var(--paper-teal)',
            prompt: 'PROMPT REFINADO DE DEV'
          })
          const { spawner, call } = spawnWith({ preset: 'claude', role: 'revisor', nodeId: 'terminal-troca', cwd: projectCwd })
          await call
          expect(spawner.mock.calls[0][2].env.ORKESTRA_ROLE).toBe(buildRolePrompt('revisor'))
          expect(parseRoleSidecar(readFileSync(file, 'utf-8'))).toEqual(buildRoleSidecar('revisor'))
        })
      })

      // Coerência com T5, que EXCLUI papéis livres (prompt vazio) da descoberta: um sidecar sem
      // prompt não é um refino, é ausência de instrução — não pode "vencer" o preset e zerar o papel.
      it('sidecar com prompt VAZIO não vence o preset (cai no comportamento de hoje)', async () => {
        await withFakeHome(async (home, projectCwd) => {
          putSidecar(home, 'terminal-vazio', { name: 'Dev', color: 'var(--paper-teal)', prompt: '' })
          const { spawner, call } = spawnWith({ preset: 'claude', role: 'dev', nodeId: 'terminal-vazio', cwd: projectCwd })
          await call
          expect(spawner.mock.calls[0][2].env.ORKESTRA_ROLE).toBe(buildRolePrompt('dev'))
        })
      })

      it('sidecar corrompido/não-parseável degrada para o comportamento de hoje (sem lançar)', async () => {
        await withFakeHome(async (home, projectCwd) => {
          const file = putSidecar(home, 'terminal-lixo', '{ isto não é json')
          const { spawner, call } = spawnWith({ preset: 'claude', role: 'dev', nodeId: 'terminal-lixo', cwd: projectCwd })
          await expect(call).resolves.toBeTruthy()
          expect(spawner.mock.calls[0][2].env.ORKESTRA_ROLE).toBe(buildRolePrompt('dev'))
          // e o arquivo ilegível é regenerado a partir do papel do nó.
          expect(parseRoleSidecar(readFileSync(file, 'utf-8'))).toEqual(buildRoleSidecar('dev'))
        })
      })

      it('papel importado com sidecar refinado usa o refino (o registro não sobrepõe)', async () => {
        await withFakeHome(async (home, projectCwd) => {
          mkdirSync(join(home, '.orkestra'), { recursive: true })
          writeImportedRoles(
            [{ name: 'Auditor', color: 'var(--text-2)', prompt: 'prompt importado' }],
            join(home, '.orkestra', 'roles.json')
          )
          putSidecar(home, 'terminal-imp3', { name: 'Auditor', color: 'var(--text-2)', prompt: 'PROMPT REFINADO' })
          const { spawner, call } = spawnWith({ preset: 'claude', role: 'Auditor', nodeId: 'terminal-imp3', cwd: projectCwd })
          await call
          expect(spawner.mock.calls[0][2].env.ORKESTRA_ROLE).toBe('PROMPT REFINADO')
        })
      })

      it('nodeId inseguro não lê o sidecar de ninguém (nem escreve)', async () => {
        await withFakeHome(async (home, projectCwd) => {
          putSidecar(home, 'vitima', { name: 'Dev', color: 'var(--paper-teal)', prompt: 'PROMPT REFINADO' })
          const { spawner, call } = spawnWith({
            preset: 'claude',
            role: 'dev',
            nodeId: '../agents/vitima',
            cwd: projectCwd
          })
          await call
          expect(spawner.mock.calls[0][2].env.ORKESTRA_ROLE).toBe(buildRolePrompt('dev'))
          // o sidecar da vítima segue intocado
          expect(
            parseRoleSidecar(readFileSync(join(home, '.orkestra', 'agents', 'vitima', 'role.json'), 'utf-8'))?.prompt
          ).toBe('PROMPT REFINADO')
        })
      })
    })
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
