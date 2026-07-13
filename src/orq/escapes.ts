// Interpreta sequências de escape estilo C no argumento de `orq ask --raw`, para permitir enviar
// bytes de controle a um TUI/pager pelo terminal (ex.: "\x03" = Ctrl+C, "\e[B" = seta pra baixo,
// "\r" = Enter). Só as sequências abaixo são reconhecidas; qualquer outra barra invertida (ou uma
// barra no fim da string, ou um "\x" sem 2 dígitos hex) é mantida literal — nunca lança.
export function interpretEscapes(input: string): string {
  let out = ''
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    // Barra invertida no fim da string não inicia sequência — sai literal.
    if (ch !== '\\' || i === input.length - 1) {
      out += ch
      continue
    }
    const next = input[i + 1]
    switch (next) {
      case 'n':
        out += '\n'
        i++
        break
      case 'r':
        out += '\r'
        i++
        break
      case 't':
        out += '\t'
        i++
        break
      case 'e':
        out += '\x1b' // ESC — início da maioria das sequências de terminal (setas, F-keys)
        i++
        break
      case '0':
        out += '\x00'
        i++
        break
      case '\\':
        out += '\\'
        i++
        break
      case 'x': {
        const hex = input.slice(i + 2, i + 4)
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16))
          i += 3 // consome \, x e os 2 dígitos
        } else {
          out += ch // "\x" sem 2 hex à frente -> barra invertida literal
        }
        break
      }
      default:
        out += ch // barra invertida seguida de algo não reconhecido -> literal
    }
  }
  return out
}
