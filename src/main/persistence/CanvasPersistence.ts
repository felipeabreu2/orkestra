import { writeFileSync, readFileSync, renameSync, existsSync } from 'fs'
import type { CanvasSnapshot } from '../../shared/canvasSnapshot'

export class CanvasPersistence {
  constructor(private filePath: string) {}

  load(): CanvasSnapshot | null {
    try {
      if (!existsSync(this.filePath)) return null
      const raw = readFileSync(this.filePath, 'utf-8')
      return JSON.parse(raw) as CanvasSnapshot
    } catch {
      return null
    }
  }

  save(snapshot: CanvasSnapshot): void {
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf-8')
    renameSync(tmp, this.filePath)
  }
}
