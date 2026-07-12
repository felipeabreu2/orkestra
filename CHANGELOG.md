# Changelog

Todas as mudanças notáveis do Orkestra. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2026-07-12

Primeira versão completa. Um canvas espacial em Electron para orquestrar agentes de código de IA (terminais, notas, portais e árvores de arquivos num canvas infinito), com uma CLI `orq` para os agentes coordenarem uns aos outros.

### Núcleo (fundação)

- **Canvas infinito** (React Flow) com nós de **terminal** (xterm.js + node-pty), **nota**, **portal** (webview) e **árvore de arquivos**.
- **Terminais-agente** com presets (Shell, Claude Code, Codex, Gemini), papel editável e comunicação agente↔agente.
- **CLI `orq`** (8 comandos) para os agentes recrutarem, conectarem, enviarem mensagens (`ask`, incl. `--wait` com detecção de ociosidade), lerem estado e dirigirem portais.
- **Persistência por projeto** (canvas por projeto, troca rápida por menu lateral, escrita atômica); cada projeto vinculado a uma **pasta** (os terminais abrem nela).
- **Segurança**: renderer isolado (`contextIsolation`/`sandbox`, sem `nodeIntegration`); servidor de orquestração só em `127.0.0.1` com token por sessão; git só via `execFile`; webviews endurecidos.

### Mapa de funcionalidades do produto de referência (Ondas 1–4)

- **Refino do canvas**: minimap, snap à grade, grupos de nós, alinhar/distribuir, atalhos.
- **Árvore de arquivos**: nó explorador (navegação lazy + status git + preview), somente-leitura.
- **Indicador de atenção do agente**: o terminal pisca quando o agente fica ocioso + notificação do SO; `Shift+A` pula ao próximo.
- **Notas em Markdown**: render com toggle editar/visualizar (parser próprio, sem dependências, sem XSS).
- **Conexões tipadas**: cor e badge por tipo de conexão (agente/cadeia/contexto/portal), com desconectar pelo badge.
- **Command palette contextual** (`Cmd+K`): ações por nó selecionado (renomear, papel, conectar/desconectar) e **perguntar ao agente** com preview do stream da resposta.
- **Portais com sessão isolada/linkável**: cada portal com cookies/login próprios (multi-conta), com opção de compartilhar sessão.
- **Papéis ricos**: papéis prontos (Líder/Dev/Revisor/Testador) com badge colorido, além de personalizado.
- **SSH remoto**: terminais que rodam numa máquina remota via `ssh` (validado no processo principal, sem injeção de shell), criados pela palette.

### Empacotamento

- `electron-builder` configurado para macOS (`dmg`/`zip`), Windows (`nsis`) e Linux (`AppImage`/`deb`); `node-pty` empacotado corretamente (smartUnpack).
- Auto-update via `electron-updater` (GitHub Releases), ativo apenas no app empacotado.
- CI (GitHub Actions) em matrix de 3 SOs rodando lint/typecheck/testes/build.

[1.0.0]: https://github.com/TODO-USER/orkestra/releases/tag/v1.0.0
