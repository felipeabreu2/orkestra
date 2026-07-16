import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// O cmTheme é CSS-em-JS: um `var(--typo)` não quebra nada em runtime — a propriedade simplesmente
// não aplica e o editor fica com a cor default do CodeMirror (o "tema berrante" que não queremos),
// silenciosamente. Este teste lê o FONTE do tema, extrai todo var(--x) e exige que o token exista
// em styles/tokens.css. É o guarda que compensa o cmTheme não ter cobertura de render.
const fonte = readFileSync(resolve(__dirname, 'cmTheme.ts'), 'utf8')
const tokensCss = readFileSync(resolve(__dirname, '../styles/tokens.css'), 'utf8')

// só o CÓDIGO: os comentários do arquivo citam `var(--token)` e `dark: true` como exemplo, e
// varrê-los daria falso positivo nas asserções abaixo.
const codigo = fonte.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
const referenciados = [...codigo.matchAll(/var\((--[a-z0-9-]+)\)/gi)].map((m) => m[1])

describe('cmTheme — integração com os tokens do projeto', () => {
  it('referencia tokens (o tema não é decorativo)', () => {
    expect(referenciados.length).toBeGreaterThan(10)
  })

  it('todo var(--token) usado existe em styles/tokens.css', () => {
    const ausentes = [...new Set(referenciados)].filter((t) => !tokensCss.includes(`${t}:`))
    expect(ausentes).toEqual([])
  })

  it('usa o accent do projeto (azul) para cursor/seleção', () => {
    expect(referenciados).toContain('--accent')
    expect(referenciados).toContain('--accent-weak')
  })

  it('não tem cor crua (hex/rgb) — tudo passa pelos tokens, que são tema-aware', () => {
    expect(codigo).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(codigo).not.toMatch(/\brgba?\(/i)
  })

  it('não fixa um tema: sem flag dark/light no EditorView.theme', () => {
    // `EditorView.theme(spec, { dark: true })` fixaria o modo — o app troca de tema em runtime e o
    // var() já resolve na cascata. Ver o comentário de cabeçalho do cmTheme.
    expect(codigo).not.toMatch(/dark:\s*(true|false)/)
  })
})
