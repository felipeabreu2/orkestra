import * as pty from 'node-pty'
import type { PtySpawner } from './PtyManager'

export const nodePtySpawner: PtySpawner = (file, args, opts) => {
  const p = pty.spawn(file, args, {
    name: 'xterm-color',
    cwd: opts.cwd,
    env: opts.env as { [key: string]: string },
    cols: opts.cols,
    rows: opts.rows
  })
  return {
    onData: (cb) => { p.onData(cb) },
    onExit: (cb) => { p.onExit(({ exitCode }) => cb({ exitCode })) },
    write: (d) => p.write(d),
    resize: (c, r) => p.resize(c, r),
    kill: () => p.kill()
  }
}
