// Batuta · T5 — índice cross-projeto da command palette, PURO e agnóstico de processo (vive em
// shared porque o MAIN o gera a partir dos projects/<id>.json e o RENDERER consome o tipo/os itens
// na paleta — mesmo motivo de contextResolver). Sem fs, sem DOM, sem React.
//
// SEGURANÇA (incidente-corrupcao-cross-project): este índice é SOMENTE LEITURA. Ele só descreve
// "que nós existem em cada projeto" para a busca; nada aqui grava, e a execução (trocar de projeto
// + focar) é escopada por id no renderer. O projeto ATIVO é PULADO de propósito: seus nós já vêm
// do canvasStore ao vivo (o disco pode estar atrás de edições não-flushadas), então incluí-lo aqui
// duplicaria itens e poderia mostrar estado velho.

export interface CrossProjectNode {
  nodeId: string
  projectId: string
  projectName: string
  type: string
  // Rótulo curto para exibição (o nome do projeto é anexado na montagem do item da paleta, não
  // aqui — assim o rótulo puro fica reutilizável e o tie-break "label mais curto" do rankItems
  // favorece naturalmente o projeto ATIVO, cujos itens locais não carregam o sufixo do projeto).
  label: string
  // Corpo inteiro (notas), para a busca casar por conteúdo — mesmo papel do searchText local (T2).
  searchText?: string
}

export interface ProjectCanvasForIndex {
  project: { id: string; name: string }
  // null = canvas ausente/corrupto (o ProjectManager já degrada assim) — ignorado sem quebrar.
  nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }> | null
}

// Só nós que fazem sentido buscar/ir-para. Grupos são contêineres visuais; não entram.
const SEARCHABLE = new Set(['terminal', 'note', 'portal', 'filetree'])

// Decodificação MÍNIMA das entidades que o serializador de HTML da nota emite (markdownToHtml
// escapa `& < >`, e o espaço não-quebrável aparece em edições). Suficiente para busca em texto
// plano — nunca renderizado, então não há superfície de XSS aqui (é só string→string).
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

// Texto plano do corpo de uma nota, SEM DOM (o main não tem DOMParser; e para busca um strip de
// tags basta). É a versão "sem DOM" do noteText do renderer — a pequena divergência com o
// htmlToText (DOMParser inerte) é aceitável porque isto alimenta busca, não render nem segurança.
function notePlainText(data?: Record<string, unknown>): string {
  const html = typeof data?.html === 'string' ? data.html : ''
  if (html) {
    return decodeEntities(html.replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim()
  }
  const content = typeof data?.content === 'string' ? data.content : ''
  return content.trim()
}

function labelFor(type: string, data?: Record<string, unknown>): { label: string; searchText?: string } {
  if (type === 'terminal') return { label: (data?.name as string) || 'Terminal' }
  if (type === 'portal') return { label: (data?.name as string) || 'Portal' }
  if (type === 'note') {
    const txt = notePlainText(data)
    return { label: txt ? `Nota: ${txt.slice(0, 24)}` : 'Nota', searchText: txt || undefined }
  }
  if (type === 'filetree') return { label: 'Arquivos' }
  return { label: type || 'Nó' }
}

export function buildCrossProjectIndex(
  canvases: ProjectCanvasForIndex[],
  activeProjectId: string | null
): CrossProjectNode[] {
  const out: CrossProjectNode[] = []
  for (const { project, nodes } of canvases) {
    if (project.id === activeProjectId) continue // o ativo vem do canvasStore ao vivo
    if (!nodes) continue
    for (const n of nodes) {
      const type = n.type ?? ''
      if (!SEARCHABLE.has(type)) continue
      const { label, searchText } = labelFor(type, n.data)
      out.push({
        nodeId: n.id,
        projectId: project.id,
        projectName: project.name,
        type,
        label,
        searchText
      })
    }
  }
  return out
}
