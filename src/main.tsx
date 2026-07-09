import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { preloadPdfLogo } from './lib/pdf/logo'
import { registerPwa } from './lib/pwa'

// Warm the PDF logo cache so invoice / GRN / PO prints embed it without a wait.
void preloadPdfLogo()

registerPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
