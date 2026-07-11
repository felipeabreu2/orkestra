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
  const headers = { 'x-orkestra-token': token, 'content-type': 'application/json' }

  const [cmd, sub, ...rest] = argv
  try {
    if (cmd === 'list') {
      const res = await fetch(`${base}/list`, { headers })
      const mirror = (await res.json()) as { nodes: { id: string; type: string; name: string }[] }
      const out = mirror.nodes.map((n) => `${n.type}\t${n.name}\t${n.id}`).join('\n')
      return { code: 0, out }
    }
    if (cmd === 'note' && sub === 'write') {
      const content = rest.join(' ')
      const res = await fetch(`${base}/note`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ target: '', content })
      })
      return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : `orq: erro ${res.status}` }
    }
    if (cmd === 'ask') {
      // --wait pode aparecer em QUALQUER posição depois de "ask" — inclusive logo após o
      // comando, antes do nome do agente (ex.: "ask --wait Dev oi", "ask Dev --wait oi" ou
      // "ask Dev oi --wait"). Por isso filtramos a flag fora de todas as palavras restantes
      // (argv.slice(1), não apenas `rest`) antes de separar nome e prompt — usar `sub`/`rest`
      // (desestruturados posicionalmente antes deste bloco) trataria "--wait" como o próprio
      // nome do agente quando ele aparecesse imediatamente após "ask". Sem --wait, o corpo e o
      // retorno permanecem idênticos à Fase 6 (fire-and-forget); com --wait, pedimos wait:true
      // e imprimimos o output devolvido em vez do "ok" de sempre.
      const argsAfterCmd = argv.slice(1)
      const wait = argsAfterCmd.includes('--wait')
      const [name, ...promptWords] = argsAfterCmd.filter((w) => w !== '--wait')
      const prompt = promptWords.join(' ')
      const body: { name: string; prompt: string; wait?: true } = { name, prompt }
      if (wait) body.wait = true
      const res = await fetch(`${base}/ask`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })
      if (wait) {
        if (!res.ok) return { code: 1, out: `orq: erro ${res.status}` }
        const data = (await res.json()) as { output: string }
        return { code: 0, out: data.output }
      }
      return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : `orq: erro ${res.status}` }
    }
    if (cmd === 'check') {
      const res = await fetch(`${base}/check?name=${encodeURIComponent(sub ?? '')}`, { headers })
      if (!res.ok) return { code: 1, out: `orq: erro ${res.status}` }
      const data = (await res.json()) as { output: string }
      return { code: 0, out: data.output }
    }
    if (cmd === 'recruit') {
      const [preset, role] = rest
      const res = await fetch(`${base}/recruit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: sub, preset, role })
      })
      return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : `orq: erro ${res.status}` }
    }
    if (cmd === 'dismiss') {
      const res = await fetch(`${base}/dismiss`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ target: sub })
      })
      return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : `orq: erro ${res.status}` }
    }
    if (cmd === 'connect') {
      const [target] = rest
      const res = await fetch(`${base}/connect`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ source: sub, target })
      })
      return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : `orq: erro ${res.status}` }
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
        return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : `orq: erro ${res.status}` }
      }
      if (sub === 'click') {
        const selector = args.join(' ')
        const res = await fetch(`${base}/portal/click`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target, selector })
        })
        return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : `orq: erro ${res.status}` }
      }
      if (sub === 'fill') {
        const [selector, ...textWords] = args
        const text = textWords.join(' ')
        const res = await fetch(`${base}/portal/fill`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target, selector, text })
        })
        return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : `orq: erro ${res.status}` }
      }
      if (sub === 'eval') {
        const js = args.join(' ')
        const res = await fetch(`${base}/portal/eval`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target, js })
        })
        return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : `orq: erro ${res.status}` }
      }
      if (sub === 'snapshot') {
        const res = await fetch(`${base}/portal?name=${encodeURIComponent(target ?? '')}`, { headers })
        if (!res.ok) return { code: 1, out: `orq: erro ${res.status}` }
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
        'orq: comando desconhecido.\nUso: orq list | orq note write "<conteúdo>" | orq ask "<nome>" "<prompt>" ["--wait"] | orq check "<nome>" | orq recruit "<nome>" "<preset>" ["<papel>"] | orq dismiss "<nome>" | orq connect "<A>" "<B>" | orq portal open|navigate "<nome>" "<url>" | orq portal click "<nome>" "<seletor>" | orq portal fill "<nome>" "<seletor>" "<texto>" | orq portal eval "<nome>" "<js>" | orq portal snapshot "<nome>"\nNota: recruit/connect/dismiss são best-effort por nome; comandos executam em sequência (seguro encadear), nunca em paralelo (sem &). Use "orq list" para confirmar a escalação antes de conectar. Automação de portal é fire-and-forget (open/click/fill/eval não confirmam sucesso); use "orq portal snapshot" para inspecionar o estado após. ask é fire-and-forget por padrão; com --wait (em qualquer posição), bloqueia até o agente ficar ocioso e imprime o output acumulado.'
    }
  } catch (err) {
    return { code: 1, out: `orq: falha de conexão: ${String(err)}` }
  }
}
