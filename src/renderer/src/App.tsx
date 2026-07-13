import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from './components/Canvas'
import { ProjectsSidebar } from './components/ProjectsSidebar'
import { ErrorBoundary } from './components/ErrorBoundary'

// Layout (Fase 15 Task 3): menu de projetos fixo à esquerda + canvas ocupando o resto via flex.
// ReactFlowProvider precisa continuar envolvendo o Canvas (o CommandPalette usa useReactFlow) —
// ele também envolve a ProjectsSidebar, mas isso é inofensivo (a sidebar não usa React Flow).
export function App(): JSX.Element {
  // Impede o Chromium de navegar para file:// ao soltar um arquivo em qualquer ponto da janela
  // (comportamento padrão do Electron, que substituiria o app pelo conteúdo do arquivo). O drop
  // DENTRO de um terminal é tratado antes, no TerminalNode (insere o caminho); este handler
  // global só neutraliza o resto.
  useEffect(() => {
    const prevent = (e: DragEvent): void => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])
  return (
    <ErrorBoundary>
      <ReactFlowProvider>
        <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
          <ProjectsSidebar />
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            <Canvas />
          </div>
        </div>
      </ReactFlowProvider>
    </ErrorBoundary>
  )
}
