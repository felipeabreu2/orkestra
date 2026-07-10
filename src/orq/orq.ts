export async function runOrq(argv: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }> {
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
      const prompt = rest.join(' ')
      const res = await fetch(`${base}/ask`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: sub, prompt })
      })
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
    if (cmd === 'routine') {
      // sub aqui é a ação (list/add/remove); rest são os argumentos específicos da ação.
      if (sub === 'list') {
        const res = await fetch(`${base}/routines`, { headers })
        if (!res.ok) return { code: 1, out: `orq: erro ${res.status}` }
        const routines = (await res.json()) as {
          id: string
          name: string
          schedule: string
          target: string
          command: string
          enabled: boolean
        }[]
        const out = routines
          .map((r) => `${r.enabled ? 'on' : 'off'}\t${r.name}\t${r.schedule}\t${r.target}\t${r.command}\t${r.id}`)
          .join('\n')
        return { code: 0, out }
      }
      if (sub === 'add') {
        // comando = todas as palavras depois de nome/cron/alvo, juntas com espaço — permite
        // agendar algo como "git pull && npm test" sem precisar de aspas extras no shell.
        const [name, schedule, target, ...commandWords] = rest
        const command = commandWords.join(' ')
        const res = await fetch(`${base}/routines`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name, schedule, target, command })
        })
        return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : `orq: erro ${res.status}` }
      }
      if (sub === 'remove') {
        const [id] = rest
        const res = await fetch(`${base}/routines/remove`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ id })
        })
        return { code: res.ok ? 0 : 1, out: res.ok ? 'ok' : `orq: erro ${res.status}` }
      }
      return {
        code: 2,
        out:
          'orq: subcomando de routine desconhecido.\nUso: orq routine list | orq routine add "<nome>" "<cron>" "<alvo>" "<comando...>" | orq routine remove "<id>"'
      }
    }
    return {
      code: 2,
      out:
        'orq: comando desconhecido.\nUso: orq list | orq note write "<conteúdo>" | orq ask "<nome>" "<prompt>" | orq check "<nome>" | orq recruit "<nome>" "<preset>" ["<papel>"] | orq dismiss "<nome>" | orq connect "<A>" "<B>" | orq portal open|navigate "<nome>" "<url>" | orq portal click "<nome>" "<seletor>" | orq portal fill "<nome>" "<seletor>" "<texto>" | orq portal eval "<nome>" "<js>" | orq portal snapshot "<nome>" | orq routine list | orq routine add "<nome>" "<cron>" "<alvo>" "<comando...>" | orq routine remove "<id>"\nNota: recruit/connect/dismiss são best-effort por nome; comandos executam em sequência (seguro encadear), nunca em paralelo (sem &). Use "orq list" para confirmar a escalação antes de conectar. Automação de portal é fire-and-forget (open/click/fill/eval não confirmam sucesso); use "orq portal snapshot" para inspecionar o estado após. Rotinas: schedule é cron de 5 campos (minuto/hora/dia/mês/dia-da-semana) com granularidade de 1 minuto; toda rotina nasce habilitada.'
    }
  } catch (err) {
    return { code: 1, out: `orq: falha de conexão: ${String(err)}` }
  }
}
