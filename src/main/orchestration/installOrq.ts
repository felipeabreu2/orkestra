import { mkdirSync, copyFileSync, chmodSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Texto de "onboarding" injetado no system prompt de TODO `claude` iniciado num terminal do
// Orkestra (ver o wrapper abaixo). Faz o agente entender, sozinho, que está no Orkestra e quais
// comandos `orq` tem à disposição — sem o usuário precisar instruir nada.
const ONBOARDING = `Você está rodando dentro do Orkestra — um canvas visual onde vários agentes de IA são orquestrados. Este terminal é um nó do canvas, e OUTROS BLOCOS podem estar conectados a você: notas (instruções e contexto), sites (portais navegáveis), arquivos e outros agentes.

Ferramentas do Orkestra — rode-as pela sua ferramenta de shell/Bash:
- orq context — lê o conteúdo de TODAS as notas, sites e arquivos conectados a você AGORA. As conexões e o conteúdo mudam em tempo real, então rode ao começar e sempre que precisar do contexto atualizado (ex.: depois que o usuário conecta/desconecta/edita um bloco).
- orq list — lista todos os nós do canvas (agentes, notas, portais) com nome e id.
- orq ask "<nome>" "<prompt>" — delega uma tarefa a outro agente do canvas (adicione --wait para aguardar a resposta).
- orq check "<nome>" — lê o output recente de outro agente.
- orq portal navigate "<nome>" "<url>" | click "<nome>" "<seletor>" | fill "<nome>" "<seletor>" "<texto>" | snapshot "<nome>" — navega e controla um site (portal) conectado, como você faria num navegador.

Sua PRIMEIRA ação deve ser rodar \`orq context\` para carregar o que está conectado a você.
`

// Wrapper que substitui `claude` no PATH dos terminais do Orkestra. Injeta o onboarding em TODA
// invocação (inclusive quando o usuário fecha e reabre o claude na mão). Acha o binário REAL do
// claude com o PATH SEM o diretório do Orkestra (ORKESTRA_REAL_PATH) para não chamar a si mesmo,
// mas o EXECUTA com o PATH atual (que contém o `orq`) — assim o agente consegue rodar os comandos
// orq de dentro da sessão. Passa o onboarding via --append-system-prompt (flag estável do Claude
// Code). Se o claude real não existir, sai com 127 (o preset shell/outros CLIs seguem intactos).
const CLAUDE_WRAPPER = `#!/bin/sh
real="$(PATH="\${ORKESTRA_REAL_PATH:-$PATH}" command -v claude 2>/dev/null)"
if [ -z "$real" ]; then
  echo "orkestra: 'claude' não encontrado no PATH — instale o Claude Code (https://claude.com/claude-code)." >&2
  exit 127
fi
onboard="$HOME/.orkestra/onboarding.txt"
if [ -f "$onboard" ]; then
  exec "$real" --append-system-prompt "$(cat "$onboard")" "$@"
else
  exec "$real" "$@"
fi
`

// Copia o orq compilado para ~/.orkestra/bin/orq e instala o onboarding + o wrapper `claude`.
// Retorna o diretório bin, para ser prefixado no PATH dos terminais spawnados.
// `platform` é injetável (default process.platform) só para teste do ramo Windows.
export function installOrq(compiledBinPath: string, platform: NodeJS.Platform = process.platform): string {
  const home = homedir()
  const orkestraDir = join(home, '.orkestra')
  const binDir = join(orkestraDir, 'bin')
  mkdirSync(binDir, { recursive: true })

  const dest = join(binDir, 'orq')
  copyFileSync(compiledBinPath, dest)
  chmodSync(dest, 0o755)

  // BLD-1/BLD-7 (auditoria 2026-07-14): no Windows o `orq` (bin.js com shebang #!/usr/bin/env node)
  // não roda como comando bare — cmd.exe procura orq.exe/.cmd/.bat via PATHEXT. Escreve um shim
  // orq.cmd (padrão npm) que invoca `node` sobre o arquivo copiado. %~dp0 é o diretório do próprio
  // .cmd; CRLF é a convenção de arquivos de lote do Windows. Só no Windows — no POSIX o shebang basta.
  if (platform === 'win32') {
    writeFileSync(join(binDir, 'orq.cmd'), '@echo off\r\nnode "%~dp0orq" %*\r\n', 'utf-8')
  }

  // Onboarding + wrapper do claude (best-effort: se falhar, o orq ainda funciona e o claude roda
  // sem onboarding). Reescritos a cada boot, então editar o texto acima basta para atualizar.
  // O wrapper `claude` é um script sh — no Windows ele é escrito mas não é usado (registerPtyIpc
  // cai no `claude` puro lá); um claude.cmd de Windows é um follow-up que precisa de máquina Windows.
  writeFileSync(join(orkestraDir, 'onboarding.txt'), ONBOARDING, 'utf-8')
  const claudeWrapper = join(binDir, 'claude')
  writeFileSync(claudeWrapper, CLAUDE_WRAPPER, 'utf-8')
  chmodSync(claudeWrapper, 0o755)

  return binDir
}
