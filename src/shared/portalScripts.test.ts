import { describe, it, expect } from 'vitest'
import { clickScript, fillScript, snapshotScript, scrollScript, domSnapshotScript } from './portalScripts'

describe('portalScripts', () => {
  it('clickScript embute o seletor com segurança (JSON.stringify)', () => {
    const s = clickScript('a.btn"; alert(1)//')
    expect(s).toContain(JSON.stringify('a.btn"; alert(1)//'))
    expect(s).toContain('querySelector')
  })
  it('fillScript seta value e dispara evento input', () => {
    const s = fillScript('#in', 'olá "mundo"')
    expect(s).toContain(JSON.stringify('#in'))
    expect(s).toContain(JSON.stringify('olá "mundo"'))
    expect(s).toContain('input')
  })
  it('snapshotScript retorna url/title/text', () => {
    const s = snapshotScript()
    expect(s).toContain('location.href')
    expect(s).toContain('document.title')
  })
})

// T3 (scroll dedicado): scrollScript é o ÚNICO script novo que injeta um valor vindo do agente.
// A barreira anti-injeção aqui é a coerção numérica (Number() + Number.isFinite) que embute os args
// como literais numéricos — análoga ao JSON.stringify de click/fill. Testar o caso hostil é
// obrigatório (regra transversal de segurança do plano).
describe('scrollScript (T3)', () => {
  it('embute os números diretamente no window.scrollBy', () => {
    const s = scrollScript(0, 500)
    expect(s).toContain('window.scrollBy(0, 500)')
  })
  it('aceita negativos como números finitos', () => {
    const s = scrollScript(-120, 40)
    expect(s).toContain('window.scrollBy(-120, 40)')
  })
  it('coage argumentos não-numéricos para 0 — NUNCA embute a string crua (anti-injeção)', () => {
    const s = scrollScript('0); alert(1)//' as unknown as number, 'y' as unknown as number)
    expect(s).not.toContain('alert')
    expect(s).toContain('window.scrollBy(0, 0)')
  })
  it('coage NaN/Infinity para 0', () => {
    expect(scrollScript(NaN, Infinity)).toContain('window.scrollBy(0, 0)')
  })
})

// T4 (snapshot --dom): domSnapshotScript é um gerador PURO — coleta os elementos interativos da
// página e monta uma string de seletores+rótulos. A execução real é no <webview>, então aqui
// asseguramos o FORMATO do gerador (querySelectorAll das tags interativas, seletor por id/name/classe,
// omissão de senha, cap de tamanho com coerção numérica anti-injeção do maxChars).
describe('domSnapshotScript (T4)', () => {
  it('coleta os elementos interativos via querySelectorAll', () => {
    const s = domSnapshotScript()
    expect(s).toContain('querySelectorAll')
    expect(s).toContain('button')
    expect(s).toContain('input')
    expect(s).toContain('textarea')
    expect(s).toContain('select')
    expect(s).toContain('role=button')
  })
  it('monta o seletor sugerido a partir de id / name / classe', () => {
    const s = domSnapshotScript()
    expect(s).toContain("'#'") // tag#id
    expect(s).toContain('[name=') // tag[name="..."]
    expect(s).toContain("'.'") // tag.classe
  })
  it('omite o value de campos password e limita o tamanho (cap default 8000)', () => {
    const s = domSnapshotScript()
    expect(s).toContain('password')
    expect(s).toContain('.slice(0, 8000)')
  })
  it('respeita um maxChars custom', () => {
    expect(domSnapshotScript(100)).toContain('.slice(0, 100)')
  })
  it('coage um maxChars hostil para o default (anti-injeção — nunca embute a string crua)', () => {
    const s = domSnapshotScript('9999); alert(1)//' as unknown as number)
    expect(s).toContain('.slice(0, 8000)')
    expect(s).not.toContain('alert')
  })
})
