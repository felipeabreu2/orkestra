import { interpretEscapes } from './escapes'
import { describeSelf } from './whoami'
import { planSquad } from './squad'
import type { CanvasMirror } from '../shared/orchestration'

export async function runOrq(argv: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }> {
  // orq depende do fetch global (Node >= 18). Sem ele, cada comando abaixo lançaria um
  // ReferenceError cru vindo de dentro do try/catch genérico (mascarado como "falha de
  // conexão"). Detectamos isso aqui, na frente, e falhamos de forma amigável em stderr.
  if (typeof fetch === 'undefined') {
    process.stderr.write('orq: requer Node >= 18 (fetch global indisponível)\n')
    return { code: 1, out: '' }
  }
  const port = env.ORKESTRA_PORT
  const token = env.ORKESTRA_TOKEN
  if (!port || !token) {
    return { code: 1, out: 'orq: não está rodando dentro de um terminal do Orkestra (faltam ORKESTRA_PORT/ORKESTRA_TOKEN)' }
  }
  const base = `http://127.0.0.1:${port}`
  // x-orkestra-project (escopo de projeto, 2026-07-14): o projeto dono DESTE terminal, injetado
  // no env ao spawnar o pty. O servidor responde 409 quando ele não é mais o projeto ativo —
  // sem isso, um agente de um projeto em segundo plano mutaria/leria o canvas do projeto exibido.
  const headers = {
    'x-orkestra-token': token,
    'content-type': 'application/json',
    ...(env.ORKESTRA_PROJECT_ID ? { 'x-orkestra-project': env.ORKESTRA_PROJECT_ID } : {})
  }
  // Erro padrão de resposta não-ok: o 409 do escopo de projeto ganha uma orientação acionável
  // para o agente (é uma condição esperada, não um bug); o resto mantém o "orq: erro <status>".
  const errOut = (res: { status: number }): string =>
    res.status === 409
      ? 'orq: este terminal pertence a um projeto que NÃO está ativo no Orkestra — os comandos orq atuam sobre o projeto aberto na tela. Avise o usuário e aguarde ele voltar para o projeto deste terminal.'
      : res.status === 503
        ? 'orq: o Orkestra está sem janela ativa no momento — o comando NÃO foi aplicado. Abra/reative a janela e tente de novo.'
        : res.status === 403
          ? 'orq: este terminal não é um Maestro — os verbos de gerência (recruit/connect/dismiss) só têm efeito num Maestro. Peça ao usuário para ativar o Modo Maestro neste terminal.'
          : `orq: erro ${res.status}`

  const [cmd, sub, ...rest] = argv
  try {
    // T2 (quick win #7): "recrutas sabem quem são". Reusa GET /list (nenhum endpoint novo — herda o
    // escopo de projeto/409 de graça), resolve o próprio nó por ORKESTRA_NODE_ID e delega ao helper
    // puro describeSelf. Código != 0 quando o nó não pôde ser identificado (orq externo/legado sem
    // NODE_ID, ou id sem correspondência no espelho).
    const whoami = async (): Promise<{ code: number; out: string }> => {
      const res = await fetch(`${base}/list`, { headers })
      if (!res.ok) return { code: 1, out: errOut(res) }
      const mirror = (await res.json()) as CanvasMirror
      const nodeId = env.ORKESTRA_NODE_ID ?? ''
      const found = nodeId !== '' && mirror.nodes.some((n) => n.id === nodeId)
      return { code: found ? 0 : 1, out: describeSelf(mirror, nodeId) }
    }
    if (cmd === 'whoami') return await whoami()
    if (cmd === 'list') {
      // `list --me` é um alias de whoami (conveniência); whoami é o comando principal (mais legível).
      if (argv.includes('--me')) return await whoami()
      const res = await fetch(`${base}/list`, { headers })
      // Sem o check, um 409 (projeto não-ativo) viraria erro de parse de JSON mascarado como
      // "falha de conexão" — o agente precisa da mensagem real do errOut.
      if (!res.ok) return { code: 1, out: errOut(res) }
      const mirror = (await res.json()) as { nodes: { id: string; type: string; name: string }[] }
      const out = mirror.nodes.map((n) => `${n.type}\t${n.name}\t${n.id}`).join('\n')
      return { code: 0, out }
    }
    if (cmd === 'context') {
      // orq context -> reúne o conteúdo de TODAS as notas/arquivos/sites ligados a ESTE terminal
      // (em qualquer direção). Puxa sob demanda do servidor, então funciona a qualquer momento —
      // não depende de o texto ter sido digitado no prompt no instante da ligação.
      const from = encodeURIComponent(env.ORKESTRA_NODE_ID ?? '')
      const res = await fetch(`${base}/context?from=${from}`, { headers })
      if (!res.ok) return { code: 1, out: errOut(res) } // mesmo motivo do check em `list`
      const data = (await res.json()) as { context?: string }
      const ctx = (data.context ?? '').trim()
      return { code: 0, out: ctx || 'orq: nenhum bloco (nota/arquivo/site) conectado a este terminal.' }
    }
    if (cmd === 'note' && sub === 'write') {
      // orq note write "<texto>"                      -> nota ligada à saída deste terminal
      // orq note write --to "<nome-ou-id>" "<texto>"  -> nota específica (por id ou início do texto)
      let target = ''
      let words = rest
      const toIdx = words.indexOf('--to')
      if (toIdx !== -1 && words[toIdx + 1] !== undefined) {
        target = words[toIdx + 1]
        words = [...words.slice(0, toIdx), ...words.slice(toIdx + 2)]
      }
      const content = words.join(' ')
      // from = o nó deste terminal (env ORKESTRA_NODE_ID): sem --to, o renderer escreve na nota
      // ligada à SAÍDA deste terminal.
      const res = await fetch(`${base}/note`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ target, content, from: env.ORKESTRA_NODE_ID ?? '' })
      })
      return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : errOut(res) }
    }
    if (cmd === 'ask') {
      // As flags (--wait/--raw/--batch) podem aparecer em QUALQUER posição depois de "ask" —
      // inclusive logo após o comando, antes do nome do agente (ex.: "ask --wait Dev oi", "ask
      // Dev --wait oi" ou "ask Dev oi --wait"). Por isso as filtramos fora de todas as palavras
      // restantes (argv.slice(1), não apenas `rest`) antes de separar nome e prompt — usar
      // `sub`/`rest` (desestruturados posicionalmente antes deste bloco) trataria "--wait" como o
      // próprio nome do agente quando ele aparecesse imediatamente após "ask". Sem nenhuma flag, o
      // corpo e o retorno permanecem idênticos à Fase 6 (fire-and-forget).
      const argsAfterCmd = argv.slice(1)
      const wait = argsAfterCmd.includes('--wait')
      const raw = argsAfterCmd.includes('--raw')
      const batch = argsAfterCmd.includes('--batch')
      const positional = argsAfterCmd.filter((w) => w !== '--wait' && w !== '--raw' && w !== '--batch')
      const [name, ...promptWords] = positional
      const prompt = promptWords.join(' ')

      // --batch (R3): 1º positional é uma lista de nomes separados por vírgula; o mesmo prompt vai
      // para cada agente da lista, em sequência (nunca em paralelo — mesma disciplina do resto do
      // orq). Fire-and-forget: não combina com --wait/--raw (ignora ambos). Implementado só aqui no
      // cliente (N POSTs /ask), sem endpoint novo. Retorna quantos aceitaram.
      if (batch) {
        const targets = (name ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        if (targets.length === 0) {
          return { code: 2, out: 'orq: ask --batch exige uma lista de nomes separados por vírgula (ex.: orq ask --batch "Dev,Revisor" "rodem os testes")' }
        }
        let ok = 0
        for (const t of targets) {
          const res = await fetch(`${base}/ask`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: t, prompt })
          })
          if (res.ok) ok++
        }
        return { code: ok === targets.length ? 0 : 1, out: `enviado a ${ok}/${targets.length} agente(s)` }
      }

      // --raw (R2): envia os bytes ao pty SEM adicionar \n e sem esperar — o texto passa por
      // interpretEscapes (\\x03, \\e[B, \\r, ...) para permitir teclas de controle a TUIs/pagers.
      if (raw) {
        const res = await fetch(`${base}/ask`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name, prompt: interpretEscapes(prompt), raw: true })
        })
        return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : errOut(res) }
      }

      // --wait: pede wait:true e imprime o output devolvido em vez do "ok" de sempre.
      const body: { name: string; prompt: string; wait?: true } = { name, prompt }
      if (wait) body.wait = true
      const res = await fetch(`${base}/ask`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })
      if (wait) {
        if (!res.ok) return { code: 1, out: errOut(res) }
        const data = (await res.json()) as { output: string }
        return { code: 0, out: data.output }
      }
      return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : errOut(res) }
    }
    if (cmd === 'check') {
      const res = await fetch(`${base}/check?name=${encodeURIComponent(sub ?? '')}`, { headers })
      if (!res.ok) return { code: 1, out: errOut(res) }
      const data = (await res.json()) as { output: string }
      return { code: 0, out: data.output }
    }
    if (cmd === 'recruit') {
      const [preset, role] = rest
      // from = o nó deste terminal (ORKESTRA_NODE_ID), igual a `note write`: o renderer usa esse id
      // para posicionar o recruta ABAIXO do Maestro e auto-conectá-lo (T3). Ausente/vazio → o
      // renderer cai no fallback de cascata (comportamento legado).
      const res = await fetch(`${base}/recruit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: sub, preset, role, from: env.ORKESTRA_NODE_ID ?? '' })
      })
      return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : errOut(res) }
    }
    if (cmd === 'dismiss') {
      const res = await fetch(`${base}/dismiss`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ target: sub, from: env.ORKESTRA_NODE_ID ?? '' })
      })
      return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : errOut(res) }
    }
    if (cmd === 'connect') {
      const [target] = rest
      const res = await fetch(`${base}/connect`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ source: sub, target, from: env.ORKESTRA_NODE_ID ?? '' })
      })
      return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : errOut(res) }
    }
    if (cmd === 'squad') {
      // orq squad "<preset>" "<nota-spec>" — monta Dev+Revisor+Testador+Docs conectados à nota-spec,
      // em SEQUÊNCIA (recrutar antes de conectar), cada op sujeita ao gating de Maestro (403). Resumo
      // k/N como o `ask --batch`; aborta cedo num 403 (não é Maestro), com a orientação do errOut.
      const spec = rest[0]
      if (!sub || !spec) return { code: 1, out: 'uso: orq squad "<preset>" "<nota-spec>"' }
      const from = env.ORKESTRA_NODE_ID ?? ''
      const ops = planSquad({ preset: sub, spec })
      let ok = 0
      for (const op of ops) {
        const res =
          op.op === 'recruit'
            ? await fetch(`${base}/recruit`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: op.name, preset: op.preset, role: op.role, from })
              })
            : await fetch(`${base}/connect`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ source: op.source, target: op.target, from })
              })
        if (res.ok) ok++
        else if (res.status === 403) return { code: 1, out: errOut(res) }
      }
      return { code: ok === ops.length ? 0 : 1, out: `esquadrão montado: ${ok}/${ops.length} operações` }
    }
    if (cmd === 'portal') {
      // sub aqui é a ação (open/navigate/click/fill/eval/snapshot); rest[0] é o nome do portal
      // alvo, o resto são os argumentos específicos da ação (url/selector/texto/js).
      const [target, ...args] = rest
      if (sub === 'open' || sub === 'navigate') {
        const url = args.join(' ')
        const res = await fetch(`${base}/portal/open`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target, url })
        })
        return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : errOut(res) }
      }
      if (sub === 'click') {
        const selector = args.join(' ')
        const res = await fetch(`${base}/portal/click`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target, selector })
        })
        // T1: click deixou de ser cego. HTTP 200 = transporte ok (code 0); o corpo {ok:boolean}
        // diz se a ação achou o elemento e agiu — imprime `ok: true`/`ok: false` (elimina o
        // `orq portal snapshot` extra só para descobrir "cliquei em nada"). Não-ok de transporte
        // (503 sem janela, 409 projeto) segue a orientação padrão do errOut, com code 1.
        if (!res.ok) return { code: 1, out: errOut(res) }
        const data = (await res.json()) as { ok?: boolean }
        return { code: 0, out: `ok: ${data.ok === true}` }
      }
      if (sub === 'fill') {
        const [selector, ...textWords] = args
        const text = textWords.join(' ')
        const res = await fetch(`${base}/portal/fill`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target, selector, text })
        })
        // T1: idem click — fill confirma se o campo existia e foi preenchido (fillScript retorna
        // false quando o seletor não casa) via o mesmo corpo {ok:boolean}.
        if (!res.ok) return { code: 1, out: errOut(res) }
        const data = (await res.json()) as { ok?: boolean }
        return { code: 0, out: `ok: ${data.ok === true}` }
      }
      if (sub === 'eval') {
        const js = args.join(' ')
        const res = await fetch(`${base}/portal/eval`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target, js })
        })
        return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : errOut(res) }
      }
      if (sub === 'snapshot') {
        const res = await fetch(`${base}/portal?name=${encodeURIComponent(target ?? '')}`, { headers })
        if (!res.ok) return { code: 1, out: errOut(res) }
        const data = (await res.json()) as { url: string; title: string; text: string }
        return { code: 0, out: `url: ${data.url}\ntitle: ${data.title}\ntext: ${data.text}` }
      }
      return {
        code: 2,
        out:
          'orq: subcomando de portal desconhecido.\nUso: orq portal open|navigate "<nome>" "<url>" | orq portal click "<nome>" "<seletor>" | orq portal fill "<nome>" "<seletor>" "<texto>" | orq portal eval "<nome>" "<js>" | orq portal snapshot "<nome>"'
      }
    }
    return {
      code: 2,
      out:
        'orq: comando desconhecido.\nUso: orq list [--me] | orq whoami | orq context | orq note write [--to "<nome/id>"] "<conteúdo>" | orq ask "<nome>" "<prompt>" ["--wait" | "--raw" | "--batch"] | orq check "<nome>" | orq recruit "<nome>" "<preset>" ["<papel>"] | orq dismiss "<nome>" | orq connect "<A>" "<B>" | orq portal open|navigate "<nome>" "<url>" | orq portal click "<nome>" "<seletor>" | orq portal fill "<nome>" "<seletor>" "<texto>" | orq portal eval "<nome>" "<js>" | orq portal snapshot "<nome>"\nNota: recruit/connect/dismiss são best-effort por nome; comandos executam em sequência (seguro encadear), nunca em paralelo (sem &). Use "orq list" para confirmar a escalação antes de conectar. portal click/fill confirmam a ação (imprimem "ok: true" quando acharam o elemento e agiram, "ok: false" quando não) — sem precisar de snapshot extra; portal open/eval seguem fire-and-forget. Use "orq portal snapshot" para inspecionar o conteúdo da página. ask é fire-and-forget por padrão; com --wait (em qualquer posição), bloqueia até o agente ficar ocioso e imprime o output acumulado; com --raw, envia bytes brutos (interpreta \\x03, \\e[B, \\r, ...) para controlar TUIs/pagers, sem \\n final; com --batch, o 1º argumento é uma lista de nomes por vírgula ("Dev,Revisor") e o mesmo prompt vai para todos.'
    }
  } catch (err) {
    return { code: 1, out: `orq: falha de conexão: ${String(err)}` }
  }
}
