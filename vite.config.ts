import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// SPA fallback note: this is a single-page app with HTML5 History routing.
// The host must rewrite every unknown path to /index.html.
//   - Netlify: public/_redirects (already configured)
//   - Vercel:  vercel.json (already configured)
//   - Nginx:   `try_files $uri /index.html;`
//   - Apache:  `FallbackResource /index.html`
//   - Cloud Run / static GCS bucket: configure 404 page = /index.html
// Vite's dev server handles this automatically.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
