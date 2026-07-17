import { isSafeHref } from './markdown'

// Serializa o HTML da nota (TipTap) para Markdown — inverso do markdownToHtml. Habilitador do toggle
// raw (T7) e das notas .md em disco (T9). Escopo v1 = o subconjunto que o StarterKit + extensões
// emitem: heading (h1-h6), parágrafo, strong/em, code inline, bloco de código (pre>code), listas
// (ul/ol), citação (blockquote), régua (hr), link (a — só href seguro), imagem (img → ![alt](src))
// e quebra dura (br). Marcas FORA do subconjunto (cor/fonte/tamanho via <span style>, sublinhado,
// tachado) degradam para o texto puro — Markdown não as representa; é perda aceita e documentada
// (mesma limitação que o toggle raw assume). Imagens não voltam pelo markdownToHtml atual (o parser
// não tem sintaxe de imagem), então também se perdem no round-trip via raw.
//
// SEC-1 (auditoria 2026-07-14): usa DOMParser (documento INERTE), NUNCA `el.innerHTML`. O HTML da
// nota vem do disco sem sanitização e o renderer é privilegiado — parseFromString cria um documento
// desconectado que não executa scripts nem carrega recursos; só lemos texto e atributos.

const HEADINGS: Record<string, number> = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 }

function imageMarkdown(el: Element): string {
  const src = el.getAttribute('src') ?? ''
  const alt = el.getAttribute('alt') ?? ''
  return `![${alt}](${src})`
}

// Conteúdo inline de um elemento → Markdown. Desembrulha <p>/<div> internos (o TipTap embrulha o
// conteúdo do <li> num <p>) para não gerar blocos dentro de uma linha.
function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as Element
  switch (el.tagName) {
    case 'STRONG':
    case 'B':
      return `**${inlineChildren(el)}**`
    case 'EM':
    case 'I':
      return `*${inlineChildren(el)}*`
    case 'CODE':
      return `\`${el.textContent ?? ''}\``
    case 'A': {
      const href = el.getAttribute('href') ?? ''
      const text = inlineChildren(el)
      return isSafeHref(href) ? `[${text}](${href})` : text
    }
    case 'IMG':
      return imageMarkdown(el)
    case 'BR':
      return '\n'
    default:
      // span (cor/fonte), u, s, p/div aninhado, etc. → só o conteúdo textual.
      return inlineChildren(el)
  }
}

function inlineChildren(el: Element): string {
  let out = ''
  el.childNodes.forEach((n) => {
    out += serializeInline(n)
  })
  return out
}

function serializeBlockElement(el: Element): string {
  const tag = el.tagName
  if (HEADINGS[tag]) return `${'#'.repeat(HEADINGS[tag])} ${inlineChildren(el).trim()}`
  switch (tag) {
    case 'P':
    case 'DIV':
      return inlineChildren(el).trim()
    case 'UL':
      return listItems(el).map((it) => `- ${it}`).join('\n')
    case 'OL':
      return listItems(el).map((it, i) => `${i + 1}. ${it}`).join('\n')
    case 'PRE':
      return `\`\`\`\n${el.textContent ?? ''}\n\`\`\``
    case 'BLOCKQUOTE': {
      const inner = serializeBlocks(el).join('\n\n')
      return inner
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n')
    }
    case 'HR':
      return '---'
    case 'IMG':
      return imageMarkdown(el)
    default:
      // Contêiner desconhecido → tenta serializar os filhos como blocos.
      return serializeBlocks(el).join('\n\n')
  }
}

// Só os <li> diretos; cada um vira o Markdown inline do seu conteúdo (desembrulhando o <p> interno).
function listItems(list: Element): string[] {
  const items: string[] = []
  list.childNodes.forEach((n) => {
    if (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'LI') {
      items.push(inlineChildren(n as Element).trim())
    }
  })
  return items
}

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'UL',
  'OL',
  'PRE',
  'BLOCKQUOTE',
  'HR',
  'IMG'
])

function isBlock(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName)
}

// Percorre os filhos de um contêiner produzindo blocos Markdown. Nós inline soltos (texto/negrito
// direto no body) são agrupados num parágrafo implícito.
function serializeBlocks(parent: ParentNode | Element): string[] {
  const blocks: string[] = []
  let inlineBuf = ''
  const flush = (): void => {
    const t = inlineBuf.trim()
    if (t) blocks.push(t)
    inlineBuf = ''
  }
  parent.childNodes.forEach((node) => {
    if (isBlock(node)) {
      flush()
      const b = serializeBlockElement(node as Element)
      if (b) blocks.push(b)
    } else {
      inlineBuf += serializeInline(node)
    }
  })
  flush()
  return blocks
}

export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return serializeBlocks(doc.body).join('\n\n')
}
