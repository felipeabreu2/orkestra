import { writeFileSync, readFileSync, renameSync, existsSync, rmSync } from 'fs'
import type { CanvasSnapshot } from '../../shared/canvasSnapshot'

export class CanvasPersistence {
  constructor(private filePath: string) {}

  load(): CanvasSnapshot | null {
    try {
      if (!existsSync(this.filePath)) return null
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as CanvasSnapshot).nodes)) {
        return null
      }
      return parsed as CanvasSnapshot
    } catch {
      return null
    }
  }

  save(snapshot: CanvasSnapshot): void {
    const tmp = `${this.filePath}.tmp`
    try {
      writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf-8')
      renameSync(tmp, this.filePath)
    } catch (err) {
      console.error('[CanvasPersistence] save failed:', err)
      try {
        if (existsSync(tmp)) rmSync(tmp)
      } catch {
        /* ignore cleanup failure */
      }
    }
  }
}
