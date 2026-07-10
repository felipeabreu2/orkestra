export interface AgentPreset {
  id: string
  label: string
  command: string | null
}

export const PRESETS: AgentPreset[] = [
  { id: 'shell', label: 'Shell', command: null },
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'codex', label: 'Codex CLI', command: 'codex' },
  { id: 'gemini', label: 'Gemini CLI', command: 'gemini' }
]

export function presetById(id: string): AgentPreset | undefined {
  return PRESETS.find((p) => p.id === id)
}
