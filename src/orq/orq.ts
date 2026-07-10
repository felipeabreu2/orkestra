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
    return {
      code: 2,
      out:
        'orq: comando desconhecido.\nUso: orq list | orq note write "<conteúdo>" | orq ask "<nome>" "<prompt>" | orq check "<nome>" | orq recruit "<nome>" "<preset>" ["<papel>"] | orq dismiss "<nome>" | orq connect "<A>" "<B>"\nNota: recruit/connect/dismiss são best-effort por nome; comandos executam em sequência (seguro encadear), nunca em paralelo (sem &). Use "orq list" para confirmar a escalação antes de conectar.'
    }
  } catch (err) {
    return { code: 1, out: `orq: falha de conexão: ${String(err)}` }
  }
}
