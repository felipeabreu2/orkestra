// T9 (Onda 3 dos Portais) — estado de portal com chave composta (projectId, name). Fecha o gap #8:
// os mapas `portalStates`/`portalConsoles` eram globais POR NOME, então um portal "Pesquisa" do
// projeto A respondia ao `orq portal snapshot` rodado no projeto B — resíduo cross-project, a mesma
// família de bug do incidente de corrupção que motivou o escopo de projeto do orq.
//
// Desenho: o renderer CARIMBA o projectId no payload (portal:state/portal:console) e a leitura no
// main resolve pelo resolveActiveProjectId() — o payload é hint de escrita, a AUTORIDADE de leitura
// continua sendo o projeto ativo do main (defesa em profundidade junto do guard 409 do servidor).
// projectId null (boot/legado, payload antigo) é um escopo próprio: casa só com leitura igualmente
// sem projeto — comportamento legado preservado sem vazar para projetos reais.
//
// Puro (Map + string), sem Electron: testável em unidade.
export class PortalStateStore<T> {
  private map = new Map<string, T>()

  // '\u0000' nunca aparece em ids de projeto (uuid) nem em nomes de portal digitados — concatenação
  // ingênua (`a`+`bc` === `ab`+`c`) não pode colidir escopos.
  private key(projectId: string | null, name: string): string {
    return `${projectId ?? ''}\u0000${name}`
  }

  set(projectId: string | null, name: string, value: T): void {
    this.map.set(this.key(projectId, name), value)
  }

  get(projectId: string | null, name: string): T | null {
    return this.map.get(this.key(projectId, name)) ?? null
  }

  // Limpeza ao remover um projeto: estados de portais de um projeto que deixou de existir não têm
  // mais leitor possível — sem isto ficariam no mapa até o fim do processo.
  clearProject(projectId: string): void {
    const prefix = `${projectId}\u0000`
    for (const key of [...this.map.keys()]) {
      if (key.startsWith(prefix)) this.map.delete(key)
    }
  }
}
