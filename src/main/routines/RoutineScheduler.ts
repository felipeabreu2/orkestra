import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { cronMatches } from '../../shared/cron'
import type { Routine } from '../../shared/routines'

const TICK_MS = 30000

export class RoutineScheduler {
  private routines = new Map<string, Routine>()
  // Dedupe por minuto: minuto-epoch (now.getTime()/60000) da última vez que cada rotina
  // disparou. Evita disparo duplo se tick() rodar mais de uma vez dentro do mesmo minuto
  // (ex.: tick manual em teste, ou drift do setInterval de 30s).
  // Em memória (não persistido): após um restart do app o histórico de disparos é perdido,
  // então uma rotina pode disparar mais uma vez dentro do mesmo minuto-parede em que já havia
  // disparado antes do restart — aceitável (janela de no máximo 1 minuto, sem duplicação real).
  private lastFired = new Map<string, number>()
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly onFire: (r: Routine) => void
  private readonly now: () => Date
  private readonly persistPath?: string

  constructor(opts: { onFire: (r: Routine) => void; now?: () => Date; persistPath?: string }) {
    this.onFire = opts.onFire
    this.now = opts.now ?? (() => new Date())
    this.persistPath = opts.persistPath
  }

  tick(): void {
    const now = this.now()
    const minute = Math.floor(now.getTime() / 60000)
    for (const r of this.routines.values()) {
      if (!r.enabled) continue
      if (this.lastFired.get(r.id) === minute) continue
      try {
        if (!cronMatches(r.schedule, now)) continue
        this.lastFired.set(r.id, minute)
        this.onFire(r)
      } catch (err) {
        // Isolamento por rotina: um schedule malformado ou um onFire que lança não pode
        // derrubar o tick inteiro (o setInterval em start() não tem handler de erro) nem
        // impedir que as demais rotinas disparem.
        console.error('[routine] tick falhou', r.id, err)
      }
    }
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  add(r: Omit<Routine, 'id'>): Routine {
    if (typeof r.name !== 'string') throw new Error('rotina inválida: name')
    if (typeof r.schedule !== 'string' || r.schedule.trim() === '') throw new Error('rotina inválida: schedule')
    if (typeof r.target !== 'string' || r.target.trim() === '') throw new Error('rotina inválida: target')
    if (typeof r.command !== 'string' || r.command.trim() === '') throw new Error('rotina inválida: command')
    const routine: Routine = { ...r, id: randomUUID() }
    this.routines.set(routine.id, routine)
    void this.persist()
    return routine
  }

  list(): Routine[] {
    return [...this.routines.values()]
  }

  remove(id: string): void {
    this.routines.delete(id)
    this.lastFired.delete(id)
    void this.persist()
  }

  setEnabled(id: string, enabled: boolean): void {
    const r = this.routines.get(id)
    if (!r) return
    r.enabled = enabled
    void this.persist()
  }

  private async persist(): Promise<void> {
    if (!this.persistPath) return
    const tmp = `${this.persistPath}.tmp`
    try {
      await mkdir(dirname(this.persistPath), { recursive: true })
      await writeFile(tmp, JSON.stringify([...this.routines.values()], null, 2))
      await rename(tmp, this.persistPath)
    } catch {
      await rm(tmp, { force: true }).catch(() => {})
      // não-fatal: falha ao persistir não deve derrubar a rotina em memória (mesmo padrão do FloorManager)
    }
  }

  async loadPersisted(): Promise<void> {
    if (!this.persistPath) return
    try {
      const raw = await readFile(this.persistPath, 'utf8')
      const arr = JSON.parse(raw) as Routine[]
      if (Array.isArray(arr)) {
        for (const r of arr) {
          // Guarda forte: exige as 5 chaves string + enabled boolean. Um routines.json
          // corrompido ou editado à mão (ex.: schedule ausente) não pode entrar no scheduler
          // vivo — cronMatches() lançaria em cada tick e derrubaria o processo principal
          // se algum item malformado escapasse desta checagem.
          if (
            r &&
            typeof r.id === 'string' &&
            typeof r.name === 'string' &&
            typeof r.schedule === 'string' &&
            typeof r.target === 'string' &&
            typeof r.command === 'string' &&
            typeof r.enabled === 'boolean'
          ) {
            this.routines.set(r.id, r)
          }
        }
      }
    } catch {
      // sem persistência ainda
    }
  }
}
