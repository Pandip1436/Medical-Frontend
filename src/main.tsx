import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { preloadPdfLogo } from './lib/pdf/logo'
import { registerPwa } from './lib/pwa'
import { installChunkErrorRecovery } from './lib/chunkRecovery'

// First thing on boot: catch lazy-chunk failures from a stale build (a deploy
// removed the hashed chunks this shell was built against) and reload onto the
// current build instead of dead-ending on an error screen.
installChunkErrorRecovery()

// Warm the PDF logo cache so invoice / GRN / PO prints embed it without a wait.
void preloadPdfLogo()

registerPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
