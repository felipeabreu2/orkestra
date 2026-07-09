import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from './components/Canvas'

export function App(): JSX.Element {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
