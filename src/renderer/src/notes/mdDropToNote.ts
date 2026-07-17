// T8 (Notas) — arrastar um arquivo de texto do Finder para o canvas vira uma NOTA com aquele
// conteúdo. Puro: decide se a extensão é de nota e converte {filename, text} -> {name, html}.
//
// IMPORTANTE (limitação declarada, até a T9): o conteúdo é COPIADO para dentro da nota — o vínculo
// com o arquivo original NÃO é mantido (editar a nota não muda o arquivo, e vice-versa). O vínculo
// vivo com `.md` em disco é a T9; o Canvas informa isso no title do gesto.
import { markdownToHtml } from '../markdown/markdownToHtml'

const NOTE_EXTENSIONS = new Set(['md', 'markdown', 'txt'])

export function mdFileToNoteData(filename: string, text: string): { name: string; html: string } | null {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return null
  const ext = filename.slice(dot + 1).toLowerCase()
  if (!NOTE_EXTENSIONS.has(ext)) return null
  // `.txt` também passa pelo markdownToHtml de propósito: texto plano vira parágrafos com o HTML
  // ESCAPADO (nunca cru — SEC-1: o data.html volta do disco sem sanitização), e um txt que por
  // acaso tenha marcas Markdown só ganha formatação de graça.
  return { name: filename.slice(0, dot), html: markdownToHtml(text) }
}
