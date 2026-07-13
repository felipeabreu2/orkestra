# Onda 8 — Contexto automático do terminal (F03 lógica) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps em checkbox.

**Goal:** Ao ligar uma **saída** de nota/arquivo/site à **entrada** de um terminal, injetar o conteúdo do nó-fonte no prompt do agente automaticamente — **sem dar Enter** (o usuário revisa e envia).

**Architecture:** O gatilho é o `onConnect` (arrastar uma conexão). O `Canvas` envolve o `onConnect` do store com um handler que, se a edge nova é `note|file|portal → terminal`, monta um bloco de contexto e o escreve no pty do terminal (via `getTerminalPty` + `pty.write`, mesmo padrão do AskAgentPanel). A montagem do bloco é uma função pura testável; a extração de texto por tipo (HTML da nota, conteúdo do arquivo, URL do portal) fica no Canvas.

**Tech Stack:** React 18, `@xyflow/react` 12, zustand 5. Sem novas dependências.

## Global Constraints

- UI/comentários/commits em **português**.
- Teste: `buildContextBlock`/`htmlToText` → TDD (jsdom, pois `htmlToText` usa o DOM). O gatilho no Canvas → typecheck/lint/build + checkpoint (não há teste de componente no projeto).
- **Anti-duplicação:** o gatilho é o `onConnect` (uma vez por ligação criada). A hidratação de um projeto NÃO passa por `onConnect`, então o contexto não reaparece ao recarregar — sem flag persistida.
- **Sem Enter automático:** injeta só o texto no prompt; o usuário revisa e envia. Evita disparar comando/tokens sem querer.
- **Direção:** só injeta quando o terminal é o **alvo** (target) e a fonte é `note`/`file`/`portal` — coerente com "entrada esquerda/topo, saída direita/base". Ligar terminal→nota (agente escreve na nota) NÃO injeta (é o caminho inverso; fora de escopo).

---

### Task 1: `buildContextBlock` + `htmlToText` (funções puras)

**Files:**
- Create: `src/renderer/src/context/contextBlock.ts`
- Test: `src/renderer/src/context/contextBlock.test.ts`

**Interfaces:**
- Produces: `buildContextBlock(label: string, content: string): string`; `htmlToText(html: string): string`.

- [ ] **Step 1: Teste que falha** — `contextBlock.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildContextBlock, htmlToText } from './contextBlock'

describe('buildContextBlock', () => {
  it('monta um bloco rotulado, sem Enter final que dispare o comando', () => {
    const b = buildContextBlock('nota', 'faça X')
    expect(b).toBe('[contexto — nota]\nfaça X\n')
    expect(b.endsWith('\n')).toBe(true) // quebra de linha do texto, NÃO um Enter separado do comando
  })
  it('conteúdo vazio vira string vazia (nada a injetar)', () => {
    expect(buildContextBlock('nota', '   ')).toBe('')
  })
})

describe('htmlToText', () => {
  it('extrai o texto de HTML do editor', () => {
    expect(htmlToText('<p>oi <strong>mundo</strong></p>')).toBe('oi mundo')
  })
  it('html vazio vira string vazia', () => {
    expect(htmlToText('')).toBe('')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `contextBlock.ts`**
```ts
// Bloco de contexto injetado no prompt do agente quando um nó (nota/arquivo/site) é ligado a um
// terminal. Rotulado para o agente saber a origem. NÃO termina com um Enter que dispare o comando:
// o \n final é só a quebra do texto — o usuário revisa o prompt e envia quando quiser.
export function buildContextBlock(label: string, content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return ''
  return `[contexto — ${label}]\n${trimmed}\n`
}

