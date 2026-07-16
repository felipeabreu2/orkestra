// Onda 3 · T9 — o que o watch de filesystem NÃO observa. Puro/testável; consumido pelo
// FileTreeWatcher (nenhum outro chamador — se algum helper daqui ficar órfão, é bug).
//
// Duas camadas, com propósitos MUITO diferentes — e a diferença foi medida, não suposta (probe de
// fs.watch em macOS/node 24, durante esta tarefa):
//
//  1. `filterWatchDirs` — quais DIRETÓRIOS chegam a receber um fs.watch. ESTA é a camada que evita a
//     tempestade. Cada watcher é um file descriptor; apontar um para `node_modules` (dezenas de
//     milhares de entradas) ou `.git` é caro e inútil.
//  2. `isIgnoredName` — quais EVENTOS, já dentro de um diretório observado, são descartados antes de
//     acordar o debounce. Camada MENOR do que parece — ver a medição abaixo.
//
// MEDIÇÃO (a razão de este comentário existir): com watch NÃO-recursivo, churn dentro de `.git`
// (index.lock criado/renomeado/apagado) e dentro de `node_modules` (milhares de arquivos) NÃO gera
// nenhum evento no watcher do diretório PAI — o SO só reporta as entradas diretas do dir observado.
// Ou seja: a proteção contra a tempestade do `git checkout`/`npm install` vem de NÃO OBSERVAR essas
// pastas (camada 1), não do filtro por nome. O filtro por nome não é teatro, mas o dia a dia dele é
// outro (ver IGNORED_FILE_* abaixo): `.orktmp` e `.DS_Store`, que são eventos REAIS e diretos no dir
// observado, mais o ruído de priming do node. Os nomes de diretório continuam aqui como defesa em
// profundidade (git init/clone criam `.git` como entrada direta; outras plataformas/semânticas
// podem reportar mais do que o macOS reporta).
export const IGNORED_DIR_NAMES: ReadonlySet<string> = new Set(['.git', 'node_modules'])

// Nomes de EVENTO ignorados (dentro de um dir já observado). Estes SÃO os que pagam o aluguel:
// - `.orktmp`: o sufixo do temporário da nossa própria escrita atômica (FileTreeService.write:
//   tmp -> fsync -> rename). MEDIDO: gravar `README.md.orktmp` gera um evento direto no dir
//   observado. Sem este ignore, todo save do editor embutido acordaria o watch com o nosso próprio
//   lixo — ruído autoinfligido.
// - `.DS_Store`: o Finder reescreve só de abrir/rolar a pasta no macOS (o app é macOS-primeiro).
//   Também é uma entrada direta do dir, e não é uma mudança do projeto.
const IGNORED_FILE_SUFFIXES = ['.orktmp']
const IGNORED_FILE_NAMES: ReadonlySet<string> = new Set(['.DS_Store'])

// Segmentos de um caminho, tolerante aos dois separadores. Windows não é alvo primário (node-pty),
// mas dividir por ambos é grátis e evita um ignore que silenciosamente não pega lá.
function segments(p: string): string[] {
  return p.split(/[\\/]/).filter((s) => s !== '' && s !== '.')
}

// Um EVENTO deve ser ignorado? `filename` vem do callback do fs.watch — normalmente o basename da
// entrada afetada, mas em watch recursivo (ou dependendo do SO) pode vir como caminho relativo,
// daí olharmos todos os segmentos. Nunca lança: nome vazio/estranho => não ignora (na dúvida,
// refrescar é o erro barato; ignorar é perder uma mudança de verdade).
export function isIgnoredName(filename: string): boolean {
  const parts = segments(filename)
  if (parts.length === 0) return false
  for (const part of parts) {
    if (IGNORED_DIR_NAMES.has(part)) return true
    if (IGNORED_FILE_NAMES.has(part)) return true
    if (IGNORED_FILE_SUFFIXES.some((suffix) => part.endsWith(suffix))) return true
  }
  return false
}

// Um DIRETÓRIO pode receber um fs.watch? Não, se QUALQUER segmento do caminho for ignorado — não
// basta olhar o basename: `<root>/node_modules/foo/src` é tão indesejável quanto `node_modules`.
export function isIgnoredWatchPath(dir: string): boolean {
  return segments(dir).some((part) => IGNORED_DIR_NAMES.has(part))
}

// Diretórios efetivamente observáveis: sem ignorados, sem duplicatas (a raiz pode reaparecer na
// lista de expandidos), preservando a ordem de entrada (determinismo nos testes e nos erros).
//
// Custo assumido (declarado, não acidental): se o usuário EXPANDIR `.git`/`node_modules` na árvore,
// aquele nível NÃO recebe auto-refresh — o botão "atualizar" continua funcionando ali. Trocar o
// auto-refresh de dois cantos que ninguém edita à mão por não derreter o canvas é o negócio certo.
export function filterWatchDirs(dirs: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const dir of dirs) {
    if (typeof dir !== 'string' || dir === '') continue
    if (isIgnoredWatchPath(dir)) continue
    if (seen.has(dir)) continue
    seen.add(dir)
    out.push(dir)
  }
  return out
}
