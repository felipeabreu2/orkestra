import { Component, type ReactNode } from 'react'

// Isola crashes de render de uma subárvore (ex.: um nó do canvas). Sem isto, um erro em UM nó
// (como o antigo crash assíncrono do @xterm/addon-webgl) sobe pela árvore e derruba o React
// inteiro → tela totalmente preta. Com o boundary, o nó problemático mostra um fallback local e o
// resto do app (sidebar, canvas, outros nós) continua funcionando.
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' }

  static getDerivedStateFromError(err: unknown): { hasError: boolean; message: string } {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) }
  }

  componentDidCatch(err: unknown): void {
    // Continua útil em produção (vai para o log do processo via console-message) sem derrubar a UI.
    console.error('[ErrorBoundary]', err)
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback
    return (
      <div
        role="alert"
        style={{
          padding: 12,
          fontSize: 12,
          color: 'var(--err, #ff6b6b)',
          fontFamily: 'ui-monospace, Menlo, monospace',
          overflow: 'auto',
          height: '100%'
        }}
      >
        Falha ao renderizar este item.
        <br />
        <span style={{ opacity: 0.7 }}>{this.state.message}</span>
      </div>
    )
  }
}
