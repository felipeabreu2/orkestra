// T6 (Notas) — colar/arrastar IMAGEM para dentro da nota, lógica pura (o fio do editor vive em
// NoteNode.tsx; aqui só o que é testável).
//
// A imagem entra como DATA URI dentro do data.html — ou seja, dentro do snapshot JSON do projeto.
// Por isso o TETO de bytes existe e é deliberadamente apertado: um print de tela comum (raster,
// centenas de KB) cabe; um TIFF de 50MB não — sem o teto, uma colagem descuidada inflaria o
// <id>.json inteiro (que é reescrito a cada save do canvas). A migração de imagem para ARQUIVO ao
// lado da nota é da T9 (.md em disco).
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

// Primeiro item de imagem de uma lista de DataTransferItem (clipboard ou drop). Item de imagem cujo
// getAsFile() devolve null (acontece com clipboards sintéticos) é pulado — tenta o próximo.
export function pickImageFile(
  items: ReadonlyArray<{ type: string; getAsFile: () => File | null }>
): File | null {
  for (const it of items) {
    if (!it.type.startsWith('image/')) continue
    const file = it.getAsFile()
    if (file) return file
  }
  return null
}

// O que o FileReader produziu é mesmo uma imagem raster em data URI? Allowlist EXPLÍCITA de
// formatos raster — SVG fica de fora de propósito (SVG pode carregar script; em <img> ele não
// executa, mas o HTML da nota vem do disco sem sanitização e o renderer é privilegiado — SEC-1 —
// então não damos nem a primeira dobra dessa superfície; screenshot colado é sempre raster).
const RASTER_DATA_URI = /^data:image\/(png|jpeg|jpg|gif|webp|avif|bmp);base64,[A-Za-z0-9+/=]+$/

export function isImageDataUri(s: string): boolean {
  return RASTER_DATA_URI.test(s)
}
