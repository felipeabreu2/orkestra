import './styles/tokens.css'
import './styles/base.css'
import './styles/motion.css'
import './styles/scrollbars.css'
import 'motion-icons-react/style.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { loadTheme } from './theme'

// Aplica o tema salvo antes de renderizar (seta data-theme no <html> — sem flash de tema errado)
loadTheme()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
