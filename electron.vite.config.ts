import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { resolve, join } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// O `orq` é um segundo entry point do build do main: um CLI Node standalone (sem Electron),
// que termina copiado para ~/.orkestra/bin/orq por installOrq(). O Rollup emite o chunk desse
// entry como out/main/orq.js (mesmo outDir do index.js — colocá-lo fora do outDir do main
// diretamente via entryFileNames é rejeitado pelo Rollup: "file name outside output directory").
// Este plugin move o arquivo já emitido para out/orq/bin.js (irmão de out/main) depois que o
// Rollup grava tudo em disco. O shebang `#!/usr/bin/env node` de src/orq/bin.ts é preservado
// nativamente pelo Rollup (o chunk é o facade module de um entry, então o código já sai do
// `writeBundle` com o shebang na primeira linha) — só copiamos os bytes como estão.
function relocateOrqBin(): Plugin {
  return {
    name: 'relocate-orq-bin',
    writeBundle(options, bundle) {
      const outDir = options.dir ?? resolve('out/main')
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.name === 'orq') {
          const src = join(outDir, file.fileName)
          const destDir = resolve(outDir, '..', 'orq')
          mkdirSync(destDir, { recursive: true })
          writeFileSync(join(destDir, 'bin.js'), readFileSync(src))
          rmSync(src)
        }
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), relocateOrqBin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          orq: resolve('src/orq/bin.ts')
        }
      }
    }
  },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
