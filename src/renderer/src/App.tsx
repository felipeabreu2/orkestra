import { TerminalNode } from './components/TerminalNode'

export function App(): JSX.Element {
  return (
    <div style={{ height: '100vh', background: '#1e1e1e', padding: 8, boxSizing: 'border-box' }}>
      <TerminalNode />
    </div>
  )
}
