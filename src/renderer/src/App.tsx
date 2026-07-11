import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from './components/Canvas'
import { ProjectsSidebar } from './components/ProjectsSidebar'

// Layout (Fase 15 Task 3): menu de projetos fixo à esquerda + canvas ocupando o resto via flex.
// ReactFlowProvider precisa continuar envolvendo o Canvas (o CommandPalette usa useReactFlow) —
// ele também envolve a ProjectsSidebar, mas isso é inofensivo (a sidebar não usa React Flow).
export function App(): JSX.Element {
  return (
    <ReactFlowProvider>
      <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
        <ProjectsSidebar />
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <Canvas />
        </div>
      </div>
    </ReactFlowProvider>
  )
}
