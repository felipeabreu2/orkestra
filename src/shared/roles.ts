export interface Role {
  id: string
  label: string
  color: string
  hint: string
  // Instrução de arranque do agente — o "prompt" que molda o COMPORTAMENTO do papel (não só o
  // badge/cor). Consumido por buildRolePrompt (src/shared/rolePrompt.ts) e injetado no spawn do
  // agente (T2). Obrigatório: todo preset precisa dizer o que aquele papel faz.
  prompt: string
}

// Cor do papel = ACCENT DE PAPEL, nunca cor de ESTADO (§4.3 da linguagem de design). Antes os
// papéis reusavam --ok/--warn/--err, colidindo com o significado semântico de sucesso/aviso/erro
// (um "Testador" vermelho parecia um estado de erro). Agora cada papel usa um accent de papel
// dedicado (paper-*), separando "papel" de "estado". Líder permanece --accent (o regente/marca).
export const PRESET_ROLES: readonly Role[] = [
  {
    id: 'lider',
    label: 'Líder',
    color: 'var(--accent)',
    hint: 'Coordena os demais agentes e decide a estratégia.',
    prompt:
      'Você coordena os demais agentes deste workspace e define a estratégia. Delegue as tarefas, acompanhe o progresso e tome as decisões de arquitetura. Não implemente diretamente: oriente o Dev, o Revisor e o Testador e mantenha todos alinhados com o plano.'
  },
  {
    id: 'dev',
    label: 'Dev',
    color: 'var(--paper-teal)',
    hint: 'Implementa o código conforme o plano.',
    prompt:
      'Você implementa o código conforme o plano acordado. Faça mudanças focadas e coesas, rode os testes localmente e mantenha o escopo do que foi pedido; não altere o que não faz parte da tarefa.'
  },
  {
    id: 'revisor',
    label: 'Revisor',
    color: 'var(--paper-orange)',
    hint: 'Revisa o código em busca de bugs e melhorias.',
    prompt:
      'Você revisa criticamente o código em busca de bugs, casos de borda e riscos de segurança. Aponte problemas e sugira melhorias de forma objetiva; não implemente as correções você mesmo, descreva com clareza o que precisa mudar.'
  },
  {
    id: 'testador',
    label: 'Testador',
    color: 'var(--paper-pink)',
    hint: 'Escreve e executa os testes.',
    prompt:
      'Você escreve e executa testes cobrindo os casos de borda e os caminhos de erro. Garanta que a suíte passa, relate as falhas encontradas e priorize cobertura e prevenção de regressões.'
  },
  {
    id: 'docs',
    label: 'Docs',
    color: 'var(--paper-purple)',
    hint: 'Atualiza changelog e documentação.',
    prompt:
      'Você mantém a documentação e o changelog em dia com o que o time entrega. Escreva de forma clara e concisa, cobrindo o que mudou e como usar; não altere o código-fonte além dos arquivos de documentação.'
  }
]

export function roleMeta(role: string): { label: string; color: string; hint: string; prompt: string } {
  const norm = role.trim().toLowerCase()
  const p = PRESET_ROLES.find((r) => r.id === norm || r.label.toLowerCase() === norm)
  if (p) return { label: p.label, color: p.color, hint: p.hint, prompt: p.prompt }
  // Papel livre (ex.: "Arquiteto") não tem instrução → prompt vazio (buildRolePrompt não injeta nada).
  return { label: role.trim(), color: 'var(--text-2)', hint: '', prompt: '' }
}
