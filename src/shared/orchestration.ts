export interface MirrorNode {
  id: string
  type: string
  name: string
  content?: string
  role?: string
  preset?: string
  monitor?: boolean
  // T5 (Modo Maestro como toggle): true quando este terminal é um Maestro (data.maestro no nó).
  // Carregado no espelho para o gating server-side de T6 (isMaestro) decidir se o `from` de um
  // recruit/connect/dismiss pode gerenciar. Ausente/undefined = terminal comum (retrocompat).
  maestro?: boolean
  // T9 (notas .md em disco): caminho do arquivo `.md` vinculado a uma NOTA (data.filePath). O
  // `orq context` o expõe ao agente, que pode ler/editar o arquivo com as próprias ferramentas —
  // é o que torna a nota memória DURÁVEL de verdade. Ausente = nota só-no-canvas (comportamento
  // de sempre).
  filePath?: string
}

// Ligações do canvas no espelho — o suficiente para o servidor resolver "o que está conectado a
// este terminal" (usado por GET /context → orq context). Direção não importa para contexto: um
// bloco ligado em qualquer ponta é legível pelo agente.
export interface MirrorEdge {
  source: string
  target: string
}

export interface CanvasMirror {
  nodes: MirrorNode[]
  edges: MirrorEdge[]
}

// Estado reportado por um portal (Fase 9): último {url,title,text} capturado no did-finish-load
// do seu <webview> (ver PortalNode.tsx). Não inclui `name` — é a própria chave de lookup em
// GET /portal?name=... / opts.getPortalState(name); o canal IPC portal:state carrega name +
// PortalState juntos (ver preload/index.ts).
export interface PortalState {
  url: string
  title: string
  text: string
  // T4 (snapshot --dom): lista serializada dos elementos INTERATIVOS da página (uma linha por
  // elemento: "[tag] <seletor> — <rótulo>"), capturada no did-finish-load ao lado de `text` (mesmo
  // canal portal:state, sem round-trip novo) e devolvida em GET /portal. Opcional para retrocompat:
  // estados legados / portais que ainda não recarregaram não têm o campo. Só é impresso quando o
  // agente pede `orq portal snapshot --dom`.
  dom?: string
}

// T1 (round-trip de portal click/fill): resultado de uma ação de portal que o renderer devolve ao
// main. `ok` = a ação achou o elemento e agiu (clickScript/fillScript já retornam esse booleano);
// o servidor o repassa como JSON `{ok}` ao orq. Tipo próprio (não só `boolean`) para as ações
// futuras (T7 screenshot) estenderem com campos extras sem quebrar o contrato.
export interface PortalActionResult {
  ok: boolean
  // T7 (screenshot): caminho do PNG gravado pelo main (só presente quando a ação é uma captura
  // bem-sucedida). click/fill seguem devolvendo só o booleano.
  path?: string
}

export type OrchestrationCommand =
  | { type: 'updateNote'; target: string; content: string; from?: string }
  // T4: preset opcional — quando omitido, o renderer herda o preset do Maestro (nó `from`); o
  // default seguro é 'shell' (ver resolveRecruitPreset em useOrchestrationSync).
  | { type: 'recruit'; name: string; preset?: string; role?: string; from?: string }
  | { type: 'dismiss'; target: string }
  | { type: 'connect'; source: string; target: string }
  // T7 (reassign): troca o papel de um recruta MID-TASK, preservando o nó (posição/nome/conexões) —
  // só o PROCESSO reinicia, para o agente nascer com o novo ORKESTRA_ROLE no env (o wrapper `claude`
  // o injeta via --append-system-prompt no spawn; ver installOrq.ts/registerPtyIpc.ts). `target` é o
  // NOME do terminal a reatribuir (best-effort por nome, como dismiss/connect); `role` é o papel novo
  // (v1: um dos PRESET_ROLES). `from` (ORKESTRA_NODE_ID do Maestro) serve ao gating de T6.
  | { type: 'reassign'; target: string; role: string; from?: string }
  | { type: 'portalOpen'; target: string; url: string }
  // requestId (T1): carimbado pelo main ao relayar a ação para o renderer; quando presente, o
  // renderer devolve o booleano de sucesso via IPC 'portal:result' (fecha o round-trip). Ausente
  // (comando legado/externo) → fire-and-forget silencioso como antes.
  | { type: 'portalClick'; target: string; selector: string; requestId?: string }
  | { type: 'portalFill'; target: string; selector: string; text: string; requestId?: string }
  | { type: 'portalEval'; target: string; js: string }
  // T2 (navegação dedicada): back/forward/reload aplicados via métodos NATIVOS do WebviewTag
  // (goBack/goForward/reload) — sem injeção de script. `action` é uma união FECHADA (enum), não
  // string livre: não há superfície de injeção. Fire-and-forget (idempotente/barato).
  | { type: 'portalNavigate'; target: string; action: 'back' | 'forward' | 'reload' }
  // T3 (rolagem dedicada): x/y numéricos (coeridos no orq e validados no servidor); o renderer roda
  // scrollScript(x,y), cuja coerção numérica é a barreira anti-injeção.
  | { type: 'portalScroll'; target: string; x: number; y: number }
  // T5 (agente cria portais): adiciona um nó portal ao canvas. `url` opcional — quando presente, o
  // renderer a valida com isSafePortalUrl ANTES de navegar (guard SEC-3, obrigatório); URL insegura
  // cria o portal mas não navega. Portal novo nasce com partition isolada própria (addPortalNode →
  // partitionForPortal) e herda o hardenSession via session-created.
  | { type: 'portalCreate'; name: string; url?: string }
  // T7 (Onda 3 — o agente "vê"): captura a página do portal via webview.capturePage() no renderer;
  // o PNG volta em base64 pelo portal:result e o MAIN o grava em os.tmpdir() (o caminho curto vai
  // no stdout do orq — nunca o base64, que pode passar de 1MB). Requer o round-trip do T1
  // (requestId); sem ele o comando não tem como devolver o caminho.
  | { type: 'portalScreenshot'; target: string; requestId?: string }
