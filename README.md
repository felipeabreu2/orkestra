# Orkestra

Canvas espacial para orquestrar agentes de codificação de IA — terminais reais, conectados entre si, coordenados de dentro do próprio terminal.

## O que é

O Orkestra é um app desktop (Electron) que trata múltiplos agentes de código de IA como uma equipe: cada agente roda num terminal real (via `node-pty`), posicionado livremente num canvas espacial (arrastar, redimensionar, zoom/pan), pode ser nomeado e conectado a outros agentes, e é coordenado por comandos que os próprios agentes disparam de dentro do terminal — sem sair da CLI.

Inspirado por ferramentas de orquestração de agentes, o Orkestra não embute nenhum provedor de LLM: ele orquestra CLIs de terceiros que já trazem sua própria IA (Claude Code, Codex CLI, Gemini CLI, ou um shell puro).

## Features

- **Terminais reais no canvas** — shells de verdade via `node-pty`, criados, arrastados, redimensionados e navegados com zoom/pan (canvas construído com [React Flow](https://reactflow.dev/)).
- **Notas** — sticky notes editáveis no canvas, para deixar contexto/instruções visíveis.
- **Conexões** — fios entre nós, desenhados arrastando de um handle a outro.
- **Persistência do canvas** — layout, notas e conexões salvos em `canvas.json` com autosave; fechar e reabrir o app restaura tudo (os shells são recriados do zero).
- **CLI `orq`** — injetada automaticamente no `PATH` de todo terminal do canvas, fala com um servidor HTTP local (ver [Arquitetura](#arquitetura)) para listar nós e interagir com o canvas.
- **Comunicação agente↔agente** — terminais têm nomes; `orq ask "<nome>" "<prompt>"` envia texto a outro terminal, `orq check "<nome>"` lê a saída recente dele.
- **Modo Maestro** — presets de agente (`Shell`, `Claude Code`, `Codex CLI`, `Gemini CLI`) com auto-run do comando na criação e papéis editáveis; um agente pode montar e coordenar sua própria equipe com `orq recruit "<nome>" "<preset>" ["<papel>"]`, `orq connect "<A>" "<B>"` e `orq dismiss "<nome>"`.
- **Portais** — um `<webview>` embutido e dirigível por comando: `orq portal open/navigate/click/fill/eval/snapshot "<nome>" ...` para automatizar ou inspecionar uma página web a partir de um terminal.
- **Rotinas** — um agendador cron interno; `orq routine add "<nome>" "<cron>" "<alvo>" "<comando>"` dispara comandos sozinho, num terminal alvo, no horário programado. Painel dedicado na UI.
- **Command palette** (`Cmd/Ctrl+K`) — busca nós e ações do canvas por texto, com navegação por teclado.
- **Segurança** — renderer sandboxed (`contextIsolation`, sem `nodeIntegration`); `node-pty`, git e acesso a arquivos só existem no processo main; o servidor de orquestração só escuta em loopback (`127.0.0.1`) e exige um token por sessão; o `<webview>` dos Portais roda com hardening adicional (nodeIntegration/preload removidos mesmo se algo tentar reanexá-los).

## Rodar em dev

Pré-requisitos: Node.js e npm.

```bash
npm install
npm run dev
```

Isso sobe o app em modo desenvolvimento (`electron-vite dev`), com hot-reload do renderer.

> **Nota (Macs Intel):** a aceleração de hardware do Chromium é desabilitada explicitamente no processo main (`app.disableHardwareAcceleration()`), porque em Macs Intel ela produz erros de driver EGL/GPU no console. A UI é 2D e não depende de aceleração — desabilitar não afeta a experiência, só silencia o ruído.

> **Nota (node-pty):** `node-pty` é um módulo nativo compilado contra o ABI do Electron (não o do Node do sistema). Se `npm run dev` falhar ao abrir um terminal por erro de módulo nativo, rode `npm run rebuild` (usa `@electron/rebuild`) e tente de novo.

Outros scripts úteis: `npm test` (Vitest), `npm run typecheck`, `npm run lint`.

## `orq` — CLI de orquestração

Todo terminal criado pelo Orkestra recebe, no seu próprio `PATH`, um comando `orq` — ele conversa com um servidor HTTP local que o app expõe (ver [Arquitetura](#arquitetura)), permitindo que um agente rodando dentro de um terminal do canvas enxergue e controle o resto do canvas sem sair da CLI.

Comandos disponíveis:

| Comando | O que faz |
|---|---|
| `orq list` | Lista os nós do canvas (terminais, notas, portais...). |
| `orq note write "<texto>"` | Escreve numa nota do canvas. |
| `orq ask "<nome>" "<prompt>"` | Envia texto a outro terminal, por nome. |
| `orq check "<nome>"` | Lê a saída recente de outro terminal. |
| `orq recruit "<nome>" "<preset>" ["<papel>"]` | Cria um terminal com um preset de agente (`shell`, `claude`, `codex`, `gemini`) e um papel opcional. |
| `orq connect "<A>" "<B>"` | Desenha uma conexão entre dois nós. |
| `orq dismiss "<nome>"` | Remove um terminal. |
| `orq portal open\|navigate "<nome>" "<url>"` | Navega um Portal para uma URL. |
| `orq portal click\|fill\|eval "<nome>" ...` | Interage com a página carregada num Portal. |
| `orq portal snapshot "<nome>"` | Lê a URL/título/texto atuais de um Portal. |
| `orq routine list\|add\|remove` | Lista, cria ou remove rotinas agendadas (cron). |

## Build

Ver [`docs/BUILD.md`](docs/BUILD.md) para compilar e empacotar o app (macOS/Windows/Linux), incluindo os passos que exigem recursos próprios do mantenedor (certificado de assinatura, notarização, repositório de releases).

## Arquitetura

O Orkestra segue a separação padrão de um app Electron: um processo **main** (Node.js) concentra tudo que é sensível — `node-pty` (os shells reais), acesso a sistema de arquivos (persistência do canvas) e o `OrchestrationServer`, um servidor HTTP que só escuta em `127.0.0.1` e exige um token aleatório gerado por sessão (header `x-orkestra-token`) para expor list/note/ask/check/recruit/connect/dismiss/portal/routines; um **preload** expõe apenas uma API restrita (`window.orkestra`) via `contextBridge`; e o **renderer**, sandboxed (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`), desenha o canvas (React Flow) e nunca acessa Node/FS/child_process diretamente. Isso mantém a superfície de ataque pequena mesmo com terminais reais e automação de navegador rodando dentro do app.

## Status

v1.0. O app roda, empacota e passa em toda a suíte de testes. Distribuição real (instaladores assinados, notarização no macOS, publicação de releases, builds Windows/Linux via CI) depende de recursos e configuração próprios do mantenedor — ver [`docs/BUILD.md`](docs/BUILD.md) para o que falta preencher.

## Licença

MIT — ver [`LICENSE`](LICENSE).