// Texto simples a partir do HTML da nota (TipTap). Usa o DOM (renderer/jsdom); colapsa quebras
// excessivas e apara as pontas.
export function htmlToText(html: string): string {
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}
```

- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** `feat(context): buildContextBlock + htmlToText (Onda 8)`

---

### Task 2: Gatilho de injeção no `Canvas`

**Files:**
- Modify: `src/renderer/src/components/Canvas.tsx`

**Interfaces:**
- Consumes: `buildContextBlock`/`htmlToText` (T1); `getTerminalPty` (terminalRegistry); `window.orkestra.pty.write` / `filetree.read`; `onConnect` do store.

- [ ] **Step 1: Imports** — `import { buildContextBlock, htmlToText } from '../context/contextBlock'` e `import { getTerminalPty } from '../terminal/terminalRegistry'`. `Connection` já vem de `@xyflow/react` (adicionar ao import de tipos, se necessário).

- [ ] **Step 2: Handler que injeta** — dentro do componente, criar:
```tsx
  // Onda 8 (F03): ao ligar nota/arquivo/site → terminal, injeta o conteúdo do nó-fonte no prompt do
  // agente (sem Enter). Só quando o terminal é o ALVO (recebe contexto). Roda uma vez por ligação
  // (onConnect); a hidratação não passa por aqui, então não repete ao recarregar.
  const injectContext = async (connection: Connection): Promise<void> => {
    const nodes = useCanvasStore.getState().nodes
    const target = nodes.find((n) => n.id === connection.target)
    const source = nodes.find((n) => n.id === connection.source)
    if (target?.type !== 'terminal' || !source) return
    const ptyId = getTerminalPty(target.id)
    if (!ptyId) return
    let block = ''
    if (source.type === 'note') {
      block = buildContextBlock('nota', htmlToText((source.data as { html?: string }).html ?? ''))
    } else if (source.type === 'portal') {
      const d = source.data as { name?: string; url?: string }
      block = buildContextBlock(d.name ?? 'site', d.url ? `URL: ${d.url}` : '')
    } else if (source.type === 'file') {
      const d = source.data as { name?: string; path?: string }
      if (d.path) {
        try {
          const r = await window.orkestra.filetree.read(d.path)
          const content = r.binary ? '[arquivo binário]' : r.content.slice(0, 4000)
          block = buildContextBlock(d.name ?? 'arquivo', `${d.path}\n${content}`)
        } catch {
          block = buildContextBlock(d.name ?? 'arquivo', d.path)
        }
      }
    }
    if (block) window.orkestra.pty.write(ptyId, block)
  }

  const handleConnect = (connection: Connection): void => {
    onConnect(connection)
    void injectContext(connection)
  }
```

- [ ] **Step 3: Usar o handler** — no `<ReactFlow>`, trocar `onConnect={onConnect}` por `onConnect={handleConnect}`.

- [ ] **Step 4: typecheck + lint + build.**

- [ ] **Step 5: Checkpoint visual** — `npm run dev`:
  - Ter um terminal-agente rodando (ex.: Claude Code) e uma nota com texto.
  - Ligar a **saída** da nota à **entrada** do terminal → o texto da nota aparece no **prompt** do terminal (sem enviar). Revisar e apertar Enter para o agente usar.
  - Ligar um **site** (portal) → a URL entra no prompt. Ligar um **arquivo** → caminho + conteúdo entram.
  - Recarregar NÃO reinjeta (as conexões continuam, o contexto não reaparece).
  - Ligar terminal→nota (inverso) NÃO injeta nada.

- [ ] **Step 6: Commit** `feat(canvas): injeta contexto do no ligado no prompt do terminal (F03)`

---

## Self-Review

**Cobertura:** injeção de contexto ao ligar note/file/portal→terminal (T2), texto montado por função pura (T1), sem Enter, anti-duplicação por construção. ✓
**Placeholders:** nenhum.
**Type consistency:** `buildContextBlock`/`htmlToText` entre T1/T2; `getTerminalPty` existente; `Connection` do React Flow.
**Fora de escopo:** "criar terminal já ligado" via `orq connect` (não passa pelo onConnect da UI); agente escrever de volta na nota (caminho inverso); navegação web real do processo a partir de um portal.
