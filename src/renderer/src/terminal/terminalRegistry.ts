// Registry de ptyId por terminal (Fase 24 Task 1): o TerminalNode registra o ptyId do seu
// pty ao montar/spawnar (chaveado pelo node.id do React Flow) e remove ao desmontar. A paleta
// Cmd+K (Task 2) resolve nó selecionado -> node.id -> ptyId aqui para enviar um prompt ao agente
// do terminal e ler a resposta — mesmo padrão local-ao-renderer usado em portalRegistry.ts.
const terminals = new Map<string, string>()

export function registerTerminalPty(nodeId: string, ptyId: string): void {
  terminals.set(nodeId, ptyId)
}

export function unregisterTerminalPty(nodeId: string): void {
  terminals.delete(nodeId)
}

export function getTerminalPty(nodeId: string): string | undefined {
  return terminals.get(nodeId)
}
