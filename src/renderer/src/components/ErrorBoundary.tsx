import { Component, type ReactNode } from 'react'
import './ErrorBoundary.css'

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
      <div role="alert" className="ork-error-boundary">
        Falha ao renderizar este item.
        <br />
        <span className="ork-error-boundary-detail">{this.state.message}</span>
      </div>
    )
  }
}
