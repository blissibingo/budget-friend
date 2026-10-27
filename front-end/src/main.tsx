import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import OverviewPrototype from './prototype/OverviewPrototype.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/prototype' ? <OverviewPrototype /> : <App />}
  </StrictMode>,
)
