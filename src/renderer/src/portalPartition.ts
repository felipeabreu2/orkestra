// Fase 25 (Task 1): partition de sessão de um portal (<webview partition="...">) — cada portal
// isolado ganha sua própria sessão persistente (cookies/login separados por nó, ex.: duas contas
// do mesmo serviço em dois portais). Um portal "linkado" (data.linkedTo aponta pro nodeId de outro
// portal) usa a MESMA partition do portal-fonte em vez da própria, compartilhando a sessão — é
// assim que dois nós enxergam o mesmo login. `persist:` no prefixo é o que faz o Electron manter a
// sessão em disco entre reinícios do app (sem o prefixo, a partition seria em memória/efêmera).
export function partitionForPortal(nodeId: string, linkedTo?: string): string {
  return `persist:portal-${linkedTo || nodeId}`
}
